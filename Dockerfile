# ===== Stage 1: builder =====
FROM node:22.19-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 编译需要 python3 + make + g++
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 移除 devDependencies，仅保留生产依赖
RUN npm prune --omit=dev

# ===== Stage 2: runner =====
FROM node:22.19-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root 用户运行
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

# 生产依赖（native 模块已为 linux/arm64 编译）
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
# Next.js 构建产物
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# 运行时配置
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./

# 创建持久化数据目录（由 docker-compose 挂载卷覆盖）
RUN mkdir -p public data .zvec-data .models && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

CMD ["npm", "start"]
