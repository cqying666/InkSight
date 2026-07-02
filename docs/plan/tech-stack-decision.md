# 技术选型决策文档 — InkSight 创作教练

## 决策原则
- **轻量级优先**：最少依赖、最少服务、最少运维
- **一种语言**：前后端统一 TypeScript，降低心智负担
- **免运维**：托管服务优先，不自建数据库/服务器
- **免费层够用**：MVP 阶段所有服务免费层即可覆盖

## 选型决策

| 层 | 选型 | 版本 | 理由 |
|:---|:---|:---|:---|
| 前端+后端 | Next.js (App Router) | ^15 | 全栈一体，API Routes 内置，无需独立后端服务 |
| 语言 | TypeScript | ^5 | 类型安全，JSON schema 校验有保障 |
| UI 样式 | TailwindCSS | ^3 | 对齐落地页 Editorial 风格，原子化 CSS 零运行时 |
| 数据库 | Supabase (PostgreSQL) | 托管 | 免运维，免费层 500MB，自带 Auth/Realtime |
| 向量搜索 | pgvector (Supabase 内置) | -- | 无需单独向量库，PostgreSQL 扩展即可做语义检索 |
| 认证 | Supabase Auth | -- | 自带邮箱/社交登录，免开发 |
| LLM 服务 | DeepSeek | deepseek-chat | OpenAI 兼容接口，性价比高，中文表现优秀 |
| Schema 校验 | Zod | ^3 | 运行时类型校验，与 TypeScript 无缝集成 |
| 富文本编辑器 | TipTap | ^2 (Phase 5) | 基于 ProseMirror，轻量可扩展，支持段落编号 |
| 爬虫 | Python + GitHub Actions | -- (Phase 4) | 定时脚本，无需常驻服务 |
| 部署 | Vercel | -- | Next.js 原生支持，一键部署，免费层够用 |

## 替代方案与放弃理由

| 方案 | 放弃理由 |
|:-----|:---------|
| Vite + React + 独立后端 | 前后端分离增加复杂度，需维护两个服务 |
| Node Express 后端 | 需独立部署，Next.js API Routes 已够用 |
| MySQL | 不如 PostgreSQL 灵活，Supabase 不支持 |
| Pinecone/Milvus | 额外服务，pgvector 已够用且在 Supabase 内 |
| Node 爬虫 | Python 爬虫生态更成熟（requests/BS4/Selenium） |
| 自部署 LLM | 需要 GPU 服务器，成本高且运维复杂 |

## 用户需准备的账号

| 服务 | 用途 | 费用 | 注册地址 |
|:-----|:-----|:-----|:---------|
| Supabase | 数据库 + 认证 + 向量搜索 | 免费层 500MB | supabase.com |
| DeepSeek | LLM 调用（拆解/处方/语义搜索） | deepseek-chat 极便宜，国内可用 | platform.deepseek.com |
| Vercel | 部署 | 免费层够用 | vercel.com |
| GitHub | 代码托管 + 爬虫 Actions | 免费 | github.com |

> 本地开发只需 Supabase + DeepSeek 两个账号。Vercel/GitHub 仅部署时需要。
> DeepSeek 在国内可直接访问，无需代理。

## 环境变量

```env
# .env.local
LLM_API_KEY=sk-xxx                    # DeepSeek API Key
LLM_BASE_URL=https://api.deepseek.com # 可选，默认即此值
LLM_MODEL=deepseek-chat               # deepseek-chat(V3) / deepseek-reasoner(R1)

NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx         # 服务端用，绕过 RLS
```

## 架构图

```
┌──────────────────────────────────────────────────┐
│                 Vercel (部署)                     │
│                                                   │
│   ┌─────────────────────────────────────────┐    │
│   │         Next.js (App Router)            │    │
│   │                                          │    │
│   │   前端页面 (React + TailwindCSS)         │    │
│   │   API Routes (后端接口)                  │    │
│   │                                          │    │
│   │   ┌──────────┐  ┌──────────────────┐   │    │
│   │   │ DeepSeek │  │ Supabase Client  │   │    │
│   │   │ Client   │  │ (PostgreSQL+pg)  │   │    │
│   │   └────┬─────┘  └────────┬─────────┘   │    │
│   └────────┼─────────────────┼──────────────┘    │
│            │                  │                    │
└────────────┼──────────────────┼────────────────────┘
             │                  │
     ┌───────▼───────┐  ┌──────▼──────────────────┐
     │  DeepSeek API │  │     Supabase             │
     │  (LLM 服务)   │  │  ┌────────────────────┐  │
     │ deepseek-chat │  │  │ PostgreSQL         │  │
     │  OpenAI 兼容  │  │  │ + pgvector (向量)   │  │
     └───────────────┘  │  │ + Auth (认证)      │  │
                        │  └────────────────────┘  │
                        └──────────────────────────┘
```
