"use client";

import Link from "next/link";

export type SceneCardProps = {
  href: string;
  title: string;
  desc: string;
  icon?: React.ReactNode;
  no?: string;
};

export function SceneCard({ href, title, desc, icon, no }: SceneCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-text/[0.05] bg-surface p-5 shadow-card transition-all duration-200 hover:border-accent/20 hover:shadow-float"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {icon && <span className="text-xl text-accent">{icon}</span>}
          <h3 className="font-serif text-base font-semibold text-text transition-colors group-hover:text-accent">
            {title}
          </h3>
        </div>
        {no && (
          <span className="font-mono text-xs font-semibold text-text-muted/30 transition-colors group-hover:text-accent">
            {no}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-text-muted/80">{desc}</p>
      <div className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
        <span>进入</span>
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}
