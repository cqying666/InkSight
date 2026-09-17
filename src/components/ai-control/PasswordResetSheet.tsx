"use client";

import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  username: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

function validatePassword(pwd: string): string | null {
  if (pwd.length < 6) return "密码至少 6 位";
  if (!/[a-zA-Z]/.test(pwd)) return "密码需包含字母";
  if (!/[0-9]/.test(pwd)) return "密码需包含数字";
  return null;
}

export function PasswordResetSheet({ open, username, userId, onClose, onSaved }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirmPassword("");
    setErrorMsg("");
  }, [open, userId]);

  const handleSubmit = async () => {
    setErrorMsg("");

    const pwdErr = validatePassword(password);
    if (pwdErr) {
      setErrorMsg(pwdErr);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("两次输入的密码不一致");
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(
        `/api/admin/users?id=${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }
      );
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setErrorMsg(data?.error || "重置失败，请重试");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setErrorMsg("网络异常，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/30 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="重置密码"
    >
      <div
        className="w-full max-w-md rounded-t-lg border border-text/[0.06] bg-surface shadow-card sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-text/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            <div className="font-serif text-sm font-semibold text-text">重置密码</div>
            <div className="mt-0.5 truncate font-serif text-xs text-text-muted">
              账户「{username}」
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-muted/60 transition-colors hover:bg-bg-soft hover:text-text"
          >
            <span className="text-sm">✕</span>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              新密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位，包含字母和数字"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/70">
              确认密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full border-b border-text/[0.12] bg-transparent py-1 font-serif text-base text-text outline-none transition-colors placeholder:text-text-muted/30 focus:border-accent"
            />
          </div>

          {errorMsg && (
            <div className="rounded-sm bg-[#9C4B3C]/[0.08] px-3 py-2 font-serif text-xs text-[#9C4B3C]">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-text/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 font-serif text-sm text-text-muted transition-colors hover:bg-bg-soft"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 font-serif text-sm text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "提交中…" : "重置密码"}
          </button>
        </div>
      </div>
    </div>
  );
}