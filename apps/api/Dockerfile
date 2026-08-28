# apps/api/Dockerfile
# 多阶段构建：构建期安装全部依赖并编译 NestJS，运行期仅保留产物与生成客户端。
# 构建上下文为仓库根目录（见 docker-compose.prod.yml 的 context: .）。
FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/package.json apps/api/package-lock.json* ./
COPY apps/api/nest-cli.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/prisma ./prisma
COPY apps/api/src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=512
# 保留完整 node_modules（含 prisma CLI 便于 migrate deploy）与编译产物、prisma schema。
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
