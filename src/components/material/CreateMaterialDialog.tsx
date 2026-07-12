"use client";

import { useState } from "react";
import {
  createManualMaterial,
  type Material,
  type MaterialCategory,
} from "@/lib/material";

interface Props {
  folders: string[];
  onClose: () => void;
  onCreate: (material: Material, category: MaterialCategory) => boolean | Promise<boolean>;
}

const CATEGORY_OPTIONS: Array<{ value: MaterialCategory; label: string; hint: string }> = [
  { value: "character", label: "人设", hint: "人物模型、关系与人物弧光" },
  { value: "plot", label: "剧情", hint: "核心梗、冲突、反转与场景结构" },
  { value: "emotion", label: "情绪描写语录", hint: "句子、对白、氛围和情绪表达" },
  { value: "inspiration", label: "灵感", hint: "假设、跨领域联想与零散创意" },
];

export function CreateMaterialDialog({ folders, onClose, onCreate }: Props) {
  const [category, setCategory] = useState<MaterialCategory>("plot");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [folder, setFolder] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const normalizedContent = content.trim();
    const normalizedTitle = title.trim() || normalizedContent.slice(0, 32);
    if (!normalizedContent) {
      setError("请先填写素材内容。");
      return;
    }
    const material = createManualMaterial({
      category,
      title: normalizedTitle,
      content: normalizedContent,
      tags: tags
        .split(/[，,、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      folder: folder.trim() || undefined,
    });
    setSubmitting(true);
    try {
      const ok = await onCreate(material, category);
      if (!ok) {
        setError("素材没有成功保存，请检查存储空间后重试。");
        setSubmitting(false);
      }
    } catch {
      setError("素材没有成功保存，请检查存储空间后重试。");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-material-title"
        className="w-full max-w-xl rounded-3xl border border-text/[0.06] bg-surface p-6 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">New material</p>
            <h2 id="create-material-title" className="mt-1 font-serif text-2xl font-semibold text-text">
              新建素材
            </h2>
            <p className="mt-1 text-xs text-text-muted">保存后会立即进入素材库，也能在创作工作台被 AI 引用。</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text">
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <fieldset>
            <legend className="mb-2 text-xs text-text-muted">分类</legend>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                    category === option.value
                      ? "border-accent/35 bg-accent/[0.05]"
                      : "border-text/[0.06] bg-bg hover:border-accent/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="material-category"
                    value={option.value}
                    checked={category === option.value}
                    onChange={() => setCategory(option.value)}
                    className="sr-only"
                  />
                  <span className="block font-serif text-sm font-semibold text-text">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] text-text-muted">{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-xs text-text-muted">
            标题
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="不填则取正文前 32 个字"
              className="mt-1 w-full rounded-xl border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs text-text-muted">
            素材内容 <span className="text-primary">＊</span>
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (error) setError("");
              }}
              rows={6}
              placeholder="写下可复用的情节、人设、句子或灵感…"
              className="mt-1 w-full resize-y rounded-xl border border-text/[0.10] bg-bg px-3 py-2 font-serif text-sm leading-relaxed text-text outline-none focus:border-accent"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-text-muted">
              标签
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="用逗号分隔"
                className="mt-1 w-full rounded-xl border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs text-text-muted">
              文件夹
              <input
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                list="create-material-folders"
                placeholder="可新建文件夹"
                className="mt-1 w-full rounded-xl border border-text/[0.10] bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <datalist id="create-material-folders">
                {folders.map((item) => <option key={item} value={item} />)}
              </datalist>
            </label>
          </div>
          {error && <p role="alert" className="text-xs text-primary">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-text/[0.10] px-4 py-2 text-xs text-text-muted">
            取消
          </button>
          <button type="button" onClick={() => void submit()} disabled={submitting} className="rounded-full bg-primary px-5 py-2 text-xs text-text-inverse disabled:opacity-50">
            {submitting ? "保存中…" : "保存素材"}
          </button>
        </div>
      </div>
    </div>
  );
}
