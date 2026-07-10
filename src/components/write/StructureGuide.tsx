"use client";

import { type WriteOutline, HOOK_LABELS, REVERSAL_LABELS, ENDING_LABELS } from "@/lib/write/outline";

/**
 * P5-T5 结构参考线
 *
 * PRD 5.7：大纲生成后，编辑器左侧以淡色标注结构位置
 * 参考线只是视觉辅助，不限制内容
 *
 * 实现：窄列 + 按百分比绝对定位的标记
 * - 三幕边界（建置/对抗/解决）
 * - 反转节点位置
 * - 情绪目标走势
 */

interface Props {
  outline: WriteOutline;
}

interface Marker {
  position: number; // 0-1
  label: string;
  sublabel?: string;
  color: string;
  dashed?: boolean;
}

export function StructureGuide({ outline }: Props) {
  // 构建标记列表
  const markers: Marker[] = [];

  // 三幕边界
  const setupEnd = outline.threeActRatio.setup;
  const confEnd = setupEnd + outline.threeActRatio.confrontation;

  markers.push({
    position: 0,
    label: "建置",
    sublabel: `${Math.round(setupEnd * 100)}%`,
    color: "rgba(124, 111, 102, 0.4)",
  });
  markers.push({
    position: setupEnd,
    label: "对抗",
    sublabel: `${Math.round(outline.threeActRatio.confrontation * 100)}%`,
    color: "rgba(124, 111, 102, 0.4)",
    dashed: true,
  });
  markers.push({
    position: confEnd,
    label: "解决",
    sublabel: `${Math.round(outline.threeActRatio.resolution * 100)}%`,
    color: "rgba(124, 111, 102, 0.4)",
    dashed: true,
  });

  // 反转节点
  outline.reversals.forEach((rev) => {
    markers.push({
      position: rev.position,
      label: REVERSAL_LABELS[rev.type],
      sublabel: rev.note || `${Math.round(rev.position * 100)}%`,
      color: "rgba(28, 28, 30, 0.5)",
    });
  });

  // 按位置排序
  markers.sort((a, b) => a.position - b.position);

  return (
    <div className="relative h-full w-12 flex-shrink-0 select-none border-r border-accent">
      {/* 主轴线 */}
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-accent" />

      {/* 标记 */}
      {markers.map((m, i) => (
        <div
          key={i}
          className="absolute left-0 w-full"
          style={{ top: `${Math.min(95, Math.max(0, m.position * 100))}%` }}
        >
          {/* 刻度线 */}
          <div
            className={`h-px w-full ${m.dashed ? "border-t border-dashed" : ""}`}
            style={{ borderColor: m.color }}
          />
          {/* 标签 */}
          <div
            className="mt-0.5 px-1 text-right font-serif"
            style={{ color: m.color, fontSize: "9px", lineHeight: "1.2" }}
          >
            <div className="font-medium">{m.label}</div>
            {m.sublabel && (
              <div className="opacity-70" style={{ fontSize: "8px" }}>
                {m.sublabel}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 顶部钩子标注 */}
      <div
        className="absolute left-0 top-0 w-full px-1 text-right"
        style={{ fontSize: "9px", color: "rgba(124, 111, 102, 0.3)" }}
      >
        <div className="font-serif">{HOOK_LABELS[outline.hookType]}</div>
      </div>

      {/* 底部结局标注 */}
      <div
        className="absolute bottom-0 left-0 w-full px-1 text-right"
        style={{ fontSize: "9px", color: "rgba(124, 111, 102, 0.3)" }}
      >
        <div className="font-serif">{ENDING_LABELS[outline.endingType]}</div>
      </div>
    </div>
  );
}
