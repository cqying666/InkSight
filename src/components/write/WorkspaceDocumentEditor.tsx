"use client";

import { useRef, useEffect, type ChangeEvent, type KeyboardEvent } from "react";

interface Props {
  value: string;
  placeholder: string;
  onChange: (value: string) => boolean;
  /** 面板标识，用于 AI 教练插入文本时定位编辑器 */
  panelId: string;
  /** 空格键唤起 AI 教练（仅在编辑器为空时触发） */
  onOpenCoach?: (anchor?: { top: number; left: number }) => void;
}

export function WorkspaceDocumentEditor({
  value,
  placeholder,
  onChange,
  panelId,
  onOpenCoach,
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

  // 空格键唤起 AI 教练：仅在编辑器为空且光标在起始位置时触发
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!onOpenCoach) return;
    const ta = e.currentTarget;
    // 仅当内容为空且光标在起始位置时触发
    if (ta.value.length === 0 && ta.selectionStart === 0) {
      e.preventDefault();
      const rect = ta.getBoundingClientRect();
      onOpenCoach({ top: rect.top + 24, left: rect.left + 16 });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-6 py-6">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          data-panel={panelId}
          className="w-full resize-none bg-transparent font-serif text-[17px] leading-[1.9] text-text outline-none placeholder:text-text-muted/40"
        />
      </div>
    </div>
  );
}
