# web-pwa.Dockerfile (基于 Next.js 生产环境构建的最佳实践)

# ==========================================
# 阶段 1: Pruner (剪裁依赖与源码树)
# ==========================================
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=web-pwa --docker

# ==========================================
# 阶段 2: Builder (依赖安装与 Next.js 打包)
# ==========================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=pruner /app/out/json/ .
COPY pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# 拷贝裁剪出的全量源码
COPY --from=pruner /app/out/full/ .

# 在编译时，将生产环境变量设为 production
ENV NODE_ENV=production
# 禁用 Next.js telemetry 数据收集
ENV NEXT_TELEMETRY_DISABLED=1

# 进行前端编译构建
RUN pnpm run build --filter=web-pwa

# ==========================================
# 阶段 3: Runner (生产运行环境)
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js 运行默认端口，支持环境变量覆盖
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 建立无特权的非 root 安全运行用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 拷贝编译产物与运行时 node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-pwa/.next ./apps/web-pwa/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-pwa/public ./apps/web-pwa/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-pwa/package.json ./apps/web-pwa/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages

USER nextjs

EXPOSE 3000

# 运行 Next.js 服务
CMD ["npx", "next", "start", "apps/web-pwa"]
