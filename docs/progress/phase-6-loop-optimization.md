# Phase 6: 闭环优化

## Goal
闭环引导优化，个性化推荐，双篇对比完整版，团队版（PRD 第 8.2 节，第 23-28 周）

## Status
- not-started

## Tasks
- [ ] P6-T1 闭环引导优化（每环节"下一步"基于用户历史与诊断个性化）
  - Priority: P0
  - Effort: M
  - Acceptance: 引导点击率提升（A/B 验证）
- [ ] P6-T2 个性化拆文推荐（基于创作习惯与薄弱点推荐拆文素材）
  - Priority: P1
  - Effort: L
  - Acceptance: 推荐点击率 >30%
- [ ] P6-T3 个性化素材推荐（基于创作类型与常用结构）
  - Priority: P1
  - Effort: L
  - Acceptance: 素材采纳率提升
- [ ] P6-T4 个性化趋势推荐（基于用户关注题材过滤）
  - Priority: P1
  - Effort: M
  - Acceptance: 趋势元素收藏率 >15%
- [ ] P6-T5 团队版功能（多人协作/批量分析/自定义模板/共享素材库/团队看板）
  - Priority: P1
  - Effort: L
  - Acceptance: 团队空间隔离，权限管理完整
- [ ] P6-T6 闭环完成率监控仪表盘（北极星指标 + 各模块指标）
  - Priority: P0
  - Effort: M
  - Acceptance: 对齐 PRD 7.2 节指标体系
- [ ] P6-T7 L2 人工盲测对照流程（每月 5 篇抽样人工 vs AI）
  - Priority: P0
  - Effort: M
  - Acceptance: 盲测流程文档化，校准报告产出
- [ ] P6-T8 L3 用户体验评估持续收集（报告/素材/趋势评分）
  - Priority: P0
  - Effort: M
  - Acceptance: 评分收集覆盖所有模块
- [ ] P6-T9 性能优化（LLM 响应/前端 LCP/数据库查询）
  - Priority: P1
  - Effort: M
  - Acceptance: LCP <2s，拆解 <30s，处方 <8s
- [ ] P6-T10 上线前合规与法律终审（采集/版权/隐私）
  - Priority: P0
  - Effort: M
  - Acceptance: 法律评估报告落档，遗留项清零

## Phase Notes
- Decisions: 个性化推荐（P6-T2/T3/T4）可并行开发；团队版（P6-T5）独立分支
- Blockers: 上线前必须完成 P6-T10 合规终审
- Resume point: 从 P6-T1 与 P6-T6 并行开始
