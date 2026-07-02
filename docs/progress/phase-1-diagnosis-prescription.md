# Phase 1: 诊断+处方

## Goal
诊断引擎 + 处方生成，三明治结构模板（PRD 第 8.2 节，第 3-4 周）

## Status
- complete

## Tasks
- [x] P1-T1 基准数据模型设计 → `src/lib/diagnosis/baseline.ts`
  - 4 种类型基准（plot/emotion/atmosphere/mixed）
  - 每维度含 mean/std/direction/label
- [x] P1-T2 诊断规则引擎 → `src/lib/diagnosis/engine.ts`
  - z-score 偏离检测，识别 2-3 薄弱点 + 1-2 提升机会
  - 输出含用户值/基准值/偏差百分比/严重程度
- [x] P1-T3 处方 prompt 设计 → `src/lib/prescription/generator.ts`
  - 严格遵守"三不原则"：不替写、不给唯一答案、不评判
  - 每建议含方向/适配性评分1-5/操作方法/参考案例/预期效果
- [x] P1-T4 反直觉发现模块 → `src/lib/diagnosis/counter-intuitive.ts`
  - 自评 vs 分析结果最大偏差对比（hookRating/tensionPosition/pace）
  - 无自评时降级为结构性反直觉发现
- [x] P1-T5 三步反馈管线编排 → `src/lib/feedback/pipeline.ts`
  - 拆解→诊断→处方 完整编排
  - 处方超时降级（Promise.race 30s），先返回拆解+诊断
- [x] P1-T7 降级机制实现 → `src/lib/feedback/pipeline.ts`
  - LLM 异常：返回已完成的步骤，失败步骤标记 error
  - 类型置信度<0.7：mixed + 通用基准
  - 处方超时：标记 loading，拆解+诊断正常返回
- [x] P1-T6 一致性监控脚本 → `tests/consistency-monitor.ts`
  - 支持 N 篇 × M 次配置
  - 数值维度用变异系数(CV)，枚举维度用一致率
  - 支持 OpenCode Zen 免费模型跑测（避免费用）

## 端到端验证结果
- 测试文章：test-1-suspense.txt（带自评）
- 类型识别：plot-driven，置信度 0.85 ✅
- 反直觉发现：1 条（钩子自评 5 分 vs 实际更弱）✅
- 诊断薄弱点：2 个（情绪高峰、人际冲突）✅
- 处方生成：2 个薄弱点 × 2-3 方向 = 5 条建议 ✅
- 总耗时：36s（拆解 11s + 处方 14s）
- 降级：未触发 ✅

## Phase Notes
- Decisions: 诊断用规则引擎（毫秒级），处方用 LLM（约 14s）
- LLM 兼容性: schema 全部改用 z.coerce 容错 LLM 字符串输出
- 免费测试: 支持 OpenCode Zen 免费模型（deepseek-v4-flash-free 等）
- 下一步: 进入 Phase 2 — 前端界面
