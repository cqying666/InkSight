"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { splitParagraphs } from "@/lib/report/session";
import { parseFile, SUPPORTED_FORMAT_HINT } from "@/lib/report/file-parser";
import { trackEvent } from "@/lib/report/analytics";

const MIN_CHARS = 100;
const MAX_CHARS = 50_000;

const PARSER_LABEL: Record<string, string> = {
  text: "纯文本",
  rtf: "RTF 富文本",
  docx: "Word 文档",
  pdf: "PDF 文档",
  fallback: "文本（兜底）",
};

function errMsg(e: unknown, fallback = "未知错误"): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileFormat, setFileFormat] = useState<string | null>(null);
  const [fileParser, setFileParser] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasteFallback, setShowPasteFallback] = useState(false);

  const charCount = text.length;
  const paragraphs = splitParagraphs(text);

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setError(null);
    setParsing(true);
    setFileName(file.name);
    try {
      const result = await parseFile(file);
      setText(result.text);
      setFileFormat(result.format);
      setFileParser(result.parser);
      trackEvent("file_uploaded", {
        fileName: file.name,
        format: result.format,
        parser: result.parser,
        size: file.size,
        chars: result.text.length,
      });
    } catch (e) {
      const msg = errMsg(e, "文件解析失败");
      setParseError(msg);
      setText("");
      setFileFormat(null);
      setFileParser(null);
      trackEvent("file_parse_failed", { fileName: file.name, error: msg });
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const handleClear = () => {
    setText("");
    setFileName(null);
    setFileFormat(null);
    setFileParser(null);
    setParseError(null);
  };

  const handleSubmit = useCallback(() => {
    setError(null);

    if (charCount < MIN_CHARS) {
      setError(`文本过短，至少 ${MIN_CHARS} 字（当前 ${charCount} 字）`);
      return;
    }
    if (charCount > MAX_CHARS) {
      setError(
        `文本过长，上限 ${MAX_CHARS.toLocaleString()} 字（当前 ${charCount.toLocaleString()} 字）`
      );
      return;
    }

    setSubmitting(true);
    trackEvent("upload_submitted", {
      chars: charCount,
      paragraphs: paragraphs.length,
      format: fileFormat,
    });
    try {
      sessionStorage.setItem(
        "inksight:pending",
        JSON.stringify({ text, paragraphs, fileName })
      );
      router.push("/analyzing");
    } catch (e) {
      setError(errMsg(e, "提交失败"));
      setSubmitting(false);
    }
  }, [charCount, text, paragraphs, fileName, router, fileFormat]);

  const hasFile = fileName !== null && text.length > 0 && fileName !== "粘贴文本";

  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
        <header className="mb-8 border-b border-accent/40 pb-6">
          <h1 className="font-display text-title-xl font-bold text-text">
            上传小说，开始拆解
          </h1>
        </header>

        <section className="mb-8">
          {!hasFile ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex h-56 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
                dragOver
                  ? "border-accent bg-accent/5 scale-[1.01]"
                  : "border-accent/40 bg-bg-alt hover:border-accent hover:bg-bg-alt/80"
              }`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={onInputChange}
              />
              {parsing ? (
                <>
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <div className="mt-3 text-sm text-text">
                    正在解析 {fileName}…
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl text-accent">⬆</div>
                  <div className="mt-3 font-serif text-lg font-semibold text-text">
                    点击或拖拽文件到此处
                  </div>
                  <div className="mt-1 text-xs text-text-muted">
                    {SUPPORTED_FORMAT_HINT}
                  </div>
                </>
              )}
            </label>
          ) : (
            <div className="rounded-lg border border-accent/40 bg-bg-alt p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg text-accent">📄</span>
                    <span
                      className="truncate font-serif text-base font-semibold text-text"
                      title={fileName || ""}
                    >
                      {fileName}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-muted">
                    <span>
                      字数：<span className="text-text tabular-nums">{charCount.toLocaleString()}</span>
                    </span>
                    {fileParser && (
                      <span>
                        解析器：<span className="text-text">{PARSER_LABEL[fileParser] || fileParser}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="shrink-0 rounded-md border border-accent/40 px-2.5 py-1 text-xs text-text transition-all hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                >
                  重新上传
                </button>
              </div>
            </div>
          )}

          {parseError && (
            <div className="mt-3 rounded-lg border-l-4 border-danger/30 bg-danger/5 p-3 text-sm text-danger/90">
              {parseError}
            </div>
          )}

          {!hasFile && !parsing && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setShowPasteFallback((v) => !v)}
                className="text-xs text-text-muted underline transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-sm"
              >
                {showPasteFallback
                  ? "收起直接粘贴"
                  : "解析失败？直接粘贴文本"}
              </button>
              {showPasteFallback && (
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setFileName(e.target.value ? "粘贴文本" : null);
                    setFileFormat("txt");
                    setFileParser("text");
                    setParseError(null);
                  }}
                  placeholder="在此粘贴你的短篇小说全文…"
                  className="mt-3 h-56 w-full resize-y rounded-lg border border-accent/40 bg-bg-alt p-4 font-serif text-[15px] leading-[1.85] text-text outline-none transition-all placeholder:text-text-muted focus:border-accent focus:bg-bg focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-1"
                />
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="mb-4 rounded-lg border-l-4 border-danger/30 bg-danger/5 p-3 text-sm text-danger/90">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end border-t border-accent/40 pt-5">
          <button
            type="button"
            disabled={submitting || parsing || charCount < MIN_CHARS}
            onClick={handleSubmit}
            className="rounded-full border border-primary bg-primary px-8 py-2.5 font-serif text-inverse transition-all hover:bg-primary/90 hover:shadow-lg disabled:cursor-not-allowed disabled:border-text-muted disabled:bg-text-muted disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 shadow-md"
          >
            {submitting ? "提交中…" : "开始拆解 →"}
          </button>
        </div>
      </div>
    </main>
  );
}
