"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildAnalysisMaterialCandidates,
  listFolders,
  upsertMaterial,
  type AnalysisMaterialCandidate,
} from "@/lib/material";
import type { AnalysisResult } from "@/lib/analysis/pipeline";
import { trackEvent } from "@/lib/report/analytics";

interface Props {
  analysis: AnalysisResult;
  reportId: string;
  disabled?: boolean;
}

export function MaterialDepositPanel({ analysis, reportId, disabled = false }: Props) {
  const candidates = useMemo(
    () => buildAnalysisMaterialCandidates(analysis, reportId),
    [analysis, reportId]
  );
  const grouped = useMemo(() => {
    const map = new Map<string, AnalysisMaterialCandidate[]>();
    for (const candidate of candidates) {
      const group = map.get(candidate.categoryLabel) ?? [];
      group.push(candidate);
      map.set(candidate.categoryLabel, group);
    }
    return Array.from(map.entries());
  }, [candidates]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const folders = listFolders();

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (items: AnalysisMaterialCandidate[]) => {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = items.every((item) => next.has(item.id));
      items.forEach((item) => {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      });
      return next;
    });
  };

  const saveSelected = () => {
    const chosen = candidates.filter((candidate) => selected.has(candidate.id));
    let persistedCount = 0;
    for (const candidate of chosen) {
      const persisted = upsertMaterial(
        {
          ...candidate.material,
          folder: folder.trim() || undefined,
          favorited: true,
        },
        { preserveUserEdits: true }
      );
      if (!persisted) {
        setSaveError("素材没有成功写入浏览器存储，请检查存储空间后重试。你的选择仍然保留。");
        return;
      }
      persistedCount += 1;
      trackEvent("material_saved", {
        source: "teardown",
        report_id: reportId,
        material_id: candidate.id,
        category: candidate.category,
      });
    }
    setSaveError(null);
    setSavedCount(persistedCount);
    trackEvent("material_deposit_confirmed", {
      report_id: reportId,
      count: persistedCount,
      folder: folder.trim(),
    });
  };

  if (disabled) {
    return (
      <section className="no-print mt-8 rounded-2xl border border-text/[0.06] bg-surface p-5 shadow-card">
        <h2 className="font-serif text-lg font-semibold text-text">沉淀到素材库</h2>
        <p className="mt-2 text-sm text-text-muted">
          演示报告不会写入个人素材库。上传并拆解你的小说后，可自行选择要沉淀的素材。
        </p>
      </section>
    );
  }

  if (dismissed) {
    return (
      <section className="no-print mt-8 rounded-2xl border border-text/[0.06] bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg font-semibold text-text">本次暂不沉淀</h2>
            <p className="mt-1 text-xs text-text-muted">报告仍会保留在当前会话中，你也可以稍后再选择。</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(false)}
            className="text-xs text-accent underline underline-offset-2"
          >
            重新选择
          </button>
        </div>
      </section>
    );
  }

  if (savedCount !== null) {
    return (
      <section className="no-print mt-8 rounded-2xl border border-accent/25 bg-accent/[0.04] p-5 shadow-card">
        <h2 className="font-serif text-lg font-semibold text-text">已沉淀 {savedCount} 条素材</h2>
        <p className="mt-1 text-xs text-text-muted">
          素材已按分类保存，重复保存会更新同一条记录，不会产生副本。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/material" className="rounded-full bg-primary px-4 py-2 text-xs text-text-inverse">
            查看素材库
          </Link>
          <Link href="/write" className="rounded-full border border-text/[0.10] px-4 py-2 text-xs text-text">
            带着素材去创作
          </Link>
          <button
            type="button"
            onClick={() => setSavedCount(null)}
            className="px-2 text-xs text-text-muted underline underline-offset-2"
          >
            调整选择
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="no-print mt-8 rounded-2xl border border-text/[0.06] bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">可选步骤</p>
          <h2 className="mt-1 font-serif text-xl font-semibold text-text">把拆文成果沉淀到素材库</h2>
          <p className="mt-1 text-xs text-text-muted">
            默认不自动保存。请选择真正值得复用的素材，再按分类入库。
          </p>
        </div>
        <span className="rounded-full bg-bg px-3 py-1 text-xs text-text-muted">
          已选 {selected.size}／{candidates.length}
        </span>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-5 rounded-xl bg-bg p-4 text-sm text-text-muted">
          本次分析没有生成可沉淀素材，报告其他内容仍可正常使用。
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {grouped.map(([label, items]) => (
            <div key={label} className="rounded-xl border border-text/[0.05] bg-bg/55 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-serif text-sm font-semibold text-text">{label}</h3>
                <button
                  type="button"
                  onClick={() => toggleGroup(items)}
                  className="text-[11px] text-accent underline underline-offset-2"
                >
                  {items.every((item) => selected.has(item.id)) ? "取消本类" : "选择本类"}
                </button>
              </div>
              <div className="space-y-2">
                {items.map((candidate) => (
                  <label
                    key={candidate.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg bg-surface px-3 py-2.5 transition-colors hover:bg-bg-soft"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(candidate.id)}
                      onChange={() => toggle(candidate.id)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block font-serif text-sm text-text">
                        {candidate.material.component?.summary}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-text-muted">
                        {candidate.material.component?.tags.join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-text/[0.06] pt-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-text-muted">
          文件夹（可选）
          <input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            list="material-deposit-folders"
            placeholder="例如：追妻剧情、强人设"
            className="mt-1 w-full rounded-lg border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <datalist id="material-deposit-folders">
            {folders.map((item) => <option key={item} value={item} />)}
          </datalist>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              trackEvent("material_deposit_skipped", { report_id: reportId });
            }}
            className="rounded-full border border-text/[0.10] px-4 py-2 text-xs text-text-muted"
          >
            暂不沉淀
          </button>
          <button
            type="button"
            onClick={saveSelected}
            disabled={selected.size === 0}
            className="rounded-full bg-primary px-5 py-2 text-xs text-text-inverse disabled:cursor-not-allowed disabled:opacity-35"
          >
            确认入库
          </button>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="mt-3 rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-primary">
          {saveError}
        </p>
      )}
    </section>
  );
}
