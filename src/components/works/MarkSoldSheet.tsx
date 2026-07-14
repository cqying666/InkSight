"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type Sale } from "@/lib/write/sale";
import { updateWorkSale, clearWorkSale } from "@/lib/write/storage";
import { trackEvent } from "@/lib/report/analytics";

/**
 * 标记售出 / 修改售出信息浮层
 *
 * 底部弹起式，字段：单价（千字）/ 价格 / 字数 / 买家（datalist 平台 + 自定义） / 售出日期 / 备注
 * 单价、价格、字数三者联动：
 *  - 填单价 → 价格 = 单价 × 字数 / 1000
 *  - 填价格 → 单价 = 价格 × 1000 / 字数
 *  - 改字数 → 按最近编辑的字段重算对应值
 * 已售出作品可在此修改或取消售出标记。
 */
interface Props {
  /** 作品 id */
  workId: string;
  /** 作品标题（用于浮层标题展示） */
  workTitle: string;
  /** 作品字数（用于单价↔价格换算） */
  wordCount: number;
  /** 已有的售出信息（编辑模式时传入） */
  initialSale?: Sale;
  /** 打开状态 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 保存成功后回调（刷新列表） */
  onSaved?: () => void;
}

/** 把 timestamp 转成 yyyy-mm-dd 供 date input 使用 */
function toDateInput(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 把 date input 的 yyyy-mm-dd 转成当天 00:00 的 timestamp；无效输入回退到当前时间 */
function fromDateInput(value: string): number {
  if (!value) return Date.now();
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d).getTime();
}

export function MarkSoldSheet({
  workId,
  workTitle,
  wordCount,
  initialSale,
  open,
  onClose,
  onSaved,
}: Props) {
  const [price, setPrice] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [wordCountInput, setWordCountInput] = useState<string>("");
  const [buyer, setBuyer] = useState<string>("");
  const [soldDate, setSoldDate] = useState<string>(toDateInput(Date.now()));
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);
  // 追踪最近编辑的字段，避免单价↔价格循环计算
  const lastEdited = useRef<"price" | "unit" | null>(null);

  // 打开时用 initialSale 灌入字段
  useEffect(() => {
    if (!open) return;
    lastEdited.current = null;
    // 字数优先用已保存的计价字数，否则用系统检测字数
    const savedWc = initialSale?.wordCount;
    setWordCountInput(
      savedWc != null && savedWc > 0 ? String(savedWc) : wordCount > 0 ? String(wordCount) : ""
    );
    if (initialSale) {
      setPrice(String(initialSale.price || ""));
      setUnitPrice(initialSale.unitPrice ? String(initialSale.unitPrice) : "");
      setBuyer(initialSale.buyer || "");
      setSoldDate(toDateInput(initialSale.soldAt));
      setNote(initialSale.note || "");
    } else {
      setPrice("");
      setUnitPrice("");
      setBuyer("");
      setSoldDate(toDateInput(Date.now()));
      setNote("");
    }
    setError(false);
    // 价格输入聚焦
    setTimeout(() => priceRef.current?.focus(), 60);
  }, [open, initialSale, wordCount]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 当前用于换算的字数（实时跟随输入）
  const currentWc = parseFloat(wordCountInput) || 0;

  // 单价 → 价格：价格 = 单价 × 字数 / 1000
  const handleUnitPriceChange = useCallback(
    (value: string) => {
      lastEdited.current = "unit";
      setUnitPrice(value);
      const unit = parseFloat(value);
      const wc = parseFloat(wordCountInput) || 0;
      if (!Number.isNaN(unit) && unit >= 0 && wc > 0) {
        const calculated = (unit * wc) / 1000;
        setPrice(String(Math.round(calculated * 100) / 100));
      }
    },
    [wordCountInput]
  );

  // 价格 → 单价：单价 = 价格 × 1000 / 字数
  const handlePriceChange = useCallback(
    (value: string) => {
      lastEdited.current = "price";
      setPrice(value);
      const p = parseFloat(value);
      const wc = parseFloat(wordCountInput) || 0;
      if (!Number.isNaN(p) && p >= 0 && wc > 0) {
        const calculated = (p * 1000) / wc;
        setUnitPrice(String(Math.round(calculated * 100) / 100));
      }
    },
    [wordCountInput]
  );

  // 改字数 → 按最近编辑的字段重算对应值
  const handleWordCountChange = useCallback(
    (value: string) => {
      setWordCountInput(value);
      const wc = parseFloat(value) || 0;
      if (wc <= 0) return;
      if (lastEdited.current === "unit") {
        // 有单价 → 重算价格
        const unit = parseFloat(unitPrice);
        if (!Number.isNaN(unit) && unit >= 0) {
          const calculated = (unit * wc) / 1000;
          setPrice(String(Math.round(calculated * 100) / 100));
        }
      } else if (lastEdited.current === "price") {
        // 有价格 → 重算单价
        const p = parseFloat(price);
        if (!Number.isNaN(p) && p >= 0) {
          const calculated = (p * 1000) / wc;
          setUnitPrice(String(Math.round(calculated * 100) / 100));
        }
      } else {
        // 未指定编辑字段：优先用单价重算价格，否则用价格重算单价
        const unit = parseFloat(unitPrice);
        if (!Number.isNaN(unit) && unit > 0) {
          const calculated = (unit * wc) / 1000;
          setPrice(String(Math.round(calculated * 100) / 100));
        } else {
          const p = parseFloat(price);
          if (!Number.isNaN(p) && p > 0) {
            const calculated = (p * 1000) / wc;
            setUnitPrice(String(Math.round(calculated * 100) / 100));
          }
        }
      }
    },
    [unitPrice, price]
  );

  const handleSave = useCallback(async () => {
    const priceNum = parseFloat(price);
    if (Number.isNaN(priceNum) || priceNum <= 0) {
      setError(true);
      return;
    }
    if (!buyer.trim()) {
      setError(true);
      return;
    }
    const unitNum = parseFloat(unitPrice);
    const wcNum = parseFloat(wordCountInput);
    setSaving(true);
    const sale: Sale = {
      status: "sold",
      price: priceNum,
      buyer: buyer.trim(),
      soldAt: fromDateInput(soldDate),
      unitPrice: !Number.isNaN(unitNum) && unitNum > 0 ? unitNum : undefined,
      wordCount: !Number.isNaN(wcNum) && wcNum > 0 ? wcNum : undefined,
      note: note.trim() || undefined,
    };
    try {
      await updateWorkSale(workId, sale);
      trackEvent("work_marked_sold", { id: workId, price: priceNum });
      onSaved?.();
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [price, unitPrice, wordCountInput, buyer, soldDate, note, workId, onClose, onSaved]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await clearWorkSale(workId);
      trackEvent("work_sale_cleared", { id: workId });
      onSaved?.();
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [workId, onClose, onSaved]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/30 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="标记售出"
    >
      <div
        className="w-full max-w-md rounded-t-lg border border-text/[0.06] bg-surface shadow-card sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 浮层头部 */}
        <div className="flex items-center justify-between border-b border-text/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            <div className="font-serif text-sm font-semibold text-text">
              {initialSale ? "修改售出信息" : "标记售出"}
            </div>
            <div className="mt-0.5 truncate font-serif text-xs text-text-muted">
              {workTitle || "无题"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-muted/60 transition-colors hover:bg-bg-soft hover:text-text"
          >
            <span className="text-sm">✕</span>
          </button>
        </div>

        {/* 字段表单 */}
        <div className="space-y-4 px-5 py-4">
          {/* 单价 + 字数 + 价格（三列联动） */}
          <div className="grid grid-cols-3 gap-3">
            {/* 千字单价 */}
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                千字单价
              </label>
              <div className="flex items-baseline gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value)}
                  placeholder="60"
                  className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
                />
                <span className="whitespace-nowrap font-mono text-[9px] text-text-muted/60">
                  /千字
                </span>
              </div>
            </div>
            {/* 字数（可编辑，默认填入系统检测字数） */}
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                计价字数
              </label>
              <div className="flex items-baseline gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={wordCountInput}
                  onChange={(e) => handleWordCountChange(e.target.value)}
                  placeholder={wordCount > 0 ? String(wordCount) : "10000"}
                  className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
                />
                <span className="whitespace-nowrap font-mono text-[9px] text-text-muted/60">
                  字
                </span>
              </div>
            </div>
            {/* 售出价格 */}
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
                售出价格
              </label>
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-sm text-text-muted">¥</span>
                <input
                  ref={priceRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="600"
                  className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
                />
              </div>
            </div>
          </div>
          {/* 换算提示 */}
          {currentWc > 0 && (
            <p className="-mt-1 font-mono text-[10px] text-text-muted/50">
              按字数 {currentWc.toLocaleString()} 字换算 · 单价与价格自动联动
            </p>
          )}

          {/* 买家 */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              买家（平台）
            </label>
            <input
              type="text"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              placeholder="填写买家名称"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-sm text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {/* 售出日期 */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              售出日期
            </label>
            <input
              type="date"
              value={soldDate}
              onChange={(e) => setSoldDate(e.target.value)}
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-sm text-text outline-none transition-colors focus:border-accent"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              备注（选填）
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="编辑名 / 合同号 / 分成约定…"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-sm text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {error && (
            <p className="font-mono text-[10px] text-primary">
              请填写有效的价格和买家
            </p>
          )}
        </div>

        {/* 操作区 */}
        <div className="flex items-center justify-between gap-2 border-t border-text/[0.06] px-5 py-3">
          <div>
            {initialSale && (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="rounded-sm px-2 py-1 font-mono text-[10px] text-text-muted/60 transition-colors hover:text-primary disabled:opacity-50"
              >
                取消售出标记
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-text/[0.12] px-3 py-1.5 font-serif text-xs text-text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-primary px-4 py-1.5 font-serif text-xs text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中…" : "确认"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
