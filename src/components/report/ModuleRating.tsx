"use client";

import { useState } from "react";
import { trackEvent, type AnalyticsEventName } from "@/lib/report/analytics";

/**
 * P6-T8 各模块评分收集组件
 *
 * PRD §6 L3 用户体验评估：评分收集覆盖所有模块。
 * 原 /report 页已有 report_rated，本组件复用同套 UI，
 * 扩展到 /trend /material /write 三模块。
 *
 * 事件名按模块区分（trend_rated / material_rated / write_rated），
 * 便于在仪表盘按模块计算"报告有用评分（均值）"。
 *
 * UI 与 /report 评分条一致：5 颗星 + 提交后致谢。
 */
interface Props {
  /** 模块标识，决定埋点事件名 */
  module: "trend" | "material" | "write";
  /** 模块中文名，用于致谢文案 */
  moduleLabel: string;
  /** 附加属性（如 type/is_mock 等） */
  extraProps?: Record<string, unknown>;
}

const EVENT_NAME_MAP: Record<Props["module"], AnalyticsEventName> = {
  trend: "trend_rated",
  material: "material_rated",
  write: "write_rated",
};

export function ModuleRating({ module, moduleLabel, extraProps }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (n: number) => {
    setRating(n);
    setSubmitted(true);
    trackEvent(EVENT_NAME_MAP[module], {
      rating: n,
      module,
      ...extraProps,
    });
  };

  return (
    <div className="mt-6 border-t border-accent pt-4 text-center">
      <div className="text-xs uppercase tracking-[0.15em] text-text-muted">
        这个{moduleLabel}对你有用吗？
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={submitted}
            onClick={() => !submitted && handleSubmit(n)}
            onMouseEnter={() => !submitted && setRating(n)}
            onMouseLeave={() => !submitted && setRating(null)}
            className={`font-serif text-2xl transition-colors ${
              rating !== null && n <= rating
                ? "text-primary"
                : "text-text-muted hover:text-accent"
            } ${submitted ? "cursor-default" : ""}`}
            aria-label={`评 ${n} 分`}
          >
            ★
          </button>
        ))}
      </div>
      {submitted && (
        <div className="mt-1.5 text-sm text-accent">
          ✓ 感谢评分 {rating}/5
        </div>
      )}
    </div>
  );
}
