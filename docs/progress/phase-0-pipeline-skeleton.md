# Phase 0: 管线骨架

## Goal
拆解 prompt 跑通，14 维度 JSON 输出正确（PRD 第 8.2 节，第 1-2 周）

## Status
- complete

## Tasks
- [x] P0-T1 技术选型决策文档 → `docs/plan/tech-stack-decision.md`
  - Next.js 15 + Supabase + OpenAI gpt-4o-mini + TailwindCSS + Zod
- [x] P0-T2 项目脚手架搭建
  - Next.js 15 App Router + TypeScript + TailwindCSS
  - 依赖安装完成（389 packages），`npx next build` 通过
  - 路由：`/` `/api/health` `/api/teardown`
- [x] P0-T3 LLM 服务接入层 → `src/lib/llm/client.ts`
  - 统一 `callLLM()` / `callLLMWithSchema()` 接口
  - 支持 JSON 模式、超时 60s、重试 1 次、Schema 校验反馈
- [x] P0-T4 拆解 prompt 设计 v1 → `src/lib/teardown/prompt.ts`
  - 三层 14 维度 system prompt
  - 每维度 evidence 字段约束
- [x] P0-T5 14 维度 JSON schema → `src/lib/teardown/schema.ts`
  - Zod schema 覆盖骨架5/血肉5/风格4 三层
  - `validateTeardown()` 校验器
  - 类型权重模板 `TYPE_WEIGHT_TEMPLATES`
- [x] P0-T6 类型识别 prompt → `src/lib/teardown/type-detection.ts`
  - 独立类型识别步骤（置信度<0.7 降级 mixed）
  - 权重模板加载逻辑
- [x] P0-T7 5 篇测试集 → `tests/fixtures/`
  - 悬疑/言情/氛围/动作/混合 各 1 篇（~600字/篇）
- [x] P0-T8 拆解管线端到端联调
  - API 路由 `/api/teardown` 实现
  - 测试脚本 `tests/e2e-teardown.ts`
  - `npx next build` 编译通过

## Phase Notes
- Decisions: 技术栈 Next.js + Supabase + DeepSeek（轻量级全栈方案）
- LLM 切换: OpenAI → DeepSeek（OpenAI 兼容接口，国内可用，无需代理）
- 验收: 构建通过，API 可调用；端到端测试需配置 LLM_API_KEY 后运行 `npx tsx tests/e2e-teardown.ts`
- 下一步: 进入 Phase 1 — 诊断+处方
