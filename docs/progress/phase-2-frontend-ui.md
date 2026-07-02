# Phase 2: 前端界面

## Goal
X 光片四区域界面，情绪曲线可视化，点击跳转（PRD 第 8.2 节，第 5-6 周）

## Status
- not-started

## Tasks
- [ ] P2-T1 设计系统建立（色板/字体/间距/组件库）
  - Priority: P0
  - Effort: M
  - Acceptance: 设计 token 文件 + 基础组件库可复用
  - Notes: 对齐落地页 Editorial 文学杂志风格（seal red #8B2635 / warm gold #A87E3B / ink black #1A1614 / warm ivory）
- [ ] P2-T2 小说上传页（txt/富文本粘贴 + 3 自评问题）
  - Priority: P0
  - Effort: M
  - Acceptance: 上传后进入等待状态，自评数据入库，自评可选
- [ ] P2-T3 拆解进度展示页（进度条约 30 秒）
  - Priority: P0
  - Effort: S
  - Acceptance: 识别类型→分析钩子→绘制曲线→生成反馈 四段动画
- [ ] P2-T4 X 光片报告 — 总览卡片（一句话总评 + 反直觉发现）
  - Priority: P0
  - Effort: M
  - Acceptance: 反直觉发现展示在最显眼位置
- [ ] P2-T5 X 光片报告 — 情绪曲线可视化（双线叠加+标记点+点击跳转）
  - Priority: P0
  - Effort: L
  - Acceptance: 点击节点原文区滚动到对应位置并高亮
- [ ] P2-T6 X 光片报告 — 结构图谱（全文缩略条形图）
  - Priority: P0
  - Effort: M
  - Acceptance: 三幕结构占比可视化
- [ ] P2-T7 X 光片报告 — 维度详情折叠卡片（类型权重控制高亮/折叠）
  - Priority: P0
  - Effort: M
  - Acceptance: 高亮维度展开，次要维度折叠
- [ ] P2-T8 原文联动浏览区（点击曲线节点/处方引用→原文滚动高亮）
  - Priority: P0
  - Effort: M
  - Acceptance: 段落编号与拆解分析一致
- [ ] P2-T9 用户行为埋点（建议采纳/报告导出/评分/素材收藏/趋势关注）
  - Priority: P1
  - Effort: M
  - Acceptance: 埋点事件对齐 PRD 7.3 节关键事件
- [ ] P2-T10 报告末尾"下一步行动引导"区域
  - Priority: P1
  - Effort: S
  - Acceptance: 引导选项动态基于诊断结果

## Phase Notes
- Decisions: 可视化组件（情绪曲线/结构图谱）与报告布局可并行开发
- Blockers: 无（依赖 Phase 1 完成）
- Resume point: 从 P2-T1 开始
