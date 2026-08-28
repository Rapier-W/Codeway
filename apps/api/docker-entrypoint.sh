#!/bin/sh
set -e

# 生产启动入口：
# 1) 应用已合并的 Prisma 迁移（migrate deploy 幂等；仅运行评审过、已合入的迁移文件）。
# 2) 启动 NestJS 服务。
# 注意：绝不在此执行 migrate dev / db push / 重置数据库；迁移文件由 CI 与代码评审控制。
echo "[entrypoint] applying prisma migrations (migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] starting API..."
exec node dist/main.js
