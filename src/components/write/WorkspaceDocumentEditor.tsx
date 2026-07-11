"use client";

import { useState } from "react";

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-text/[0.06] px-6">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/60">
            {eyebrow}
          </span>
          <h2 className="font-serif text-base font-semibold text-text">{title}</h2>
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
        <div className="mx-auto h-full max-w-[760px] px-8 py-8">
          <textarea
            value={value}
            onChange={(event) => {
              const saved = onChange(event.target.value);
              setSaveState(saved ? "saved" : "error");
            }}
            placeholder={placeholder}
            className="min-h-[65vh] w-full resize-none rounded-xl border border-text/[0.06] bg-surface px-6 py-5 font-serif text-[16px] leading-[1.9] text-text shadow-card outline-none placeholder:text-text-muted/45 focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
          />
        </div>
      </div>
    </div>
  );
}
