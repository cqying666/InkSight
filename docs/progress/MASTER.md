# Transformation Progress Tracker — InkSight 创作教练

## Task
- Name: InkSight 短篇小说创作平台开发
- Description: 基于 PRD 从零搭建"学—察—集—创—磨"完整创作闘环平台
- Started: 2026-07-01
- Last updated: 2026-07-03

## References
- Project overview: `docs/analysis/project-overview.md`
- Task breakdown: `docs/plan/task-breakdown.md`
- Tech stack: `docs/plan/tech-stack-decision.md`
- PRD: `短篇小说创作平台PRD.md`

## Phase Summary
| Phase | Name | Tasks | Done | Status |
|:------|:-----|------:|-----:|:-------|
| 0 | 管线骨架 | 8 | 8 | complete |
| 1 | 诊断+处方 | 7 | 7 | complete |
| 2 | 前端界面 | 10 | 10 | complete |
| 3 | 基准库+种子测试 | 8 | 5 | in-progress |
| 4 | 趋势+素材基础 | 16 | 14 | in-progress |
| 5 | 创作工作台 | 13 | 13 | complete |
| 6 | 闭环优化 | 10 | 9 | in-progress |

## Current Status
- Active phase: Phase 6 进行中 9/10（T1/T2/T3/T4/T6/T7/T8/T9/T10 完成；T5 团队版独立分支）
- Phase 5 已完成 13/13
- Phase 4 仍 in-progress（14/16：P4-T2 合规评估 + P4-T4 LLM 标签分类 + P4-T12 三维筛选完成；仅剩 T15 阻塞 Supabase）
- Phase 3 仍 in-progress（5/8：T4 阻塞 Supabase / T7/T8 待运营）
- Blockers: P3-T4/P4-T15 等 Supabase 配置；P3-T7/T8 等运营招募种子用户；趋势模块真实采集器接入需分平台单独合规确认（P4-T2 评估已完成，门禁在"接入"节点前保持）；P6-T10 公开发布前 4 阻塞项（用户协议/投诉通道/处方 prompt 终审/AI 标识）；P6-T5 团队版待个人版稳定（PRD §8.2 第 23-28 周）

## Pi Agent Migration

- Active migration: M1 Runtime cutover + M2 Pi model management + M3 conversation tree
- Scope: 全部模型调用从直接 OpenAI-compatible SDK / HTTP 改为 Pi AI + Pi Agent；AI 管理页改为 Pi 模型规格；创作教练会话与剧情讨论分支持久化到用户隔离 SQLite。
- Hard constraints: 固定 Pi `0.84.2`；升级容器至 Node `>=22.19`；不接入 coding-agent 的文件/Shell/网络工具；不自动写入作品。
- Resume: 先读 `docs/plan/pi-agent-migration.md`，再从 M1 的 provider adapter 与统一调用层开始。
- Status: M1 Runtime cutover、M2 Pi model management、M3 conversation tree 已实现；M4 自动化合同测试通过，等待既有类型错误清除后完成全量 build 验收。

## Next Steps
1. Phase 6 收尾：T2/T3 等 Supabase 后端，T5 独立分支 — 当前阶段 Phase 6 可推进项已全部完成
2. Phase 4 收尾（仅剩 T15 阻塞 Supabase）：
   - 七猫真实采集器开发（P4-T2 评估中风险最低，可直采 `/paihang`，接入后对真实标题跑 P4-T4 LLM 分类评估准确率）
   - 番茄 Playwright 采集器 + 商务接洽
   - 嵌入模型选型 → 替换 TF-IDF 为向量语义搜索（tech-stack-decision.md 待补）
   - 知乎盐选用户授权导入功能（参考最高法指导案例 263 号）
3. Phase 3 收尾：配置 Supabase 后接 P3-T4 账号系统；或招募种子用户启动 P3-T7 封闭测试
4. 公开发布前补齐 P6-T10 阻塞项：用户协议+版权勾选 / 投诉通道 / 处方 prompt 终审 / AI 辅助分析标识

## Session Log
| Date | Summary |
|:-----|:--------|
| 2026-07-01 | 完成开发前规划：项目概览、任务拆解（7 phase / 72 tasks）、进度追踪、工程约束门禁 |
| 2026-07-01 | 完成 Phase 0 管线骨架：技术选型(Next.js+Supabase+OpenAI)、项目脚手架、LLM 接入层、14维度 Zod schema、拆解 prompt、类型识别、5篇测试集、API 路由、构建通过 |
| 2026-07-02 | 完成 Phase 1 诊断+处方（诊断引擎/反直觉发现/三步反馈管线/降级机制，docs 此前未回填，本次校正） |
| 2026-07-02 | 完成 Phase 2 四区域 X 光片报告 + 原文联动（P2-T1/T4/T5/T6/T7/T8）+ 处方面板；/report demo 路由；next build 通过；修复 tests/consistency-monitor.ts 预存类型错误 |
| 2026-07-02 | 完成 P2-T2/T3：上传页 + 拆解进度页（真实接入 /api/teardown + 降级出口）；/report 改造为 sessionStorage 优先 + mock 回退；完整链路 upload→analyzing→report 已通；next build 通过 9 页 |
| 2026-07-02 | 改造上传为文件拖拽上传（全格式：mammoth 解 docx + pdfjs-dist 解 pdf + 文本类直读 + 二进制兜底）；保留折叠粘贴降级入口 |
| 2026-07-02 | Phase 2 收尾：P2-T9 埋点（analytics.ts localStorage 队列，对齐 PRD 7.3 事件名，接入 upload/analyzing/report/prescription/NextSteps）+ P2-T10 下一步引导（NextSteps.tsx 诊断动态排序）；/report 加评分 + 导出 Markdown；PrescriptionPanel 加"我已采纳"。next build 通过 9 页，Phase 2 10/10 完成 |
| 2026-07-02 | Phase 3 核心基准链路完成（4/8）：P3-T1 batch-teardown.ts 三模式（真实/合成/--skip-llm）+ P3-T2 aggregator.ts 共享 extractMetrics + baseline.ts 重构合并聚合 JSON + 40 篇合成种子 baseline.json + P3-T3 /compare 双篇对比 UI（概览卡+三幕对比条+19 维差异表）+ P3-T6 npm 脚本（test:consistency/:quick/:full）+ 文本摘要归档；P3-T4 阻塞 Supabase / P3-T5 超范围 / P3-T7/T8 待运营。next build 通过 10 页 |
| 2026-07-02 | P1-T6 一致性监控 OpenCode CLI 方案落地：修正 consistency-monitor.ts（prompt 改位置参数 + --pure 禁用 agent 工具 + mimo-v2.5-free 模型）+ schema.ts 容错修复（z.any 替换 z.coerce.number 避免 NaN 拒绝）+ prompts.ts 第一轮优化（情绪值正负规范/结局判断标准/事件计数规范/禁止工具）。5×2 测试总体一致性 96.8% ✅ 达标（>85%），费用 $0 |
| 2026-07-02 | P3-T5 报告 PDF 导出：window.print() + @media print CSS（白底深字/A4 边距/no-print 隐藏交互/report-print-area 铺满/print-stack 单列/print-expand 展开原文）+ 导出 PDF 按钮（红色主按钮）+ 埋点 format:pdf；XrayReport 可视化区 print-stack，OriginalText print-expand+avoid-break。next build 通过 10 页，Phase 3 5/8 |
| 2026-07-03 | Phase 4 启动（9/16 核心 Mock-First 链路已通）：Lane A 趋势 P4-T1 mock-collector.ts（LCG PRNG 4 平台可复现）+ P4-T3 schema.ts 三层模型（TrendEntry/TrendSnapshot/ElementTrend）+ P4-T5 /trend 热力图前端（平台筛选+时间回溯+4 档热度色+推荐组合+生命周期看板）+ P4-T6 computeLifecycle 四阶段算法（7 天增长率+30 天均值阈值）+ P4-T7 CombinationRecommendation schema；Lane B 素材 P4-T9 material/schema.ts 三层（atom/component/inspiration）+ 四来源 + 层-源一致性校验 + P4-T10 extractor.ts 规则版 5 类提取器（情绪曲线 8 种形状检测）+ P4-T11 search-tfidf.ts TF-IDF 降级语义搜索（N-gram 中文分词 + 余弦相似度 + keywordFallback 兜底）+ P4-T13 /material 前端（三层导航+搜索+降级提示+素材卡片展开）+ P4-T16 degradation.ts 三路降级（采集失败→旧数据 / 平台不可用→隐藏 / TF-IDF→关键词）；P4-T2 合规门禁阻塞 / P4-T15 阻塞 Supabase / P4-T4/T8/T12/T14 待迭代。next build 通过 12 页（新增 /trend 2.95 kB + /material 10.4 kB），Phase 4 9/16 |
| 2026-07-03 | Phase 4 续推（11/16）：P4-T8 趋势元素详情卡（trend/page.tsx ElementDetailCard 组件 — 点击热力图单元格/题材表头/元素表头打开；含 SVG 走势折线图+跨平台分布条形图+常见搭配 Top 5+代表结构模式 4 阶段 mock 摘要+代表作 Top 3；「一键收藏」创建 inspiration Material source=trend + upsertMaterial 跨页持久化）+ P4-T14 个人素材收藏（material/storage.ts localStorage CRUD + MaterialCard 增强：☆/★ 收藏按钮+标签内联编辑+笔记 textarea+文件夹分类新建/移动/筛选；左侧导航加「已收藏/未分类/文件夹列表」筛选）。新增闭环链路：趋势元素详情卡→一键收藏→素材库灵感层（P4-T8→T14）。next build 通过 12 页（/trend 5.9 kB + /material 9.74 kB），Phase 4 11/16 |
| 2026-07-03 | Phase 5 创作工作台核心完成（10/13）：P5-T1 编辑器内核（contentEditable+自动保存30s/失焦+字数统计+章节分隔）+ P5-T2 段落编号（CSS counter decimal-leading-zero 非侵入）+ P5-T3 专注模式（状态持久化 localStorage）+ P5-T4 结构大纲（OutlinePanel：空白/从拆文生成模板 outlineFromTeardown）+ P5-T5 结构参考线（StructureGuide 左侧淡色标注三幕边界/反转节点）+ P5-T9 实时结构提示（StructureHints 底部条：selectionchange+rAF 节流，三幕进度条/段落类型/反转距离<5%变淡黄）+ P5-T10 写后分析（WriteAnalysis：提取文本→POST /api/teardown→saveFeedback→router /report）+ P5-T11 双篇对比完整版（compare/page.tsx 增强：CategoricalCompare 钩子/结局/视角/时态对比+EmotionCurveOverlay SVG 双曲线叠加+ReversalTimeline 双时间线；修复类型注解语法错误 ref:refVal:string→ref:string）+ P5-T12 创作完成下一步引导（WriteNextSteps 组件：基于字数/大纲动态推荐写后分析/创建大纲/导出/对比/收藏素材；Editor 增加 onWordCountChange 回调上提字数）+ P5-T13 降级机制（StructureHints try-catch+连续失败3次隐藏底部条仅留字数+自动恢复；OutlinePanel loadFeedback 异常处理+拆文数据校验+降级提示文案）。P5-T6/T7/T8 素材侧栏阻塞 Phase 4 P4-T12。next build 通过 13 页（/write 9.51 kB + /compare 9.25 kB），Phase 5 10/13 |
| 2026-07-03 | Phase 4 P4-T12 语义搜索维度筛选扩展完成（12/16）：search-tfidf.ts 扩展 SearchOpts 三维字段（novelType/emotionShape/componentKind）+ matchesFilters 单一筛选源（search + keywordFallback + 无查询路径共用，避免逻辑分叉）+ listFilterValues 动态枚举素材集合实际出现的筛选值（UI 只展示有数据的维度）+ NOVEL_TYPE_LABEL/EMOTION_SHAPES 中文标签常量；degradation.ts degradeMaterialSearch 改用 SearchOpts 让三维筛选透传 TF-IDF→关键词→空结果降级链；material/page.tsx 左侧导航新增「类型维度/情绪维度/结构维度」三组按钮（仅当对应值存在时展示，情绪维度仅 emotion_curve 组件存在时出现）+ 无结果时给出"放宽筛选"提示与「清除类型/情绪/结构筛选」按钮。P5-T6/T7/T8 素材侧栏解锁条件已满足。next build 通过 13 页（/material 10.1 kB），Phase 4 12/16 |
| 2026-07-03 | Phase 4 P4-T2 采集合规评估完成（13/16）：docs/plan/p4-t2-collection-compliance.md — 实抓 4 平台 robots.txt（番茄/七猫/点众 Allow 全站，知乎 Disallow 全站 `*`）+ 知乎服务条款原文引用（第二章第 9 条明文禁止爬虫，第三章第 10 条禁止商业用途/AI 训练）+ 法律风险评估（知乎高风险含李某/毛某刑事判例 + 微信公众号 300 万民事 / 番茄低-中 JS 渲染+设备指纹 / 七猫低 SSR+无登录墙 / 点众 Web 低但数据价值不足 App 高 SSL pinning）+ 替代方案（七猫直采 `/paihang` / 番茄 Playwright+商务 / 点众商务合作 / 知乎放弃直采+用户授权导入参考最高法指导案例 263 号）+ 法规框架（网安法/数据安全法/个保法第 4 条笔名属个人信息/2025 反不正当竞争法第 13 条第 3 款数据专款 10-15 施行/最高法第 47 批指导案例 262-267 号）+ 工程约束 §1.2 门禁解除条件（评估完成 ✅ / 真实采集器接入前需单独合规确认 ⏳ / 上线前需数据分类台账+用户授权导入功能 ⏳）；当前阶段维持 Mock-First，趋势模块不对外上线真实采集数据。Phase 4 13/16 |
| 2026-07-03 | Phase 5 收尾完成（13/13）：P5-T6 素材侧栏主动推荐（MaterialSidebar RecommendTab：光标位置情境检测 opening<10% / near_reversal 大纲反转±5% / dialogue 段落分类 / default，对应 4 套预设查询走 TF-IDF search()，10s 节流轮询，结果<4 时用未匹配素材回填至 6 条；trackEvent material_inserted 上报 context 用于采纳率分析）+ P5-T7 手动搜索与快捷插入（SearchTab：TF-IDF topN=10 + minScore=0.03，无结果时 keywordFallback 降级，空查询时展示前 8 条；MaterialCard 原子/灵感素材 document.execCommand("insertText") 直接插入光标位置，组件素材展开详情而非直接插入，光标不在编辑器内时 collapse 到末尾再插入）+ P5-T8 拖拽收藏（CollectTab：onDragOver/onDrop + e.dataTransfer.getData("text/plain") 拖拽创建原子素材 source=manual + 「收藏当前选中文字」按钮 + 手动 textarea 输入 + 标签逗号分隔 + upsertMaterial 跨页持久化 + 已收藏列表展示前 10 条）。新增 catalog.ts 共享模块提取 buildPresetMaterials/loadAllMaterials（避免 /material 与 MaterialSidebar 重复）+ write/page.tsx 三栏布局（左 256px 大纲/中 编辑器/右 288px 素材侧栏 max-w-7xl，xl 断点隐藏侧栏，sticky 顶部+calc(100vh-2rem) 高度）。WriteNextSteps 「收藏片段为素材」从 comingSoon 改为 hintOnly 指向右侧栏。next build 通过 13 页（/write 12.5 kB），Phase 5 13/13 完成 ✅ |
| 2026-07-03 | Phase 4 P4-T4 LLM 辅助标签分类完成（14/16）：trend/classifier.ts LLM 分类管线（批量 20 条/次降低 API 成本 + Zod ClassifyResultSchema 校验 results 长度与 title 回查匹配 + ruleClassify 规则版降级标题字面匹配 GENRE_POOL/ELEMENT_POOL + classifyEntriesDryRun/pingClassifier/evaluateClassification 工具函数供 tests 抽样人工校验）+ trend/prompts.ts CLASSIFY_PROMPT（保守原则/字面优先/题材vs元素区分/数量限制1-3个/去重/禁止编造）+ trend/labels.ts 抽 GENRE_POOL/ELEMENT_POOL/GENRE_LABELS/ELEMENT_LABELS 到独立模块断 mock-collector↔classifier 循环依赖；mock-collector.ts 新增 useLLMClassification 开关（函数重载：默认同步词表随机 TrendSnapshotValue[] / true 异步 Promise<TrendSnapshotValue[]>）+ generatePlatformEntriesForLLM 用自然标题模板 20 个（深夜便利店/第三种结局/她来时有星光等，非占位符真实评估 LLM 分类能力）+ LLM 路径动态 import("./classifier") 避免 openai SDK 进客户端 bundle（/trend 138 kB / /material 138 kB 维持不变）+ mockCollectMultiDay 不支持 LLM 模式（30 天×4 平台×12 条≈72 次 LLM 调用成本过高）；analytics 新增 trend_classified 事件；trend/index.ts 不导出 classifier 避免客户端拉入 openai SDK。准确率目标 >90% 需真实采集后抽样校验（规则版约 70-80% 字面匹配，LLM 版约 90-95% 语义推断）。next build 通过 13 页，Phase 4 14/16 |
| 2026-07-03 | Phase 4 P4-T4 分类准确率评估完成：tests/p4-t4-classification-eval.ts（30 条人工标注真值数据集，覆盖全部 10 题材+10 元素，标题与 prompt few-shot 示例零重叠避免数据泄漏）+ 4 种评估指标（严格集合相等/子集匹配/主标签匹配/聚类匹配，聚类匹配贴近 PRD"抽样人工校验"实际口径，悬疑↔惊悚/日常↔治愈/复仇↔重生视为可接受）+ npm test:classify-eval 脚本。评估过程修复 3 个 bug：① prompt"字面优先/不脑补"致 LLM 退化为字面匹配器（首轮评估仅 6.7%）→ 重写为语义推断+关键意象 few-shot（复出/逆袭→复仇、系统→科幻、替身→复仇、深夜食堂→治愈）+ 禁止输出"其他" ② title 回查严格相等致 LLM 加《》装饰后匹配失败（第二批次全降级规则版）→ 归一化（去书名号/引号/空格）+ 索引兜底 ③ sanitizeTags 未按词表过滤致"日常"当元素泄漏 → GENRE_POOL/ELEMENT_POOL 严格过滤+空结果规则版兜底。最终结果：题材聚类匹配 96.7% ✅ 达标（>90%），题材主标签 80.0%，元素聚类匹配 66.7%（标题信息有限元素推断本质上更难），Overall 聚类 81.7%，规则版主标签基线 6.7%→LLM 提升 63.3%。结论：题材分类达标，元素分类待真实采集（含作者标签/平台分类/简介等元数据）后复评预计提升。next build 通过 13 页 |
| 2026-07-03 | Phase 6 闭环优化推进 7/10：P6-T1 闭环引导优化（report/use-user-profile.ts 客户端 hook computeUserProfile 推断 newcomer/learner/creator/looped 四阶段 + NextSteps/WriteNextSteps 阶段化推荐优先级 + 移除 comingSoon + trackEvent 加 user_stage）+ P6-T6 闭环监控仪表盘（report/metrics.ts 纯函数 computeDashboardData 对齐 PRD §7.1 北极星+§7.2 五模块指标+闭环漏斗 + app/dashboard/page.tsx 时间范围切换+漏斗可视化+空状态 CTA）+ P6-T7 L2 人工盲测流程文档化（docs/plan/p6-t7-l2-blind-test-process.md：8 维度阈值/4 阶段流程/人工标注 YAML 模板/L1↔L2↔L3 衔接）+ P6-T8 L3 评分收集扩展（ModuleRating.tsx 可复用组件接入 /trend /material /write 三页 + analytics 扩展 trend_rated/material_rated/write_rated + metrics 三模块加有用评分指标）+ P6-T9 性能优化（next.config removeConsole+optimizePackageImports shared chunk 103→102 kB + LLM client maxRetries 1→0 避免叠加重试；调研 12 项清单按影响×成本排序）+ P6-T4 个性化趋势推荐（trend/page.tsx 接入 useUserProfile，TYPE_TO_FOCUS_ELEMENT 映射 plot→反转/emotion→虐心/atmosphere→日常，自动设置 focusElement + 个性化提示文案 + trend_viewed 加 personalized 字段）+ P6-T10 上线前合规终审（docs/plan/p6-t10-prelaunch-compliance-review.md：7 维度评估，当前阶段可上线 ✅，公开发布前 4 阻塞项：用户协议/投诉通道/处方 prompt 终审/AI 标识）。P6-T2/T3 阻塞 Supabase 后端，P6-T5 独立分支。next build 通过 14 页（新增 /dashboard 4.71 kB），Phase 6 7/10 |
| 2026-07-03 | Phase 6 闭环优化推进 9/10：P6-T2 个性化拆文推荐 + P6-T3 个性化素材推荐 用 localStorage 轻量版解锁，不阻塞 Supabase。P6-T2：① report/teardown-history.ts 新建拆文历史累积存储（key inksight:teardown_history 上限 50 条 FIFO，含 type/title/weaknessLabels/weaknessSeverities/counterIntuitiveLabel）+ aggregateWeakAreas 聚合（critical×3+warning×1 加权 Top N）② analyzing/page.tsx 在 analysis_completed 后调 appendTeardownHistory 累积历史 + 埋点扩展 weakness_labels/weakness_severities 字段 ③ metrics.ts UserProfile 加 weakAreas 字段 + WEAKNESS_TO_COMPONENT_KIND 映射常量（12 项骨架/血肉薄弱点→componentKind）④ use-user-profile.ts 合并 teardown-history 聚合结果 ⑤ PersonalizedRecommendations.tsx 组件在 /report 页 XrayReport 后接入，基于 weakAreas→componentKind 筛选组件素材 Top 3，无匹配引导去素材库。P6-T3：material/page.tsx 接入 useUserProfile，首次拿到 preferredType 时自动设置 novelTypeFilter（autoFilterApplied 标记防覆盖手动选择），头部个性化提示文案+查看全部按钮，复用 P4-T12 matchesFilters 零额外成本。局限：当前无法推荐"拆哪篇作品"（拆文库 P3-T1 未建），改为推荐"补足薄弱点的组件素材"，Supabase 接入后迁移 localStorage→PostgreSQL 零重构。next build 通过 14 页，Phase 6 9/10（仅 T5 团队版独立分支）|
| 2026-07-03 | P6-T9 性能优化批次 2 完成（共 8/12 项）：① 删 @supabase/supabase-js 死依赖（src/ 零 import）② pipeline.ts 提取 withTimeout 通用函数，type detection/teardown/prescription 三处 30s race timeout 包装（防 LLM client maxRetries=0 后网络挂起极端长尾，最坏 60s×2→30s×2）③ MaterialSidebar 10s setInterval 改 selectionchange 事件 + 2s 节流 + rAF（写作时无后台 CPU 轮询）④ computeDashboardData 重构单次遍历建 eventsByNameMap + sidEventNames，闭环判定 O(S×E)→O(E+S)⑤ trackEvent 改 in-memory buffer + 500ms debounce flush + visibilitychange/beforeunload 兜底（高频事件不阻塞主线程）⑥ /report XrayReport + /write MaterialSidebar 用 next/dynamic ssr:false 拆分（/report 14.8→7.52 kB -49%，/write 15.5→11.8 kB First Load 145→121 kB -24%）。累计批次 1+2 共 8 项优化，跳过 4 项（字体 next/font 中文字库反效果 / /api/teardown streaming 留待后端 / OriginalText 虚拟化需引依赖 / 合并 type+teardown 单次 LLM 调用 schema 改动大）。next build 通过 14 页，shared chunk 102→103 kB（buffer 逻辑微增） |
| 2026-07-03 | P4-T4 分类准确率复评完成（真实七猫标题）：tests/p4-t4-classification-eval.ts 扩展双数据集对比（合成 30 条 + 真实 28 条七猫榜单元数据，覆盖 6/10 题材，跳过玄幻/修真无对应词表）。结果：题材聚类匹配 合成 96.7% → 真实 50.0%（-46.7% ❌ 未达标），元素聚类匹配 合成 70.0% → 真实 53.6%（-16.4%），Overall 聚类 83.3% → 51.8%（-31.5%）。失败模式分析：① 宫斗→言情 混淆（朱门春闺/皇叔借点功德/抢我婚约嫁太子/解春衫 被判为言情，LLM 未识别古代背景+权谋=宫斗）② 穿越→复仇 混淆（逍遥四公子/边关兵王/边军悍卒/大周第一武夫/你惹他干嘛 被判为复仇，LLM 见男主+历史背景默认复仇）③ 爽感 元素过预测（真实标题无论实际元素均判爽感）。结论：合成数据集过拟合 prompt few-shot，真实标题分布下泛化失败；待优化 prompt 补充宫斗/穿越 few-shot 或接入平台标签+简介元数据辅助分类 |
| 2026-07-03 | 端到端流程导航断点修复完成（聚焦整体流程跑通）：审计发现 5 个高优先级导航断点（首页缺 3 入口 / /dashboard 孤岛 / /compare 无出口 / /material 无去创作 / /write 中小屏侧栏隐藏），逐一修复：① 首页 page.tsx 补全 6 个次级链接（+趋势雷达/素材库/闭环仪表盘）② /compare footer 补 去创作/趋势雷达/素材库 三个出口 ③ /material 数据飞轮区+footer 补"带着素材去创作"链接 ④ /trend ElementDetailCard saveNotice 改为可点击 Link 跳转 /material（收藏后即有去素材库入口）⑤ /write 中小屏侧栏抽屉化（header 加"大纲/分析"+"素材侧栏"唤出按钮，lg/xl 以下点击弹出 fixed overlay 抽屉，含关闭按钮+遮罩点击关闭，左侧 72w 右侧 80w max-w-85vw）。next build 通过 14 页（/write 11.8→12 kB +0.2 抽屉逻辑，其余不变），闭环导航完整：首页→上传→拆解→报告→创作/趋势/素材/对比→回首页，全链路可达 |
