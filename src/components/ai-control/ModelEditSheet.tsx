"use client";

import { useState, useEffect } from "react";

/**
 * 新增 / 编辑 AI 模型配置浮层
 *
 * 底部弹起式，字段：名称 / 供应商 / Base URL / API Key / 模型标识 / 是否激活
 */

export interface AIModelFormData {
  id?: string;
  name: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

interface Props {
  /** 打开状态 */
  open: boolean;
  /** 编辑模式时传入已有数据；新增模式为 null */
  initial: AIModelFormData | null;
  /** 关闭回调 */
  onClose: () => void;
  /** 保存成功后回调（刷新列表 + 刷新缓存） */
  onSaved: () => void;
}

/** 供应商选项（datalist + 自定义） */
const PROVIDER_PRESETS = [
  { value: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com", model: "deepseek-chat" },
  { value: "opencode", label: "OpenCode Zen", baseURL: "https://opencode.ai/zen/v1", model: "deepseek-v4-flash-free" },
  { value: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { value: "custom", label: "自定义", baseURL: "", model: "" },
];

export function ModelEditSheet({ open, initial, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("deepseek");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 打开时灌入字段
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setProvider(initial.provider);
      setBaseURL(initial.baseURL);
      // 编辑模式下，apiKey 显示空（不回填明文，需重新输入或留空保持不变）
      setApiKey("");
      setModel(initial.model);
      setIsActive(initial.isActive);
    } else {
      setName("");
      setProvider("deepseek");
      setBaseURL(PROVIDER_PRESETS[0].baseURL);
      setApiKey("");
      setModel(PROVIDER_PRESETS[0].model);
      setIsActive(false);
    }
    setErrorMsg("");
  }, [open, initial]);

  // 选择供应商预设时自动填入 baseURL 和 model（仅新增模式 / 字段为空时）
  const handleProviderSelect = (value: string) => {
    setProvider(value);
    const preset = PROVIDER_PRESETS.find((p) => p.value === value);
    if (preset && preset.value !== "custom") {
      // 仅当字段为空或与另一个预设匹配时才覆盖（避免覆盖用户自定义内容）
      if (!baseURL || PROVIDER_PRESETS.some((p) => p.baseURL === baseURL)) {
        setBaseURL(preset.baseURL);
      }
      if (!model || PROVIDER_PRESETS.some((p) => p.model === model)) {
        setModel(preset.model);
      }
    }
  };

  const handleSave = async () => {
    setErrorMsg("");

    if (!name.trim() || !provider.trim() || !baseURL.trim() || !model.trim()) {
      setErrorMsg("请填写名称、供应商、Base URL、模型标识");
      return;
    }
    // 编辑模式下，apiKey 可留空（保持不变）；新增模式下必填
    if (!initial && !apiKey.trim()) {
      setErrorMsg("请填写 API Key");
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(initial?.id);
      const url = isEdit
        ? `/api/ai-models?id=${encodeURIComponent(initial!.id!)}`
        : "/api/ai-models";
      const method = isEdit ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        name: name.trim(),
        provider: provider.trim(),
        baseURL: baseURL.trim(),
        model: model.trim(),
        isActive,
      };
      // apiKey：新增必填，编辑时仅当用户输入了新值才提交
      if (apiKey.trim()) {
        body.apiKey = apiKey.trim();
      }

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setErrorMsg(data?.error || "保存失败，请重试");
        return;
      }

      // 如果是激活操作或编辑的是当前激活模型，触发后端缓存刷新
      if (isActive || initial?.isActive) {
        // 后端 getClient 有 10 秒 TTL，这里不强制刷新，等自然过期
        // 也可调用 /api/ai-models 的 activate action 显式触发
      }

      onSaved();
      onClose();
    } catch {
      setErrorMsg("网络异常，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/30 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "编辑模型" : "新增模型"}
    >
      <div
        className="w-full max-w-md rounded-t-lg border border-text/[0.06] bg-surface shadow-card sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 浮层头部 */}
        <div className="flex items-center justify-between border-b border-text/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            <div className="font-serif text-sm font-semibold text-text">
              {initial ? "编辑模型" : "新增模型"}
            </div>
            <div className="mt-0.5 truncate font-serif text-xs text-text-muted">
              {initial ? initial.name : "配置一个新的 AI 接入"}
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
          {/* 名称 */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="DeepSeek 主用"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {/* 供应商（datalist） */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              供应商
            </label>
            <input
              type="text"
              list="ai-provider-presets"
              value={provider}
              onChange={(e) => handleProviderSelect(e.target.value)}
              placeholder="deepseek"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
            <datalist id="ai-provider-presets">
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </datalist>
          </div>

          {/* Base URL */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              Base URL
            </label>
            <input
              type="url"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.deepseek.com"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              API Key {initial && <span className="text-text-muted/50">（留空保持不变）</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial ? "••••（已保存）" : "sk-xxxxxxxx"}
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {/* 模型标识 */}
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              模型标识
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {/* 设为激活 */}
          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-text/[0.2] accent-accent"
            />
            <span className="font-serif text-sm text-text">
              设为当前激活模型
            </span>
            {initial?.isActive && !isActive && (
              <span className="ml-auto font-mono text-[10px] text-text-muted/60">
                取消后无激活模型，将回退环境变量
              </span>
            )}
          </label>

          {errorMsg && (
            <div className="rounded-sm bg-[#9C4B3C]/[0.08] px-3 py-2 font-serif text-xs text-[#9C4B3C]">
              {errorMsg}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 border-t border-text/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 font-serif text-sm text-text-muted transition-colors hover:bg-bg-soft"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 font-serif text-sm text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
