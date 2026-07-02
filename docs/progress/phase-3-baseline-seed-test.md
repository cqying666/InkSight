# Phase 3: 基准库+种子测试

## Goal
预拆 100 篇建基准库，30 人种子用户封闭测试（PRD 第 8.2 节，第 7-8 周）

## Status
- not-started

## Tasks
- [ ] P3-T1 100 篇预拆管道（批量上传→拆解→入库基准库）
  - Priority: P0
  - Effort: L
  - Acceptance: 100 篇拆解结果入库，基准值按类型聚合
- [ ] P3-T2 基准库聚合计算（按类型计算 14 维度均值/标准差/分位数）
  - Priority: P0
  - Effort: M
  - Acceptance: 基准数据可供诊断引擎查询
- [ ] P3-T3 双篇对比轻量版（用户作品 vs 参考作品，关键维度差异）
  - Priority: P0
  - Effort: M
  - Acceptance: 展示维度偏差与可视化对比
- [ ] P3-T4 用户账号系统（注册/登录/额度管理，免费版每月 3 篇）
  - Priority: P0
  - Effort: M
  - Acceptance: 免费额度用完触发付费引导（占位）
- [ ] P3-T5 报告导出功能（PDF/图片导出）
  - Priority: P1
  - Effort: M
  - Acceptance: 导出内容与页面一致
- [ ] P3-T6 L1 自动化稳定性测试管道（每周 20 篇×5 次）
  - Priority: P0
  - Effort: M
  - Acceptance: 自动跑测并输出一致性报告
- [ ] P3-T7 种子用户封闭测试（30 人，行为埋点+有用评分收集）
  - Priority: P0
  - Effort: L
  - Acceptance: 20+ 人主动拆第二篇，有用评分 >4 分
- [ ] P3-T8 测试反馈迭代（bug 修复与体验优化）
  - Priority: P0
  - Effort: M
  - Acceptance: P0 bug 清零，关键体验问题修复

## Phase Notes
- Decisions: 冷启动走"内容驱动"——公开拆文报告在创作者社群传播
- Blockers: 无（依赖 Phase 2 完成）
- Resume point: 从 P3-T1 开始（可与 P3-T4 账号系统并行）
