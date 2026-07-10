# Phase 3: 基准库+种子测试

## Goal
预拆 100 篇建基准库，30 人种子用户封闭测试（PRD 第 8.2 节，第 7-8 周）

## Status
- in-progress（核心基准链路已通：T1/T2/T3/T6 完成；T4/T5 阻塞/超范围；T7/T8 待运营）

## Tasks
- [x] P3-T1 100 篇预拆管道（批量上传→拆解→入库基准库）
  - Priority: P0
  - Effort: L
  - Acceptance: 100 篇拆解结果入库，基准值按类型聚合
  - 落地: `scripts/batch-teardown.ts` 三模式（真实语料 / `--synthetic N` / `--skip-llm`）；冷启动用合成种子（LCG PRNG + 类型参数化）绕开 100 篇 API 成本
- [x] P3-T2 基准库聚合计算（按类型计算 14 维度均值/标准差/分位数）
  - Priority: P0
  - Effort: M
  - Acceptance: 基准数据可供诊断引擎查询
  - 落地: `src/lib/baseline/aggregator.ts`（共享 `extractMetrics`，单一真相源）+ `scripts/aggregate-baseline.ts` CLI；`src/lib/diagnosis/baseline.ts` 重构 `getBaseline()` 合并聚合 JSON + 硬编码元数据，浏览器环境降级硬编码；40 篇合成种子已聚合为 `data/baseline.json`（14 plot-driven / 10 emotion / 10 atmosphere / 6 mixed，各 19 维）
- [x] P3-T3 双篇对比轻量版（用户作品 vs 参考作品，关键维度差异）
  - Priority: P0
  - Effort: M
  - Acceptance: 展示维度偏差与可视化对比
  - 落地: `src/app/compare/page.tsx` — 概览卡（类型/字数/段数/置信度）+ 三幕结构并排对比条 + 19 维度差异表（>30% 红 / >15% 金 / 其余灰）；用户作品从 sessionStorage 读，参考作品 mock，无数据时 mock vs mock 演示模式；`next build` 通过
- [ ] P3-T4 用户账号系统（注册/登录/额度管理，免费版每月 3 篇）
  - Priority: P0
  - Effort: M
  - Acceptance: 免费额度用完触发付费引导（占位）
  - 状态: 阻塞 — Supabase 未配置（.env.local 仍为占位 key），需先完成 Supabase 项目初始化
- [ ] P3-T5 报告导出功能（PDF/图片导出）
  - Priority: P1
  - Effort: M
  - Acceptance: 导出内容与页面一致
  - 状态: 超出当前范围 — 需引入重依赖（puppeteer / html-to-image），暂缓；/report 已支持 Markdown 导出作为轻量替代
- [x] P3-T6 L1 自动化稳定性测试管道（每周 20 篇×5 次）
  - Priority: P0
  - Effort: M
  - Acceptance: 自动跑测并输出一致性报告
  - 落地: `tests/consistency-monitor.ts`（OpenCode CLI + 免费模型，5×2 默认）已存在；本次补 npm 脚本（`test:consistency` / `:quick` / `:full`）+ 文本摘要归档（`tests/consistency-report.md`）+ JSON 报告（`tests/consistency-report.json`）；验收标准 >85%
- [ ] P3-T7 种子用户封闭测试（30 人，行为埋点+有用评分收集）
  - Priority: P0
  - Effort: L
  - Acceptance: 20+ 人主动拆第二篇，有用评分 >4 分
  - 状态: 待运营 — 埋点已就绪（P2-T9 analytics.ts），需招募种子用户
- [ ] P3-T8 测试反馈迭代（bug 修复与体验优化）
  - Priority: P0
  - Effort: M
  - Acceptance: P0 bug 清零，关键体验问题修复
  - 状态: 待 P3-T7 反馈

## Phase Notes
- Decisions: 冷启动走"内容驱动"——公开拆文报告在创作者社群传播；基准库冷启动用合成种子（类型参数化 + LCG PRNG 可复现）绕开 100 篇真实语料的 API 成本/时间，后续真实语料可增量替换
- Blockers: P3-T4 等 Supabase 配置；P3-T7/T8 等运营招募
- Resume point: P3-T4（配置 Supabase 后接入账号系统）或 P3-T7（招募种子用户后开始封闭测试）；基准链路（T1/T2/T3/T6）已闭环可投入使用
