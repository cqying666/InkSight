# 项目上下文

## 技术栈

- 运行时：Node．js。
- 框架：Next．js 15、React 19、TypeScript、Tailwind CSS、Zod。
- 包管理器：npm。
- 当前数据层：浏览器 localStorage 与 sessionStorage。

## 常用命令

- 安装：`npm install`。
- 类型检查：`npx tsc --noEmit --incremental false`。
- 生产构建：`npm run build`。
- 本地运行：`npm run dev`。

## 架构规则

- 页面入口位于 `src/app`，共享界面位于 `src/components`，纯数据逻辑位于 `src/lib`。
- 拆文生产数据使用 `AnalysisResult`，不得把旧 `TeardownResult` 提取器直接接到新报告。
- 素材统一使用 `Material`，通过 `source／layer／component.kind` 与标签表达来源、层级和当前业务分类。
- 工作台正文、大纲和辅助文档分别使用既有存储键，升级时必须向后兼容。
- AI 上下文必须由显式引用组成，并在服务端做结构与长度校验。

## 交付规则

- 默认分支：`main`。
- 不覆盖用户已有草稿、素材、大纲和分析结果。
- 不执行删除、重置、强推或擅自提交。
- 交付前必须完成类型检查、生产构建、关键纯函数验证与浏览器主流程验证。

## 禁止变更

- 不修改 `inksight-landing.html`。
- 不在本切片引入账号、付费、数据库或新的模型供应商。
- 未完成合规评估前，不扩大趋势采集范围。
