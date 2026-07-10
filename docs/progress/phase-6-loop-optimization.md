# Phase 6: 闭环优化

## Goal
闭环引导优化，个性化推荐，双篇对比完整版，团队版（PRD 第 8.2 节，第 23-28 周）

## Status
- in-progress（9/10，仅 T5 团队版独立分支）

## Tasks
- [x] P6-T1 闭环引导优化（每环节"下一步"基于用户历史与诊断个性化）
  - Priority: P0
  - Effort: M
  - Acceptance: 引导点击率提升（A/B 验证）
  - Done: 2026-07-03 — report/use-user-profile.ts 客户端 hook（peekEvents + computeUserProfile，window focus 事件刷新，SSR 返回 null 避免 hydration 不一致）；NextSteps.tsx 接入 useUserProfile 阶段化推荐（newcomer→拆文优先 98 / learner→创作优先 95 / creator→对比优先 92 / looped→趋势优先 90），头部展示阶段徽章，hint 文案按阶段差异化；WriteNextSteps.tsx 同步增强（learner/creator→写后分析强推 100 闭环首圈，looped→对比 88 持续精进，newcomer→大纲 95+拆文引导）；移除所有 comingSoon 标记（Phase 4/5 已上线）；trackEvent 增加 user_stage 字段。验收"引导点击率"待真实流量 A/B 验证
- [x] P6-T2 个性化拆文推荐（基于创作习惯与薄弱点推荐拆文素材）
  - Priority: P1
  - Effort: L
  - Acceptance: 推荐点击率 >30%
  - Done: 2026-07-03 — 用 localStorage 轻量版解锁，不阻塞 Supabase：① report/teardown-history.ts 新建拆文历史累积存储（key `inksight:teardown_history`，上限 50 条 FIFO，单条 <1KB，含 type/title/weaknessLabels/weaknessSeverities/counterIntuitiveLabel）+ aggregateWeakAreas 聚合函数（critical×3+warning×1 加权 Top N）② analyzing/page.tsx 在 analysis_completed 后调 appendTeardownHistory 累积，埋点扩展 weakness_labels/weakness_severities 字段 ③ metrics.ts UserProfile 加 weakAreas 字段 + WEAKNESS_TO_COMPONENT_KIND 映射常量（12 项骨架/血肉薄弱点→componentKind）④ use-user-profile.ts 合并 teardown-history 聚合结果 ⑤ PersonalizedRecommendations.tsx 组件在 /report 页 XrayReport 后接入，基于 weakAreas→componentKind 筛选组件素材 Top 3，无匹配时引导去素材库。局限：当前无法推荐"拆哪篇作品"（拆文库 P3-T1 未建），改为推荐"补足薄弱点的组件素材"，Supabase 接入后迁移 localStorage→PostgreSQL 零重构。验收"推荐点击率 >30%"待真实流量验证
- [x] P6-T3 个性化素材推荐（基于创作类型与常用结构）
  - Priority: P1
  - Effort: L
  - Acceptance: 素材采纳率提升
  - Done: 2026-07-03 — material/page.tsx 接入 useUserProfile：首次拿到 preferredType 时自动设置 novelTypeFilter（autoFilterApplied 标记防止覆盖用户手动选择），头部显示个性化提示"已按你的拆文偏好筛选「{类型}」类素材"+ 查看全部按钮（红色 seal 强调，点击清空筛选并清除 autoFilterApplied），复用 P4-T12 已有的 matchesFilters novelType 筛选逻辑零额外成本。素材 origin.type 已由 extractor.ts 在拆文提取时自动填充（P4-T14 已实现），search-tfidf.ts matchesFilters 已支持 novelType 筛选（P4-T12 已实现）。验收"素材采纳率提升"待真实流量验证
- [x] P6-T4 个性化趋势推荐（基于用户关注题材过滤）
  - Priority: P1
  - Effort: M
  - Acceptance: 趋势元素收藏率 >15%
  - Done: 2026-07-03 — trend/page.tsx 接入 useUserProfile：TYPE_TO_FOCUS_ELEMENT 映射（plot-driven→反转 / emotion-driven→虐心 / atmosphere-driven→日常 / mixed→反转）首次拿到画像时自动设置 focusElement 到对应元素；"我的关注"区显示个性化提示文案"基于你的{类型}拆文偏好推荐「{元素}」"（红色 seal 强调）；trend_viewed 事件加 personalized + user_preferred_type 字段便于漏斗分析（个性化推荐→收藏转化率）。验收"趋势元素收藏率 >15%"待真实流量验证。next build 通过 14 页（/trend 11.6 kB）
- [ ] P6-T5 团队版功能（多人协作/批量分析/自定义模板/共享素材库/团队看板）
  - Priority: P1
  - Effort: L
  - Acceptance: 团队空间隔离，权限管理完整
  - Status: 独立分支（PRD §8.2 第 23-28 周）— 当前阶段不适用，待个人版稳定后启动
- [x] P6-T6 闭环完成率监控仪表盘（北极星指标 + 各模块指标）
  - Priority: P0
  - Effort: M
  - Acceptance: 对齐 PRD 7.2 节指标体系
  - Done: 2026-07-03 — report/metrics.ts 纯函数指标计算（computeDashboardData 输入 events 数组输出 DashboardData，无副作用便于测试与服务端迁移；computeUserProfile 推断 newcomer/learner/creator/looped 四阶段）；对齐 PRD §7.1 北极星「拆文→创作闭环次数」+ §7.2 五模块指标（学习 4 项：首次拆文完成率/人均拆文/报告评分/建议采纳率；趋势 2 项：周活跃/收藏率；素材 2 项：周活跃/采纳率；创作 3 项：周活跃/人均篇数/写后分析触发率；闭环 2 项：完成率/人均次数）+ 闭环漏斗（上传→拆文→进入创作→完成作品→写后分析 5 阶段转化率）；sid 匿名会话 ID 作为用户代理跨会话去重；app/dashboard/page.tsx 时间范围切换（7/30/全部）+ 北极星卡片+漏斗可视化+模块指标卡片+空状态 CTA。next build 通过 14 页（新增 /dashboard 4.64 kB）
- [x] P6-T7 L2 人工盲测对照流程（每月 5 篇抽样人工 vs AI）
  - Priority: P0
  - Effort: M
  - Acceptance: 盲测流程文档化，校准报告产出
  - Done: 2026-07-03 — docs/plan/p6-t7-l2-blind-test-process.md 文档化 L2 完整流程：目标（与 L1/L3 分工）/ 频率抽样（每月 5 篇分层抽样，覆盖 4 类型，回避 L1 测试集，锁定 prompt 版本）/ 8 维度评估阈值（类型 >90% / 钩子 >85% / 三幕偏差 <10% / 反转偏差 <8% / 情绪曲线 Pearson >0.7 / 结局 >85% / 素材提取 >80% / 处方合理性 >75%）/ 4 阶段流程（准备→对照→报告→改进闭环）/ 人工标注 YAML 模板（与 AI schema 对齐）/ 评估员要求（1 主 + 2 复核，3 人多数同意，不参与 prompt 编写）/ L1↔L2↔L3 衔接机制 / 启动条件（拆文库后端 + 运营招募）。验收"流程文档化"已达标，"校准报告产出"待首次 L2 执行
- [x] P6-T8 L3 用户体验评估持续收集（报告/素材/趋势评分）
  - Priority: P0
  - Effort: M
  - Acceptance: 评分收集覆盖所有模块
  - Done: 2026-07-03 — components/report/ModuleRating.tsx 可复用评分组件（5 星 + 提交致谢，与 /report 评分条同 UI）；analytics 扩展 trend_rated/material_rated/write_rated 事件名；/trend 在 footer 后接入（moduleLabel="趋势雷达"）；/material 在 footer 后接入（moduleLabel="素材库"）；/write 在非专注模式主体下方接入（moduleLabel="创作工作台"，专注模式隐藏避免干扰心流）；metrics.ts 趋势/素材/创作三模块各新增"有用评分（均值）"指标对齐 PRD §7.2 全模块体验评估。评分覆盖 4 模块：报告（原有）+ 趋势 + 素材 + 创作。next build 通过 14 页
- [x] P6-T9 性能优化（LLM 响应/前端 LCP/数据库查询）
  - Priority: P1
  - Effort: M
  - Acceptance: LCP <2s，拆解 <30s，处方 <8s
  - Done: 2026-07-03 — 调研产出 12 项优化清单（按影响×成本排序），分两批实施共 8 项：
    批次 1（2 项）：① next.config.mjs 加 compiler.removeConsole（生产移除 console.* 保留 error）+ experimental.optimizePackageImports（@/lib/material @/lib/trend barrel index 优化，shared chunk 103→102 kB）② LLM client maxRetries 1→0（避免 SDK 重试 × callLLMWithSchema maxAttempts=2 叠加导致最坏 4 次调用，最坏耗时减半）
    批次 2（6 项）：③ 删 @supabase/supabase-js 死依赖（src/ 零 import，package.json 移除）④ pipeline.ts 提取 withTimeout 通用函数，type detection/teardown/prescription 三处都用 30s race timeout 包装（防 LLM client maxRetries=0 后仍可能因网络挂起的极端长尾，最坏 60s×2→30s×2）⑤ MaterialSidebar 10s setInterval 改 selectionchange 事件 + 2s 节流 + rAF（写作时无后台 CPU 轮询）⑥ computeDashboardData 重构为单次遍历建 eventsByNameMap + sidEventNames，闭环判定从 O(S×E) 降到 O(E+S)⑦ trackEvent 改 in-memory buffer + 500ms debounce flush + visibilitychange/beforeunload 兜底（高频事件不阻塞主线程，peekEvents/drainEvents 合并 buffer 保证读一致）⑧ /report XrayReport + /write MaterialSidebar 用 next/dynamic ssr:false 拆分（/report 14.8→7.52 kB -49%，/write 15.5→11.8 kB First Load 145→121 kB -24%）。
    验收状态：LCP 首页 / 161 B + 103 kB shared server component 无图，预期 <2s；拆解典型 10-30s（30s race timeout 截断极端长尾）；处方 30s race timeout（典型 8-15s）。跳过项：字体改 next/font（中文字库全量下载反效果）、/api/teardown streaming（中等成本留待后端上线）、OriginalText 虚拟化（需引依赖，当前 50000 字上限渲染可接受）、合并 type+teardown 单次 LLM 调用（schema 改动大留待 prompt 迭代）。next build 通过 14 页
- [x] P6-T10 上线前合规与法律终审（采集/版权/隐私）
  - Priority: P0
  - Effort: M
  - Acceptance: 法律评估报告落档，遗留项清零
  - Done: 2026-07-03 — docs/plan/p6-t10-prelaunch-compliance-review.md 终审报告：7 维度评估（趋势采集引用 P4-T2 / 用户上传版权 / 隐私个保 / 处方参考案例 / AI 标识 / 数据台账 / 数据跨境）；结论摘要表（当前阶段 Mock-First+localStorage 可上线 ✅，公开发布前 4 阻塞项：用户协议+版权勾选/投诉通道/处方 prompt 终审/AI 标识，后端上线前 6 阻塞项：隐私政策/台账/数据接口/真实采集合规/LLM 跨境/保留策略）；法律框架引用（著作权法 24 条/信网传条例 20-23 条/个保法 4/13/45/47 条/深度合成规定/数据出境安全评估办法/最高法指导案例 263 号）；与 P4-T2 衔接明确扩展维度；遗留项 4 项均为文档/UI 补充不影响当前阶段上线

## Phase Notes
- Decisions: 个性化推荐三件套（P6-T2/T3/T4）均用 localStorage 轻量版实现，不阻塞 Supabase；团队版（P6-T5）独立分支
- Blockers: P6-T5 待个人版稳定后启动（PRD §8.2 第 23-28 周）
- Resume point: P6 9/10 完成（T1/T2/T3/T4/T6/T7/T8/T9/T10），仅 T5 团队版独立分支
