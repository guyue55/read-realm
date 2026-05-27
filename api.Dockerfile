# api.Dockerfile (基于 Turborepo 增量裁剪的多阶段构建最佳实践)

# ==========================================
# 阶段 1: Pruner (剪裁依赖与源码树)
# ==========================================
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
# 全局安装 turborepo
RUN npm install -g turbo
# 复制完整源码
COPY . .
# 精准裁剪 api 应用及其相关 packages 依赖
RUN turbo prune --scope=api --docker

# ==========================================
# 阶段 2: Builder (依赖安装与生产包编译)
# ==========================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# 安装 pnpm (强制锁定 9.x)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 首先只复制 packages 和 apps 的 package.json 等元数据信息，以最大化利用 Docker 层缓存
COPY --from=pruner /app/out/json/ .
COPY pnpm-workspace.yaml .npmrc ./

# 缓存安装依赖
RUN pnpm install --frozen-lockfile

# 复制真正的最小裁剪源码树进行编译
COPY --from=pruner /app/out/full/ .
# 编译打包 API 服务
RUN pnpm run build --filter=api

# 剪裁冗余的 node_modules 仅保留生产环境运行必需的依赖
RUN pnpm prune --prod --no-optional

# ==========================================
# 阶段 3: Runner (极致精简的安全生产环境)
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

# 设置生产环境变量
ENV NODE_ENV=production
# 允许外部挂载 SQLite 数据库及文件存储目录
ENV DATA_DIR=/app/data

# 建立无特权的非 root 安全运行用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# 复制打包产物和裁剪后的生产 node_modules
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages

# 建立数据挂载点并授权
RUN mkdir -p /app/data && chown -R nestjs:nodejs /app/data
VOLUME [ "/app/data" ]

# 切换为安全用户
USER nestjs

# 暴露 NestJS 服务端口
EXPOSE 3000

# 启动 NestJS 生产环境应用
CMD ["node", "apps/api/dist/main"]
