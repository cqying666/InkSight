# Project Overview — InkSight 创作教练

## Transformation Goal
- Scope: 从零搭建 InkSight 短篇小说创作平台，实现"学—察—集—创—磨"完整创作闭环。覆盖 5 大模块：拆文分析引擎、热门元素雷达、素材库、创作工作台、写后分析反馈循环。
- Target state: 一个 Web 平台，让中腰部短篇创作者在一个环境内完成拆文学习、趋势发现、素材积累、创作实践、写后复盘的完整一圈。
- Constraints:
  - 拆文引擎 LLM 输出必须为强约束 JSON，14 维度结构化
  - 处方遵循"三不原则"：不替写、不给唯一答案、不评判
  - 平台数据采集仅限公开榜单，不存储正文，上线前完成合规评估
  - 段落编号系统在编辑器与拆文分析间保持一致
  - 创作工作台实时提示只提醒结构位置，不评价内容质量
- Primary priority: Phase 0-3 先跑通拆文分析引擎 MVP（单点突破），Phase 4-6 逐步补齐闭环

## Current System Snapshot
- Architecture shape: Next.js 15 + React 19 + TypeScript 全栈应用；Route Handlers、SQLite（better-sqlite3）、Zvec 本地语义索引与用户隔离已落地。
- Entry points: 工作区页面位于 `src/app/(workspace)`；AI 管理为 `/ai-control`；统一模型调用位于 `src/lib/llm/client.ts`。
- Build and run path: `npm run build`；Docker 运行时随 Pi 迁移升级至 Node.js 22.19+。
- External integrations:
  - Pi Agent Core + Pi AI（拆解 / 处方 / 趋势分类 / 创作教练；模型由本地 AI 管理页配置）
  - Zvec（语义搜索与情境匹配，本地持久化）
  - 各平台公开榜单数据采集（番茄短篇 / 知乎盐选 / 七猫 / 点众）
  - Google Fonts CDN（落地页已有，产品页可复用）

## Key Modules
| Module | Responsibility | Main dependencies | Risk |
|:-------|:---------------|:------------------|:-----|
| 拆文分析引擎 | 上传→拆解→诊断→处方→X光片报告；三层14维度结构化拆解；类型识别+权重模板 | LLM 服务、基准库 | 高 — LLM 一致性、处方质量 |
| 创作反馈管线 | 拆解(JSON)→诊断(规则引擎)→处方(LLM 多方向建议)；三明治结构+创作者语言 | 拆文引擎、基准数据 | 中 — 诊断规则需调优 |
| 热门元素雷达 | 平台榜单采集、趋势热力图、题材生命周期、元素组合推荐 | 采集管道、拆文数据库（结构特征摘要） | 高 — 合规风险、采集稳定性 |
| 素材库 | 三层素材结构、拆文自动提取、语义搜索、情境匹配、个人收藏 | 拆文引擎（自动提取）、向量数据库、LLM（语义） | 中 — 提取质量、情境匹配相关性 |
| 创作工作台 | 富文本编辑器、段落编号、结构大纲、素材侧栏、实时结构提示 | 素材库、拆文基准、编辑器内核 | 中 — 联动体验流畅度 |
| 写后分析反馈循环 | 对创作产出运行拆文引擎、双篇对比、薄弱点→下轮改进目标 | 拆文引擎、创作工作台 | 低 — 复用拆文引擎 |
| 数据中台 | 拆文数据 / 趋势数据 / 素材数据 / 用户数据的统一存储 | 数据库、向量库 | 中 — 数据模型设计 |
| 用户行为记录 | 建议采纳、报告导出、素材收藏、趋势关注等事件追踪 | 埋点系统、分析后台 | 低 — 标准实现 |

## Pi Agent Migration Overlay — 2026-08-20

- Target state: 所有模型请求经 `@earendil-works/pi-ai` 的受控模型集合与 `@earendil-works/pi-agent-core` 执行；不再由产品代码直接实例化 OpenAI SDK 或手写 `/chat/completions` 请求。
- Model management: `ai_models` 保持为管理员配置入口，但扩展为 Pi 模型规格（OpenAI-compatible API、上下文窗口、输出上限、推理能力）；每个配置在请求时映射为隔离的 Pi Provider + Model。
- Conversation state: Pi Agent 负责回合、流式事件与受限工具；InkSight SQLite 保存用户隔离的会话、消息、父子分支和作品关联，不使用仍在快速演化的 Pi Harness 持久化 API。
- Compatibility: 固定 Pi `0.84.2`；生产 Node 运行时必须为 `>=22.19`；现有 DeepSeek、OpenAI、OpenCode 等 OpenAI-compatible endpoint 继续通过 Pi 的 OpenAI-completions adapter 接入。
- Non-goals: 不引入 Pi coding-agent 的文件、Shell、网络工具；不开放第三方扩展；不改变拆文 JSON schema、处方“三不原则”或用户数据隔离边界。

## Main Risks
| Risk | Impact | Likelihood | Mitigation |
|:-----|:-------|:-----------|:-----------|
| LLM 拆解一致性与稳定性不足 | 高 | 高 | 20 篇测试集每周监控；prompt 强约束；evidence 字段减少幻觉；JSON schema 校验 |
| 热门元素数据采集合规风险 | 高 | 中 | 仅采集公开榜单；不存储正文；上线前完成各平台 robots.txt 与政策评估 |
| 处方"参考案例"版权风险 | 中 | 中 | 初期用描述性引用而非原文；上线前法律评估 |
| 闭环太长导致用户中途流失 | 中 | 中 | 每环节"下一步引导"；闭环可分段完成 |
| 创作工作台与拆文/素材联动不流畅 | 高 | 中 | 端到端用户旅程测试；段落编号体系统一；情境匹配算法迭代 |
| 冷启动缺乏内容资产 | 中 | 高 | Phase 3 前预拆 100-200 篇填充拆文库+素材库 |
| 素材库自动提取质量不稳定 | 中 | 中 | L2 人工盲测覆盖；用户可编辑/删除自动提取素材 |

## Notes
- Resume hint: 先读 `docs/progress/MASTER.md` 确认当前 phase，再读对应 `docs/progress/phase-N-*.md` 查看任务进度。
- Unknowns still open:
  - 前端框架选型（React / Vue / 其他）
  - 后端语言与框架选型（Node / Python / Go）
  - LLM 服务选型（OpenAI / Claude / 国产模型 / 自部署）
  - 向量数据库选型（Pinecone / Milvus / pgvector / 其他）
  - 主数据库选型（PostgreSQL / MySQL / 其他）
  - 部署形态（云服务 / 自建 / Serverless）
  - Pro 订阅定价与团队版定价 `[待确认]`
