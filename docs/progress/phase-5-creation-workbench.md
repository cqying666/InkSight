# Phase 5: 创作工作台

## Goal
创作编辑器，结构大纲，素材侧栏，实时结构提示，写后分析（PRD 第 8.2 节，第 15-22 周）

## Status
- not-started

## Tasks
- [ ] P5-T1 创作编辑器内核（富文本/自动保存30s+失焦/字数统计/阅读时长）
  - Priority: P0
  - Effort: L
  - Acceptance: 编辑器干扰极简，自动保存可靠
- [ ] P5-T2 章节分隔与段落编号系统（与拆文分析编号一致）
  - Priority: P0
  - Effort: M
  - Acceptance: 段落编号唯一且与拆解对应
- [ ] P5-T3 全屏专注模式（隐藏所有侧栏）
  - Priority: P1
  - Effort: S
  - Acceptance: 一键切换，状态持久化
- [ ] P5-T4 结构大纲搭建（钩子/三幕/反转/结局/情绪曲线目标）
  - Priority: P0
  - Effort: L
  - Acceptance: 大纲可从拆文结果或素材库模板生成
- [ ] P5-T5 结构参考线渲染（文档左侧淡色标注结构位置）
  - Priority: P0
  - Effort: M
  - Acceptance: 参考线为视觉辅助，不限制内容
- [ ] P5-T6 素材侧栏 — 主动推荐（情境匹配）
  - Priority: P0
  - Effort: L
  - Acceptance: 推荐采纳率目标 >20%（开头段/反转附近/对话密集区）
- [ ] P5-T7 素材侧栏 — 手动搜索与快捷插入
  - Priority: P0
  - Effort: M
  - Acceptance: 原子素材插入光标位置，组件素材展开详情
- [ ] P5-T8 素材侧栏 — 拖拽收藏（写作中灵感片段拖入素材库）
  - Priority: P1
  - Effort: M
  - Acceptance: 拖拽创建原子素材，自动标注来源
- [ ] P5-T9 实时结构提示（底部进度/段落类型/反转距离/情绪概览）
  - Priority: P0
  - Effort: L
  - Acceptance: 只提醒位置不评价内容；接近反转节点提示变淡黄
- [ ] P5-T10 写后分析一键触发（对创作产出运行拆文引擎）
  - Priority: P0
  - Effort: M
  - Acceptance: 复用拆文管线，生成 X 光片报告
- [ ] P5-T11 双篇对比完整版（用户作品 vs 参考作品，多维差异+可视化）
  - Priority: P0
  - Effort: L
  - Acceptance: "学到的模式是否用上"可视化
- [ ] P5-T12 创作完成"下一步引导"（写后分析/对比/收藏素材）
  - Priority: P1
  - Effort: S
  - Acceptance: 引导选项动态基于创作产出
- [ ] P5-T13 降级机制（实时提示失败/侧栏推荐失败）
  - Priority: P0
  - Effort: M
  - Acceptance: 覆盖 PRD 6.3 节创作工作台降级

## Phase Notes
- Decisions: 编辑器内核（P5-T1）是基础，段落编号（P5-T2）必须与拆文一致以保证写后分析无缝对应
- Blockers: 依赖 Phase 4 素材库（P5-T6/P5-T7 需语义搜索）
- Resume point: 从 P5-T1 开始
