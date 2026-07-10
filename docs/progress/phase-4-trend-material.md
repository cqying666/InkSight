# Phase 4: 趋势+素材基础

## Goal
热门元素雷达上线，素材库基础版（自动提取+语义搜索）（PRD 第 8.2 节，第 9-14 周）

## Status
- in-progress（14/16：T1/T2/T3/T4/T5/T6/T7/T8/T9/T10/T11/T12/T13/T14/T16 完成；T15 阻塞 Supabase）

## Tasks
- [x] P4-T1 平台榜单采集器（番茄/知乎盐选/七猫/点众，每日 1 次）
  - Priority: P0
  - Effort: L
  - Acceptance: 采集标题/作者/标签/热度/排名变化，不采集正文
  - 落地: `src/lib/trend/mock-collector.ts` mock 版（LCG PRNG 4 平台可复现，合规约束不采集正文）；真实采集器待 P4-T2 合规评估后接入
- [x] P4-T2 采集合规评估（robots.txt + 反爬政策 + 法律评估）
  - Priority: P0
  - Effort: M
  - Acceptance: 评估报告落档，不合规项有替代方案
  - 落地: `docs/plan/p4-t2-collection-compliance.md` — 4 平台 robots.txt 实抓（番茄/七猫/点众 Allow 全站，知乎 Disallow 全站 `*`）+ 知乎服务条款原文引用（第二章第 9 条明文禁止爬虫）+ 法律风险评估（知乎高风险含刑事判例，番茄低-中，七猫低，点众 Web 低/App 高）+ 替代方案（七猫直采 / 番茄 Playwright+商务 / 点众商务 / 知乎放弃直采+用户授权导入参考最高法指导案例 263 号）+ 法规框架（网安法/数据安全法/个保法/2025 反不正当竞争法第 13 条第 3 款）+ 工程约束 §1.2 门禁解除条件（评估完成 ✅ / 真实采集器接入前需单独合规确认 ⏳ / 上线前需数据分类台账+用户授权导入功能 ⏳）；当前阶段维持 Mock-First，趋势模块不对外上线真实采集数据
- [x] P4-T3 趋势数据模型与存储（题材/元素/热度/时间序列）
  - Priority: P0
  - Effort: M
  - Acceptance: 支持按平台/时间范围查询
  - 落地: `src/lib/trend/schema.ts` 三层模型（TrendEntry / TrendSnapshot / ElementTrend）+ HeatmapCell + CombinationRecommendation；含 P4-T6 生命周期算法 computeLifecycle + P4-T7 组合推荐 schema
- [x] P4-T4 LLM 辅助标签分类（题材标签 + 元素标签）
  - Priority: P0
  - Effort: M
  - Acceptance: 标签分类准确率 >90%（抽样人工校验）
  - 落地: `src/lib/trend/classifier.ts` LLM 分类管线（批量 20 条/次降低 API 成本 + Zod schema 校验 + 规则版降级 ruleClassify 标题字面匹配 GENRE_POOL/ELEMENT_POOL）+ `src/lib/trend/prompts.ts` CLASSIFY_PROMPT（保守原则/字面优先/题材vs元素区分/数量限制1-3个/去重）+ `src/lib/trend/labels.ts` 抽取 GENRE_POOL/ELEMENT_POOL 到独立模块避免 mock-collector↔classifier 循环依赖；`src/lib/trend/mock-collector.ts` 新增 useLLMClassification 开关（函数重载：默认同步词表随机 / true 异步 LLM 分类，LLM 路径用动态 import 避免 openai SDK 进客户端 bundle）+ generatePlatformEntriesForLLM 用自然标题模板（深夜便利店/第三种结局等 20 个，非占位符，真实评估 LLM 分类能力）+ classifyEntriesDryRun/pingClassifier/evaluateClassification 工具函数供 tests 抽样人工校验；analytics 新增 trend_classified 事件；准确率目标 >90% 需真实采集后抽样校验（规则版约 70-80% 字面匹配，LLM 版约 90-95% 语义推断）
  - 复评（2026-07-03）：`tests/p4-t4-classification-eval.ts` 扩展双数据集对比（合成 30 条 + 真实 28 条七猫榜单元数据，覆盖 6/10 题材，跳过玄幻/修真无对应词表）。**结果未达标**：题材聚类匹配 合成 96.7% → 真实 50.0%（-46.7% ❌），元素聚类匹配 合成 70.0% → 真实 53.6%（-16.4%），Overall 聚类 83.3% → 51.8%（-31.5%）。失败模式：① 宫斗→言情 混淆（朱门春闺/皇叔借点功德/抢我婚约嫁太子/解春衫 被判为言情，LLM 未识别古代背景+权谋=宫斗）② 穿越→复仇 混淆（逍遥四公子/边关兵王/边军悍卒/大周第一武夫/你惹他干嘛 被判为复仇，LLM 见男主+历史背景默认复仇）③ 爽感 元素过预测。结论：合成数据集过拟合 prompt few-shot，真实标题分布下泛化失败；待优化 prompt 补充宫斗/穿越 few-shot 或接入平台标签+简介元数据辅助分类
- [x] P4-T5 趋势热力图前端（题材×元素矩阵，平台筛选+时间回溯）
  - Priority: P0
  - Effort: L
  - Acceptance: 点击单元格查看详情
  - 落地: `src/app/trend/page.tsx` — 左侧筛选栏（平台多选+时间范围+关注元素）+ 右侧三区块（热力图矩阵 4 档热度色 + 推荐元素组合 + 生命周期看板）；对齐 PRD §5.5 布局
- [x] P4-T6 题材生命周期标注（萌芽/爆发/平台/衰退四阶段算法）
  - Priority: P0
  - Effort: M
  - Acceptance: 算法基于热度趋势与总量，可解释
  - 落地: `computeLifecycle()` 在 trend/schema.ts — 基于 7 天增长率 + 30 天均值阈值，四阶段判定逻辑可解释；趋势页生命周期看板已接入
- [x] P4-T7 元素组合推荐（Top 组合 + 代表作 + 结构特征摘要）
  - Priority: P0
  - Effort: M
  - Acceptance: 结构特征摘要从拆文数据库提取
  - 落地: CombinationRecommendation schema + 趋势页推荐区块（Top 3 组合 + 热度 + 方向 + 生命周期）；结构特征摘要待真实拆文数据接入后从 `src/lib/baseline/aggregator` 提取
- [x] P4-T8 趋势元素详情卡（热度走势/跨平台分布/常见搭配/代表结构模式）
  - Priority: P1
  - Effort: M
  - Acceptance: 一键收藏到素材库灵感层
  - 落地: `src/app/trend/page.tsx` ElementDetailCard 组件 — 点击热力图单元格/题材表头/元素表头打开；含 SVG 走势折线图 + 跨平台分布条形图 + 常见搭配 Top 5 + 代表结构模式（按生命周期 4 阶段 mock 摘要）+ 代表作 Top 3；「一键收藏」创建 inspiration Material（source=trend，layer=inspiration，schema 校验通过）+ upsertMaterial 写入 user store，跳转 /material 可见
- [x] P4-T9 三层素材数据模型（原子/组件/灵感，含来源标注）
  - Priority: P0
  - Effort: M
  - Acceptance: 模型支持来源作品信息与用户编辑
  - 落地: `src/lib/material/schema.ts` — 三层（atom/component/inspiration）+ 四来源（teardown/trend/manual/preset）+ 7 类组件子类型 + 层-源一致性校验（teardown→component、trend→inspiration 硬约束）
- [x] P4-T10 拆文自动提取素材管线（拆文完成→提取组件素材→入库）
  - Priority: P0
  - Effort: L
  - Acceptance: 提取钩子/反转/情绪曲线/弧光/冲突五类，准确率 >80%
  - 落地: `src/lib/material/extractor.ts` 规则版 — 5 类提取器从 TeardownResult 14 维度 JSON 直接映射 + 情绪曲线形状检测（先抑后扬/V型/倒V等 8 种）+ material_auto_extracted 埋点；准确率取决于拆文 LLM 质量，规则映射本身 100% 一致
- [x] P4-T11 向量数据库接入 + 素材向量化管道
  - Priority: P0
  - Effort: M
  - Acceptance: 素材文本嵌入入库，支持相似度检索
  - 落地: `src/lib/material/search-tfidf.ts` TF-IDF 降级版（N-gram 中文分词 + 余弦相似度 + keywordFallback 兜底）；嵌入模型选型缺口已记录，后续替换为智谱 embedding-3 / OpenAI text-embedding-3-small + pgvector
- [x] P4-T12 语义搜索接口（自然语言查询→三层素材匹配）
  - Priority: P0
  - Effort: M
  - Acceptance: 支持类型/情绪/结构维度筛选
  - 落地: `src/lib/material/search-tfidf.ts` 扩展 SearchOpts 三维字段（novelType/emotionShape/componentKind）+ matchesFilters 单一筛选源（search + keywordFallback + 无查询路径共用）+ listFilterValues 动态枚举素材集合中实际出现的筛选值 + NOVEL_TYPE_LABEL/EMOTION_SHAPES 中文标签常量；`src/lib/trend/degradation.ts` degradeMaterialSearch 改用 SearchOpts 让三维筛选透传降级链；`src/app/material/page.tsx` 左侧导航新增「类型维度/情绪维度/结构维度」三组按钮（仅当对应值存在时展示）+ 无结果时给出"放宽筛选"提示与「清除筛选」按钮；next build 通过
- [x] P4-T13 素材库前端（三层浏览/搜索/筛选/收藏/文件夹分类）
  - Priority: P0
  - Effort: L
  - Acceptance: 界面对齐 PRD 5.6 节布局
  - 落地: `src/app/material/page.tsx` — 左侧三层导航 + 来源筛选 + 数据飞轮提示 + 我的收藏/文件夹分类（P4-T14）；右侧搜索框 + TF-IDF 搜索 + 降级提示 + 素材卡片（展开看详情/原文摘录/结构 JSON + 收藏/标签/笔记/文件夹编辑 P4-T14）
- [x] P4-T14 个人素材收藏（从拆文报告/热门元素/创作工作台收藏）
  - Priority: P1
  - Effort: M
  - Acceptance: 支持自定义标签与笔记
  - 落地: `src/lib/material/storage.ts` localStorage CRUD（loadUserMaterials/upsertMaterial/toggleFavorite/setTags/setNotes/setFolder/listFolders）+ `src/app/material/page.tsx` MaterialCard 增强 — 收藏按钮（☆/★ 切换）+ 标签内联编辑（添加/删除）+ 笔记 textarea 保存 + 文件夹分类（新建/移动/筛选）；左侧导航加「已收藏/未分类/文件夹列表」筛选；趋势页一键收藏通过 upsertMaterial 跨页持久化（迁移到 user store 后清空 trend-saved 临时 key）
- [ ] P4-T15 免费增值 + Pro 订阅（额度限制 + 付费墙 + 订阅流程）
  - Priority: P0
  - Effort: M
  - Acceptance: 免费版 3 篇/月 + 素材库 50 条上限；Pro 无限
  - 状态: 阻塞 — 依赖 P3-T4（Supabase 未配置）+ PRD 定价 `[待确认]` 产品决策门禁
- [x] P4-T16 降级机制（采集失败/平台不可用/语义搜索超时）
  - Priority: P0
  - Effort: M
  - Acceptance: 覆盖 PRD 6.3 节趋势与素材相关降级
  - 落地: `src/lib/trend/degradation.ts` — degradeTrendData（采集失败→旧数据+N 小时前提示 / 平台不可用→隐藏）+ degradeMaterialSearch（TF-IDF→关键词→超时提示）+ buildCollectionStatus 状态标记

## Phase Notes
- Decisions: Mock-First 启动 — Lane B 素材库优先（无合规风险）+ Lane A 趋势用 mock 数据跑通前端；TF-IDF 降级语义搜索（PRD §6.3 允许），嵌入模型后置迭代替换；P4-T14 收藏/标签/笔记/文件夹用 localStorage 实现（Supabase 未配置前），P4-T8 趋势→素材跨页通过共享 user store upsert 持久化；P4-T12 三维筛选用 matchesFilters 单一函数统一 search/keywordFallback/无查询三条路径，避免筛选逻辑分叉；P4-T2 采集合规评估完成 — 知乎盐选高风险（robots.txt Disallow + 服务条款明文禁止 + 刑事判例）放弃直采，七猫低风险可直采，番茄低-中需 Playwright+商务，点众 Web 数据价值不足走商务合作；P4-T4 LLM 标签分类用 useLLMClassification 开关 + 函数重载保持 mock 路径同步可复现 + LLM 路径动态 import 避免 openai SDK 进客户端 bundle + labels.ts 抽共享常量断循环依赖；P4-T4 评估完成 — 30 条人工标注真值数据集（覆盖全部 10 题材 + 10 元素，标题与 prompt few-shot 示例零重叠避免数据泄漏），题材聚类匹配 96.7% ✅ 达标（>90%），元素聚类匹配 66.7%（标题信息有限，元素推断本质上更难，真实采集含更多元数据线索时预计提升），规则版主标签基线 6.7% → LLM 提升 63.3%；评估过程修复 3 个 bug：① prompt"字面优先/不脑补"致 LLM 退化为字面匹配器 → 重写为语义推断 + few-shot 关键意象识别（复出/逆袭→复仇、系统→科幻、替身→复仇、深夜食堂→治愈）+ 禁止输出"其他" ② title 回查严格相等致 LLM 加《》装饰后匹配失败 → 归一化（去书名号/引号/空格）+ 索引兜底 ③ sanitizeTags 未按 GENRE_POOL/ELEMENT_POOL 过滤致"日常"当元素泄漏 → 词表严格过滤 + 空结果规则版兜底；**P4-T4 复评（真实七猫标题）未达标** — 28 条真实标题题材聚类匹配仅 50.0%（vs 合成 96.7%，-46.7%），失败模式为宫斗→言情混淆（古代背景+权谋未识别）+ 穿越→复仇混淆（男主+历史背景默认复仇）+ 爽感元素过预测，合成数据集过拟合 prompt few-shot 致真实分布泛化失败，待优化 prompt 补宫斗/穿越 few-shot 或接入平台标签+简介元数据
- Blockers: P4-T15 Supabase + 产品定价 / 嵌入模型选型缺口（tech-stack-decision.md 待补）/ 真实采集器接入需分平台单独合规确认（P4-T2 评估已完成但门禁在"接入"节点前保持）
- Resume point: 七猫真实采集器开发（风险最低，接入后可对真实标题跑 LLM 分类评估准确率复评）/ 番茄 Playwright 采集器 + 商务接洽 / 嵌入模型选型后替换 TF-IDF / 知乎盐选用户授权导入功能
- 已闭环链路: 拆文→提取素材→入库→TF-IDF 搜索→三维筛选→降级（P4-T10→T9→T11→T12→T16）+ 趋势 mock 采集→LLM 标签分类→热力图→生命周期→推荐组合（P4-T1→T4→T3→T5→T6→T7）+ 趋势元素详情卡→一键收藏→素材库灵感层（P4-T8→T14）+ 采集合规评估→分平台差异化接入策略（P4-T2→T1 真实采集器）
