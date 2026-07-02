# Phase 1: 诊断+处方

## Goal
诊断引擎 + 处方生成，三明治结构模板（PRD 第 8.2 节，第 3-4 周）

## Status
- not-started

## Tasks
- [ ] P1-T1 基准数据模型设计（同类型基准：均值/标准差/分位数）
  - Priority: P0
  - Effort: M
  - Acceptance: 数据模型覆盖 14 维度的基准值存储
- [ ] P1-T2 诊断规则引擎（2-3 薄弱点 + 1-2 提升机会）
  - Priority: P0
  - Effort: L
  - Acceptance: 输出含用户值/基准值/偏差百分比/严重程度评分
- [ ] P1-T3 处方 prompt 设计（三不原则约束）
  - Priority: P0
  - Effort: L
  - Acceptance: 每建议含方向描述/适配性评分1-5/操作方法/参考案例/预期效果
- [ ] P1-T4 反直觉发现模块（自评 vs 分析最大偏差）
  - Priority: P0
  - Effort: M
  - Acceptance: 偏差识别逻辑正确，无自评时优雅降级
- [ ] P1-T5 三步反馈管线编排（含异步处方加载）
  - Priority: P0
  - Effort: M
  - Acceptance: 处方超时时先展示拆解+诊断，处方异步加载
- [ ] P1-T6 20 篇测试集扩充 + 一致性监控脚本
  - Priority: P0
  - Effort: L
  - Acceptance: 脚本输出核心维度一致性指标，目标 >85%
- [ ] P1-T7 降级机制实现（LLM 异常/mixed/处方超时）
  - Priority: P0
  - Effort: M
  - Acceptance: 覆盖 PRD 6.3 节拆文相关降级场景

## Phase Notes
- Decisions: 诊断用规则引擎（毫秒级），处方用 LLM（约 8s）
- Blockers: 无（依赖 Phase 0 完成）
- Resume point: 从 P1-T1 开始
