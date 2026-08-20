# Quick Slice Brief

## Intent

- User request: 用 Pi Agent 替换 InkSight 全部 LLM 调用与模型管理，并继续第二阶段。
- Target outcome: 所有模型回合、普通教练流和大纲 Agent 均经 Pi AI + Pi Agent；AI 管理持久化 Pi Model 规格；工作台有用户隔离的主线会话与分支。
- Non-goals: 不接入 Pi coding-agent/TUI/文件/Shell/任意第三方工具；不自动修改作品；不使用 Pi Harness 持久化层。

## Scope

- Files or modules likely touched: `src/lib/pi/*`、`src/lib/llm/client.ts`、`src/lib/ai/models.ts`、AI 路由、模型管理、工作台会话 UI、SQLite schema、Docker 与合同测试。
- Allowed changes: 引入固定 Pi 依赖、升级 Node 运行时、映射模型规格、持久化只读对话树。
- Forbidden changes: 保留直接 OpenAI SDK/Chat Completions 调用、暴露 API Key、跨用户读取会话、自动写稿。

## Acceptance Criteria

- [x] Primary behavior works: 全部 LLM 调用从产品直连层切到 Pi Provider + Pi Agent。
- [x] Failure or edge state is handled: Pi faux provider 覆盖文本、流、JSON 与错误；客户端取消可中止 Agent。
- [x] Existing behavior preserved: 作品与素材只由用户写入；会话分支按用户和作品隔离。

## Implementation Notes

- Current evidence: Pi `0.84.2` provider/model adapter、Pi Agent wrapper、SQLite 会话树和模型规格已落地；源代码不再有直接 OpenAI SDK 或 `/chat/completions` 调用。
- Smallest implementation step: 清理既有全量类型错误后，执行端到端登录态下的真实模型冒烟测试。
- Verification command: `npm run test:pi-agent && npm run test:pi-models && npm run test:coach-sessions && npx tsx tests/outline-agent-tools.ts && npm run build`。

## Review Notes

- Self-review focus: Pi 的 ESM 打包、模型 API 兼容性、会话分支用户隔离和无自动写稿。
- Residual risk: Pi 的根入口在 Next 构建时产生 dynamic-dependency warning；`npm audit --omit=dev` 报告 Pi AI 的 `@google/genai → protobufjs` critical 传递风险；任意自定义 endpoint 仍需在真实模型配置下验证 OpenAI-compatible 兼容性。
- Follow-up only if needed: 修复现有全量类型错误并进行登录态端到端冒烟；随后再考虑多模型原生 provider 与 Agent 工具扩展。
