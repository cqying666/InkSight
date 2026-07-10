"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { splitParagraphs } from "@/lib/report/session";
import { trackEvent } from "@/lib/report/analytics";

/**
 * P5-T10 写后分析一键触发
 *
 * PRD 5.7：用户完成作品后一键发起写后分析
 * 复用拆文管线，生成 X 光片报告
 *
 * 流程：提取编辑器文本 → 存 sessionStorage（pending）→ 跳 /analyzing → 跳 /report
 * 走 /analyzing 页面的已有流程，避免浏览器 fetch 长连接被 dev server 超时断开
 */

interface Props {
  getEditorHtml: () => string;
  getTitle: () => string;
}

export function WriteAnalysis({ getEditorHtml, getTitle }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(() => {
    setError(null);

    const html = getEditorHtml();
    const title = getTitle();

    // 临时 DOM 提取纯文本
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.textContent || "";

    if (text.trim().length < 100) {
      setError("作品内容太短（至少 100 字），无法有效分析");
      return;
    }

    trackEvent("write_analyzed", { title_length: title.length, text_length: text.length });

    // 存入 sessionStorage，交给 /analyzing 页面处理 API 调用
    const paragraphs = splitParagraphs(text);
    sessionStorage.setItem(
      "inksight:pending",
      JSON.stringify({ text, paragraphs })
    );

    router.push("/analyzing");
  }, [getEditorHtml, getTitle, router]);

  const viewDemoReport = useCallback(() => {
    sessionStorage.removeItem("inksight:pending");
    router.push("/report");
  }, [router]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAnalyze}
        className="w-full rounded-full border border-primary bg-primary px-4 py-2.5 font-serif text-sm text-inverse transition-colors hover:bg-primary"
      >
        写后分析 → 生成 X 光片
      </button>
      {error && (
        <div className="rounded-sm border border-primary/[0.16] bg-primary/[0.05] px-3 py-2 text-xs text-primary">
          <p>{error}</p>
          <button
            type="button"
            onClick={viewDemoReport}
            className="mt-1.5 underline hover:text-primary"
          >
            查看演示报告 →
          </button>
        </div>
      )}
      <p className="text-[10px] text-text-muted">
        复用拆文引擎对作品运行完整 14 维度分析，生成 X 光片报告
      </p>
    </div>
  );
}
