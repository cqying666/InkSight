"use client";

import { useRef, useState } from "react";
import { parseFile, SUPPORTED_FORMAT_HINT } from "@/lib/report/file-parser";

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  text: string;
  format: string;
};

export type CoachInputProps = {
  placeholder?: string;
  onSubmit?: (text: string, files?: UploadedFile[]) => void;
  quickTags?: { label: string; onClick: () => void }[];
  compact?: boolean;
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
}: CoachInputProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    onSubmit?.(trimmed, files);
  };

  const parseAndAddFiles = async (fileList: File[]) => {
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
      } finally {
        setParsing(false);
      }
    }
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

      <form onSubmit={handleSubmit}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className="relative"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.text,.json,.csv,.tsv,.html,.htm,.xml,.log,.org,.rst,.rtf,.docx,.pdf,.ascii,.plain"
            onChange={handleFileSelect}
            className="hidden"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={10}
            className={`w-full resize-none rounded-2xl border bg-surface pb-14 pl-4 pr-14 pt-4 text-base leading-relaxed text-text placeholder:text-text-muted/50 outline-none transition-all focus:border-accent/40 focus:ring-2 focus:ring-accent/10 ${
              dragOver
                ? "border-accent ring-2 ring-accent/20"
                : "border-text/[0.10]"
            }`}
          />

          {/* 左下角：上传图标 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
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

          {/* 右下角：发送图标 */}
          <button
            type="submit"
            aria-label="发送"
            className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-text-inverse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:bg-text/20 disabled:text-text-muted/50"
            disabled={!text.trim() && files.length === 0}
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
            {text.length} 字{files.length > 0 && ` · ${files.length} 个文件`}
          </span>
        </div>
      </form>
    </div>
  );
}
