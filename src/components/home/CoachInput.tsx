"use client";

import { useRef, useState, useEffect } from "react";
import { parseFile, SUPPORTED_FORMAT_HINT } from "@/lib/report/file-parser";

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  text: string;
  format: string;
};

/** 从 AI 管理拉取的模型项 */
type ModelOption = {
  id: string;
  name: string;
  isActive: boolean;
};

const MODEL_STORAGE_KEY = "inksight:coach:model";

/** @ 引用的技能项 */
export type SkillRef = {
  id: string;
  label: string;
};

/** 可选技能列表（@ 引用） */
export const SKILL_OPTIONS: SkillRef[] = [
  { id: "teardown", label: "拆解对标文" },
  { id: "creation", label: "拆解并探索二创方向" },
  { id: "material", label: "素材转核心梗与框架" },
  { id: "guide", label: "写导语" },
  { id: "outline", label: "大纲生成" },
  { id: "detail-outline", label: "细纲生成" },
];

export type CoachInputProps = {
  placeholder?: string;
  onSubmit?: (
    text: string,
    files?: UploadedFile[],
    model?: string,
    skills?: SkillRef[],
    onAccepted?: () => void
  ) => void | boolean | Promise<void | boolean>;
  quickTags?: { label: string; onClick: () => void }[];
  compact?: boolean;
  disabled?: boolean;
  conversation?: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const FILE_ICON: Record<string, string> = {
  txt: "📄",
  md: "📝",
  markdown: "📝",
  docx: "📘",
  pdf: "📕",
  rtf: "📄",
  html: "🌐",
  htm: "🌐",
  json: "🗂️",
  csv: "📊",
};

function getFileIcon(format: string): string {
  return FILE_ICON[format.toLowerCase()] ?? "📄";
}

export function CoachInput({
  placeholder = "告诉 Coach 你想写什么、卡在哪里，或直接粘贴一段文字…",
  onSubmit,
  quickTags,
  compact = false,
  disabled = false,
  conversation = false,
}: CoachInputProps) {
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [awaitingAcceptance, setAwaitingAcceptance] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string>("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [skills, setSkills] = useState<SkillRef[]>([]);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);

  // 从 AI 管理拉取模型列表，并恢复用户选择
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/creation-models");
        if (!res.ok) return;
        const data: Array<{
          id: string;
          name: string;
          isActive: boolean;
        }> = await res.json();
        if (cancelled) return;
        const opts = data.map((m) => ({
          id: m.id,
          name: m.name,
          isActive: !!m.isActive,
        }));
        setModels(opts);
        // 恢复选择：localStorage 优先 → 激活模型 → 第一个
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(MODEL_STORAGE_KEY);
        } catch {
          // ignore
        }
        const exists = (id: string | null) =>
          !!id && opts.some((m) => m.id === id);
        if (exists(stored)) {
          setModel(stored as string);
        } else {
          const active = opts.find((m) => m.isActive);
          setModel(active?.id ?? opts[0]?.id ?? "");
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 点击外部关闭模型菜单
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

  // 点击外部关闭技能菜单
  useEffect(() => {
    if (!skillMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [skillMenuOpen]);

  const submit = async () => {
    if (disabled || submissionLock.current || parsing) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0 && skills.length === 0) return;
    submissionLock.current = true;
    setSubmitting(true);
    setAwaitingAcceptance(true);
    setParseError(null);
    let acknowledged = false;
    const acknowledge = () => {
      if (acknowledged) return;
      acknowledged = true;
      setText(""); setFiles([]); setSkills([]);
      setAwaitingAcceptance(false);
    };
    try {
      const accepted = await onSubmit?.(trimmed, files, model, skills, acknowledge);
      if (accepted === true) acknowledge();
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "发送失败，输入已保留");
    } finally { submissionLock.current = false; setSubmitting(false); setAwaitingAcceptance(false); }
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const handleModelSelect = (id: string) => {
    setModel(id);
    setModelMenuOpen(false);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  const handleSkillSelect = (skill: SkillRef) => {
    setSkills((prev) =>
      prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
    );
    setSkillMenuOpen(false);
  };

  const removeSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  const currentModel = models.find((m) => m.id === model);
  const currentModelLabel = currentModel?.name ?? "未配置";

  const parseAndAddFiles = async (fileList: File[]) => {
    if (disabled || submitting || parsing) return;
    setParseError(null);

    for (const file of fileList) {
      setParsing(true);
      try {
        const result = await parseFile(file);
        const uploaded: UploadedFile = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          size: file.size,
          text: result.text,
          format: result.format,
        };
        setFiles((prev) => [...prev, uploaded]);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : `解析 ${file.name} 失败`
        );
      }
    }
    setParsing(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    void parseAndAddFiles(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length === 0) return;
    void parseAndAddFiles(dropped);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="w-full">
      {quickTags && quickTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={tag.onClick}
              className="rounded-full border border-text/[0.08] bg-bg/60 px-3 py-1 text-xs text-text/70 transition-all hover:border-accent/30 hover:bg-bg hover:text-accent"
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}

      {/* 已上传文件卡片 */}
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative flex items-center gap-2 rounded-lg border border-text/[0.08] bg-bg px-3 py-2 text-xs shadow-sm transition-all hover:border-accent/30 hover:shadow-md"
            >
              <span className="text-base">{getFileIcon(file.format)}</span>
              <div className="min-w-0 max-w-[200px]">
                <p
                  className="truncate font-medium text-text"
                  title={file.name}
                >
                  {file.name}
                </p>
                <p className="text-text-muted">
                  {file.format.toUpperCase()} · {formatSize(file.size)} ·{" "}
                  {file.text.length.toLocaleString()} 字
                </p>
              </div>
              {/* 悬停删除按钮（光笔符号） */}
              <button
                type="button"
                onClick={() => removeFile(file.id)}
                aria-label={`删除 ${file.name}`}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-text/[0.10] bg-surface text-accent opacity-0 shadow-sm transition-all duration-200 hover:bg-accent hover:text-text-inverse group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 解析错误提示 */}
      {parseError && (
        <div className="mb-3 rounded-lg border-l-4 border-danger/30 bg-danger/5 p-3 text-xs text-danger/90">
          {parseError}
        </div>
      )}

      {awaitingAcceptance && <p role="status" className="mb-2 text-xs text-text-muted">正在发送…</p>}
      <form onSubmit={handleSubmit}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative rounded-2xl border bg-surface pb-12 transition-all focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/10 ${
            dragOver ? "border-accent ring-2 ring-accent/20" : "border-text/[0.10]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.text,.json,.csv,.tsv,.html,.htm,.xml,.log,.org,.rst,.rtf,.docx,.pdf,.ascii,.plain"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 已选技能卡片（输入框内顶部独立行，与文字流分离，不遮挡） */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-text/[0.06] px-3 py-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-1 rounded-md border border-accent/30 bg-bg px-2 py-1 text-[11px] text-accent shadow-sm"
                >
                  <span className="font-mono text-[9px] text-accent/60">@</span>
                  <span className="font-serif font-medium">{skill.label}</span>
                  <button
                    type="button"
                    onClick={() => removeSkill(skill.id)}
                    aria-label={`取消 ${skill.label}`}
                    className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-accent transition-all hover:bg-accent hover:text-text-inverse"
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M2 2l8 8M10 2l-8 8" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送，Shift+Enter 换行
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={placeholder}
            disabled={disabled || submitting}
            aria-label="创作需求"
            rows={compact ? 3 : 7}
            className="w-full resize-none rounded-2xl bg-transparent pb-3 pl-4 pr-4 pt-4 text-base leading-relaxed text-text placeholder:text-text-muted/50 outline-none"
          />

          {/* 左下角：上传图标 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing || disabled || submitting}
            title={SUPPORTED_FORMAT_HINT}
            aria-label="上传文件"
            className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all hover:bg-text/5 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            {parsing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </button>

          {/* 左下角：@ 技能引用按钮 */}
          <div ref={skillMenuRef} className={`absolute bottom-3 left-12 ${conversation ? "hidden" : ""}`}>
            <button
              type="button"
              onClick={() => setSkillMenuOpen((v) => !v)}
              aria-label="引用技能"
              aria-expanded={skillMenuOpen}
              title="引用技能"
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all hover:bg-text/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
              </svg>
            </button>
            {skillMenuOpen && (
              <div className="absolute bottom-10 left-0 z-20 min-w-[160px] overflow-hidden rounded-lg border border-text/[0.08] bg-surface py-1 shadow-card">
                <p className="px-3 py-1 text-[10px] text-text-muted">创作会话 · 理解资料与探索方向</p>
                {SKILL_OPTIONS.map((skill) => {
                  const selected = skills.some((s) => s.id === skill.id);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => handleSkillSelect(skill)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg/60 ${skill.id === "guide" ? "border-t border-text/10 mt-1 pt-2" : ""} ${
                        selected
                          ? "cursor-not-allowed text-text-muted/40"
                          : "text-text"
                      }`}
                      disabled={selected}
                    >
                      <span className="font-serif">{skill.label}</span>
                      {selected && (
                        <span className="font-mono text-[10px] text-text-muted/40">
                          已添加
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右下角：模型选择 + 发送图标 */}
          {/* 模型选择下拉（数据来自 AI 管理）*/}
          <div ref={modelMenuRef} className="absolute bottom-3 right-14">
            <button
              type="button"
              onClick={() => setModelMenuOpen((v) => !v)}
              aria-label="选择模型"
              aria-expanded={modelMenuOpen}
              className="flex h-8 items-center gap-1 rounded-full border border-text/[0.08] bg-bg/60 px-2.5 text-[11px] font-medium text-text/70 transition-all hover:border-accent/30 hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <span className="max-w-[100px] truncate font-mono sm:max-w-[180px]">{currentModelLabel}</span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="m3 4.5 3 3 3-3" />
              </svg>
            </button>
            {modelMenuOpen && (
              <div className="absolute bottom-10 right-0 z-20 min-w-[180px] overflow-hidden rounded-lg border border-text/[0.08] bg-surface py-1 shadow-card">
                {models.length === 0 ? (
                  <div className="px-3 py-2 text-center font-serif text-[11px] text-text-muted/60">
                    请先在「AI 管理」中添加模型
                  </div>
                ) : (
                  models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.isActive}
                      onClick={() => handleModelSelect(m.id)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                        m.isActive
                          ? "text-text hover:bg-bg/60"
                          : "cursor-not-allowed text-text-muted/40"
                      }`}
                    >
                      <span className="font-mono">{m.name}</span>
                      {m.id === model && m.isActive && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m2.5 6 2.5 2.5 4.5-5" />
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 发送按钮 */}
          <button
            type="submit"
            aria-label="发送"
            className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-text-inverse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:bg-text/20 disabled:text-text-muted/50"
            disabled={disabled || submitting || parsing || (!text.trim() && files.length === 0 && skills.length === 0)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>

          {dragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5">
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl text-accent">⬇</span>
                <span className="font-serif text-sm font-medium text-accent">
                  松手即可上传文件
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 字数统计 */}
        <div className="mt-1.5 flex justify-end">
          <span className="text-xs text-text-muted">
            {text.length} 字
            {files.length > 0 && ` · ${files.length} 个文件`}
            {skills.length > 0 && ` · ${skills.length} 个技能`}
          </span>
        </div>
      </form>
    </div>
  );
}
