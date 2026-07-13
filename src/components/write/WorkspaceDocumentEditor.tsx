"use client";

import { useRef, useEffect, type ChangeEvent } from "react";

interface Props {
  value: string;
  placeholder: string;
  onChange: (value: string) => boolean;
  /** 面板标识，用于 AI 教练插入文本时定位编辑器 */
  panelId: string;
}

export function WorkspaceDocumentEditor({
  value,
  placeholder,
  onChange,
  panelId,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 自适应内容高度：内容变化时重新计算 textarea 高度，由外层容器统一滚动
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-6 py-6">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          data-panel={panelId}
          className="w-full resize-none bg-transparent font-serif text-[17px] leading-[1.9] text-text outline-none placeholder:text-text-muted/40"
        />
      </div>
    </div>
  );
}
