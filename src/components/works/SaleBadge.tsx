"use client";

import { isSold, formatPrice, type Sale } from "@/lib/write/sale";

/**
 * 作品售出状态徽章
 *
 * 已售出：实心印章红圆点 + 价格
 * 未售出：空心炭灰圆点（不加文字，降低焦虑）
 */
interface Props {
  sale?: Sale;
  /** 紧凑模式（用于卡片角落） */
  compact?: boolean;
}

export function SaleBadge({ sale, compact = false }: Props) {
  const sold = isSold(sale);
  if (sold) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-block rounded-full bg-accent ${
            compact ? "h-1.5 w-1.5" : "h-2 w-2"
          }`}
          aria-hidden="true"
        />
        <span className="font-mono text-[11px] font-medium tabular-nums text-accent">
          {formatPrice(sale!.price)}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" title="未售出">
      <span
        className={`inline-block rounded-full border border-text-muted/40 ${
          compact ? "h-1.5 w-1.5" : "h-2 w-2"
        }`}
        aria-hidden="true"
      />
      {!compact && (
        <span className="font-mono text-[10px] text-text-muted/50">未售出</span>
      )}
    </span>
  );
}
