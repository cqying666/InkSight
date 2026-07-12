"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";

interface Props {
  title: string;
  eyebrow: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => boolean;
}

export function WorkspaceDocumentEditor({
  title,
  eyebrow,
  value,
  placeholder,
  onChange,
}: Props) {
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 自适应内容高度：内容变化时重新计算 textarea 高度，由外层容器统一滚动
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const saved = onChange(e.target.value);
    setSaveState(saved ? "saved" : "error");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-5">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/60">
            {eyebrow}
          </span>
          <h2 className="font-serif text-[15px] font-semibold text-text">{title}</h2>
        </div>
        <span className="font-mono text-[10px] text-text-muted">
          {saveState === "error"
            ? "保存失败，请检查浏览器存储"
            : saveState === "saved"
              ? "已自动保存"
              : "本地文档"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <textarea
            ref={taRef}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent font-serif text-[17px] leading-[1.9] text-text outline-none placeholder:text-text-muted/40"
          />
        </div>
      </div>
    </div>
  );
}
