# Phase 4: 趋势+素材基础

## Goal
热门元素雷达上线，素材库基础版（自动提取+语义搜索）（PRD 第 8.2 节，第 9-14 周）

## Status
- not-started

## Tasks
- [ ] P4-T1 平台榜单采集器（番茄/知乎盐选/七猫/点众，每日 1 次）
  - Priority: P0
  - Effort: L
  - Acceptance: 采集标题/作者/标签/热度/排名变化，不采集正文
- [ ] P4-T2 采集合规评估（robots.txt + 反爬政策 + 法律评估）
  - Priority: P0
  - Effort: M
  - Acceptance: 评估报告落档，不合规项有替代方案
- [ ] P4-T3 趋势数据模型与存储（题材/元素/热度/时间序列）
  - Priority: P0
  - Effort: M
  - Acceptance: 支持按平台/时间范围查询
- [ ] P4-T4 LLM 辅助标签分类（题材标签 + 元素标签）
  - Priority: P0
  - Effort: M
  - Acceptance: 标签分类准确率 >90%（抽样人工校验）
- [ ] P4-T5 趋势热力图前端（题材×元素矩阵，平台筛选+时间回溯）
  - Priority: P0
  - Effort: L
  - Acceptance: 点击单元格查看详情
- [ ] P4-T6 题材生命周期标注（萌芽/爆发/平台/衰退四阶段算法）
  - Priority: P0
  - Effort: M
  - Acceptance: 算法基于热度趋势与总量，可解释
- [ ] P4-T7 元素组合推荐（Top 组合 + 代表作 + 结构特征摘要）
  - Priority: P0
  - Effort: M
  - Acceptance: 结构特征摘要从拆文数据库提取
- [ ] P4-T8 趋势元素详情卡（热度走势/跨平台分布/常见搭配/代表结构模式）
  - Priority: P1
  - Effort: M
  - Acceptance: 一键收藏到素材库灵感层
- [ ] P4-T9 三层素材数据模型（原子/组件/灵感，含来源标注）
  - Priority: P0
  - Effort: M
  - Acceptance: 模型支持来源作品信息与用户编辑
- [ ] P4-T10 拆文自动提取素材管线（拆文完成→提取组件素材→入库）
  - Priority: P0
  - Effort: L
  - Acceptance: 提取钩子/反转/情绪曲线/弧光/冲突五类，准确率 >80%
- [ ] P4-T11 向量数据库接入 + 素材向量化管道
  - Priority: P0
  - Effort: M
  - Acceptance: 素材文本嵌入入库，支持相似度检索
- [ ] P4-T12 语义搜索接口（自然语言查询→三层素材匹配）
  - Priority: P0
  - Effort: M
  - Acceptance: 支持类型/情绪/结构维度筛选
- [ ] P4-T13 素材库前端（三层浏览/搜索/筛选/收藏/文件夹分类）
  - Priority: P0
  - Effort: L
  - Acceptance: 界面对齐 PRD 5.6 节布局
- [ ] P4-T14 个人素材收藏（从拆文报告/热门元素/创作工作台收藏）
  - Priority: P1
  - Effort: M
  - Acceptance: 支持自定义标签与笔记
- [ ] P4-T15 免费增值 + Pro 订阅（额度限制 + 付费墙 + 订阅流程）
  - Priority: P0
  - Effort: M
  - Acceptance: 免费版 3 篇/月 + 素材库 50 条上限；Pro 无限
- [ ] P4-T16 降级机制（采集失败/平台不可用/语义搜索超时）
  - Priority: P0
  - Effort: M
  - Acceptance: 覆盖 PRD 6.3 节趋势与素材相关降级

## Phase Notes
- Decisions: 趋势模块（P4-T1~T8）与素材模块（P4-T9~T14）可并行；合并点在 P4-T8（趋势元素→素材库收藏）
- Blockers: 合规评估（P4-T2）决定趋势模块能否上线
- Resume point: 趋势与素材双线并行启动
