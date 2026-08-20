# Pi Agent Migration Plan

## Target

将 InkSight 所有模型调用收敛到 Pi：`pi-ai` 负责 Provider/Model/auth/usage，`pi-agent-core` 负责每一次模型回合与流式事件。现有 SQLite 继续作为模型配置、用户数据与会话树的权威存储。

## Scope

- 替换 `src/lib/llm/client.ts` 中的 OpenAI SDK 调用。
- 替换 `/api/coach` 与 `/api/outline-coach` 中的手写 Chat Completions SSE。
- 扩展 `ai_models` 和 AI 管理页为 Pi 模型规格。
- 新增用户隔离的会话/消息/分支数据模型与工作台 UI。
- 升级 Docker Node 运行时，固定 Pi 依赖版本。

## Non-goals

- 不接入 `pi-coding-agent`、Pi TUI、文件工具、Shell 工具或第三方扩展。
- 不使用 Pi Harness 的持久化会话 API；当前版本 API 仍在快速演化。
- 不改变拆文 schema、处方规则或现有业务数据格式。

## Execution

1. **M1 Runtime cutover — complete**
   - 建立每个管理员模型配置对应的 Pi Provider/Model adapter。
   - 用 Pi Agent 包装统一结构化调用与文本流。
   - 删除直接 OpenAI SDK 与 `/chat/completions` 使用。
2. **M2 Pi model management — complete**
   - 持久化 `pi_api`、上下文窗口、输出上限、推理开关。
   - AI 管理页编辑这些 Pi 模型规格，运行时使用精确版本的 Pi adapter。
3. **M3 Conversation tree — complete**
   - 按用户和作品持久化主会话、消息和父子分支。
   - 工作台支持创建/切换分支；仅保存对话，绝不自动写入文稿。
4. **M4 Verification — in progress**
   - Pi faux provider 合同测试、现有 schema 回归、SQLite 用户隔离测试和生产构建。

## Risks and Stops

- Pi 需要 Node 22.19+；容器升级失败即停止切换。
- 配置的 endpoint 若不兼容 OpenAI Completions，模型需在 AI 管理页标记失败，不能静默回退到旧 SDK。
- 用户隔离、JSON schema 或流式输出回归即停止并保留数据库数据；不执行自动删除或重置。
- 当前阻塞：工作区已有 `src/app/api/admin/users/route.ts` 与 `src/app/api/writing-documents/route.ts` 类型错误，导致全量构建尚不能通过；Pi 相关合同测试已通过。
- 依赖审计：`npm audit --omit=dev` 当前报告 1 个 critical / 8 个 high；其中 `protobufjs` critical 来自 Pi AI 的 `@google/genai` 传递依赖。Pi 上游固定的版本需要单独评估，当前不执行未经验证的 `npm audit fix`。
