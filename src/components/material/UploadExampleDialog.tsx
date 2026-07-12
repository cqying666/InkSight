"use client";

import { useRef, useState } from "react";
import { createExample, upsertExample, type ExampleWork } from "@/lib/example";
import { parseFile, SUPPORTED_FORMAT_HINT } from "@/lib/report/file-parser";

interface Props {
  onClose: () => void;
  onSaved: (example: ExampleWork) => void;
}

export function UploadExampleDialog({ onClose, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [tags, setTags] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setParsing(true);
    setError("");
    try {
      const result = await parseFile(file);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setFileName(file.name);
      setText(result.text);
      setTitle((current) => current || baseName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件解析失败，请改用粘贴原文。");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!text.trim()) {
      setError("请上传文件或粘贴例文原文。");
      return;
    }
    setSaving(true);
    setError("");
    const example = createExample({
      title: title.trim() || fileName.replace(/\.[^.]+$/, "") || undefined,
      text,
      genre,
      tags: tags.split(/[，,、\s]+/).filter(Boolean),
    });
    const saved = await upsertExample(example);
    setSaving(false);
    if (!saved) {
      setError("例文没有成功保存，请稍后重试。");
      return;
    }
    onSaved(example);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-example-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-text/[0.06] bg-surface p-6 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Example</p>
            <h2 id="upload-example-title" className="mt-1 font-serif text-2xl font-semibold text-text">
              上传例文
            </h2>
            <p className="mt-1 text-xs text-text-muted">仅保存原文，不会自动拆文。保存后可在例文详情页继续拆解。</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text">✕</button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className="mt-5 w-full rounded-xl border border-dashed border-accent/35 bg-bg px-4 py-5 text-center text-sm text-text transition-colors hover:border-accent"
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          {parsing ? "正在解析文件…" : fileName || `选择文件，${SUPPORTED_FORMAT_HINT}`}
        </button>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-text-muted">
            书名
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="不填则使用文件名"
              className="mt-1 w-full rounded-xl border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>
          <label className="text-xs text-text-muted">
            题材
            <input
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              placeholder="例如：现言、悬疑、古言"
              className="mt-1 w-full rounded-xl border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="mt-3 block text-xs text-text-muted">
          标签
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="用逗号分隔，例如：追妻、身份反转"
            className="mt-1 w-full rounded-xl border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        <label className="mt-3 block text-xs text-text-muted">
          原文
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError("");
            }}
            rows={10}
            placeholder="也可以直接粘贴例文全文…"
            className="mt-1 w-full resize-y rounded-xl border border-text/[0.10] bg-bg px-4 py-3 font-serif text-sm leading-[1.85] text-text outline-none focus:border-accent"
          />
        </label>

        {error && <p role="alert" className="mt-3 text-xs text-primary">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-text/[0.10] px-4 py-2 text-xs text-text-muted">
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || parsing}
            className="rounded-full bg-primary px-5 py-2 text-xs text-text-inverse disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存到例文库"}
          </button>
        </div>
      </div>
    </div>
  );
}
