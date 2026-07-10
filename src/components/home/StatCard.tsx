"use client";

export type StatCardProps = {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
};

export function StatCard({ label, value, unit, hint }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-text/[0.05] bg-surface p-4 shadow-card">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted/60">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold tabular-nums text-text">{value}</span>
        {unit && <span className="text-xs text-text-muted/60">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-[10px] text-text-muted/60">{hint}</p>}
    </div>
  );
}
