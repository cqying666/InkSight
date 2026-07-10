# Phase 2: 前端界面

## Goal
X 光片四区域界面，情绪曲线可视化，点击跳转（PRD 第 8.2 节，第 5-6 周）

## Status
- complete（10/10 任务完成；upload→analyzing→report 完整链路 + 埋点 + 下一步引导）

## Tasks
- [x] P2-T1 设计系统建立（色板/字体/间距/组件库）
  - Priority: P0
  - Effort: M
  - Acceptance: 设计 token 文件 + 基础组件库可复用
  - Notes: 对齐落地页 Editorial 文学杂志风格（seal red #8B2635 / warm gold #A87E3B / ink black #1A1614 / warm ivory）。Tailwind config 已含色板/字体；报告组件复用 Editorial 风格原语（圆角 sm / 金色细边 / 衬线标题 / 暖色纸面）
- [x] P2-T2 小说上传页（txt/富文本粘贴 + 3 自评问题）
  - Priority: P0
  - Effort: M
  - Acceptance: 上传后进入等待状态，自评数据入库，自评可选
  - Notes: /upload — 文件拖拽/点击上传（全格式：.txt/.md/.docx/.pdf/.rtf/.html 等浏览器本地解析）+ 3 可选自评（开头吸引力 1-5 / 最有张力位置滑块 / 节奏快中慢）。文件解析器 src/lib/report/file-parser.ts（mammoth 解 docx + pdfjs 解 pdf + 文本类直读 + 二进制兜底）。保留折叠的"直接粘贴文本"降级入口
- [x] P2-T3 拆解进度展示页（进度条约 30 秒）
  - Priority: P0
  - Effort: S
  - Acceptance: 识别类型→分析钩子→绘制曲线→生成反馈 四段动画
  - Notes: /analyzing — 四阶段清单 + 进度条（定时器驱动，90% 上限等待真实返回）+ 真实调用 POST /api/teardown；LLM 未配置或失败时降级展示错误 + "返回重试"/"用演示数据查看报告"双出口
- [x] P2-T4 X 光片报告 — 总览卡片（一句话总评 + 反直觉发现）
  - Priority: P0
  - Effort: M
  - Acceptance: 反直觉发现展示在最显眼位置
  - Notes: OverviewCard — 反直觉发现用 seal red 左边框 + 暖色底，作为报告视觉锚点
- [x] P2-T5 X 光片报告 — 情绪曲线可视化（双线叠加+标记点+点击跳转）
  - Priority: P0
  - Effort: L
  - Acceptance: 点击节点原文区滚动到对应位置并高亮
  - Notes: EmotionCurve — 主线情绪（平滑贝塞尔+面积填充）+ 副线结构张力（反转高斯峰，虚线）+ 情绪关键点圆点 + 反转菱形，均可点击跳转
- [x] P2-T6 X 光片报告 — 结构图谱（全文缩略条形图）
  - Priority: P0
  - Effort: M
  - Acceptance: 三幕结构占比可视化
  - Notes: StructureMap — 三幕占比条（建置/对抗/解决按比例着色）+ 反转节点标记（可点击）+ 全文情绪热力条
- [x] P2-T7 X 光片报告 — 维度详情折叠卡片（类型权重控制高亮/折叠）
  - Priority: P0
  - Effort: M
  - Acceptance: 高亮维度展开，次要维度折叠
  - Notes: DimensionDetails + dimensions.ts — 14 维按骨架/血肉/风格分组，TYPE_WEIGHT_TEMPLATES 控制 highlight（金色边+重点徽章+默认展开）与 fold（默认折叠），关联 diagnosis finding 标注薄弱点/提升机会
- [x] P2-T8 原文联动浏览区（点击曲线节点/处方引用→原文滚动高亮）
  - Priority: P0
  - Effort: M
  - Acceptance: 段落编号与拆解分析一致
  - Notes: OriginalText — 段落编号 01-NN，position(0-1)→最近段落映射，scrollIntoView + 暖金高亮；XrayReport 容器持 active anchor 状态总线
- [x] P2-T9 用户行为埋点（建议采纳/报告导出/评分/素材收藏/趋势关注）
  - Priority: P1
  - Effort: M
  - Acceptance: 埋点事件对齐 PRD 7.3 节关键事件
  - Notes: src/lib/report/analytics.ts — 轻量 localStorage 队列（SSR 安全 + 失败静默 + 500 条上限 + drain/peek 接口）。埋点接入：upload（file_uploaded/file_parse_failed/upload_submitted）、analyzing（analysis_completed/analysis_failed）、report（report_viewed/report_demo_viewed/report_rated/report_exported）、prescription（suggestion_adopted 带方向/适配分/adopt|undo）、NextSteps（writing_started from_source=teardown）
- [x] P2-T10 报告末尾"下一步行动引导"区域
  - Priority: P1
  - Effort: S
  - Acceptance: 引导选项动态基于诊断结果
  - Notes: NextSteps.tsx — 基于 diagnosis 与 type 动态排序：有 critical/处方已加载→开始创作；情节驱动+结构问题→查看相关热门元素；情感/氛围驱动→浏览相关素材；始终提供拆解下一篇（可用）+ 双篇对比。趋势/素材/对比功能 Phase 4+ 实现，标注"即将上线"不阻断

## Phase Notes
- Decisions: 可视化组件（情绪曲线/结构图谱）与报告布局可并行开发
- Blockers: 无（完整链路可用；无 OPENAI_API_KEY 时 /analyzing 降级提示，/report 回退演示数据）
- Resume point: Phase 2 完成，进入 Phase 3（基准库 + 种子测试）

## Session Log
| Date | Summary |
|:-----|:--------|
| 2026-07-02 | 完成 P2-T1/T4/T5/T6/T7/T8：四区域报告 + 原文联动 + 处方面板。新增 src/components/report/（XrayReport/OverviewCard/EmotionCurve/StructureMap/DimensionDetails/OriginalText/PrescriptionPanel）+ src/lib/report/（mock-data/dimensions）+ /report demo 路由。next build 通过，/report 静态预渲染成功。附带修复 tests/consistency-monitor.ts 预存类型错误（calcNumberConsistency 返回类型）以解除构建阻塞 |
| 2026-07-02 | 完成 P2-T2/T3：上传页（文本粘贴 + 3 可选自评 + 字数校验）+ 拆解进度页（四阶段动画 + 真实接入 /api/teardown + 降级出口）。新增 src/lib/report/session.ts（sessionStorage 跨页传递 FeedbackResult + 段落切分），/report 改造为优先读 sessionStorage 无则回退 mock（演示模式提示）。首页更新为 upload 入口 + report 演示入口。next build 通过，9 页全部生成 |
| 2026-07-02 | 改造上传为文件拖拽上传（全格式）：新增 src/lib/report/file-parser.ts（mammoth 解 docx + pdfjs-dist 解 pdf + 文本类直读 + RTF 剥控制字 + 二进制兜底），/upload 替换 textarea 为拖拽/点击上传 + 解析预览 + 折叠粘贴降级。装 mammoth + pdfjs-dist 依赖（动态 import 不进首屏 bundle） |
| 2026-07-02 | 完成 P2-T9 埋点 + P2-T10 下一步引导，Phase 2 收尾：新增 analytics.ts（localStorage 队列，对齐 PRD 7.3 事件名）+ NextSteps.tsx（诊断动态排序）；/report 加评分 + 导出 Markdown + NextSteps；PrescriptionPanel 加"我已采纳"按钮。修复 dimensions.ts 类型索引 + 清理 .next 缓存。next build 通过 9 页，Phase 2 10/10 完成 |
