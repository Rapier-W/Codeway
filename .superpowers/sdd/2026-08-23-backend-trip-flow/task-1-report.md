# Task 1 报告：后端工程骨架与数据库基线

执行者：Kimi K3 ｜ 日期：2026-08-23 ｜ 分支：codex/backend-trip-flow（隔离 worktree）

## 改动文件（已提交 260c030）

- `apps/api/package.json` — 依赖与脚本；内联 Jest 配置（testRegex `.*spec\.ts$`，ts-jest）
- `apps/api/package-lock.json` — 锁定依赖
- `apps/api/tsconfig.json` — NestJS 标准编译配置
- `apps/api/nest-cli.json` — Nest CLI 配置
- `apps/api/src/main.ts` — 启动入口，端口取 `PORT`（默认 3000）
- `apps/api/src/app.module.ts` — 内联 HealthController，`GET /health` 返回 `{ status: "ok" }`
- `apps/api/prisma/schema.prisma` — User / Trip / TripMember / TripConfirmation / RecommendationDecision / AuditLog 六模型基线
- `apps/api/prisma/seed.ts` — 空操作种子（可重复执行，不写敏感数据）
- `apps/api/test/health.e2e-spec.ts` — Supertest 健康检查 e2e
- `docker-compose.yml` — PostgreSQL 16-alpine 服务（含 healthcheck，密码经 `${POSTGRES_PASSWORD}` 注入）
- `.env.example` — 环境变量模板（占位值，无真实密钥）

未提交的本地文件：`apps/api/.env`（由 `.env.example` 复制的本地占位值，`.gitignore` 第 3 行 `.env` 已覆盖，`git check-ignore` 验证通过）。本报告文件亦未提交。

## 测试命令与原样结果

TDD 顺序：先写 `health.e2e-spec.ts`，将 `src/` 暂移走后运行确认失败，再恢复实现。

1. 失败确认（RED）— `npm test -- --runInBand`（src 暂移走）：
   ```
   error TS2307: Cannot find module '../src/app.module' or its corresponding type declarations.
   Test Suites: 1 failed, 1 total / Tests: 0 total / TEST_EXIT=1
   ```
   另发现并已修复两处问题：testRegex 原为 `.*\.spec\.ts$` 不匹配 `health.e2e-spec.ts`（改为 `.*spec\.ts$`）；supertest 需默认导入（`import request from 'supertest'`）；`@nestjs/testing` 漏配已补入 devDependencies。

2. `npx prisma validate`（首次因缺 DATABASE_URL 报 P1012，创建 gitignored 的 `apps/api/.env` 后）：
   ```
   Environment variables loaded from .env
   Prisma schema loaded from prisma\schema.prisma
   The schema at prisma\schema.prisma is valid 🚀
   VALIDATE_EXIT=0
   ```

3. 最终 `npm test -- --runInBand`（新鲜运行）：
   ```
   PASS test/health.e2e-spec.ts
     GET /health (e2e)
       √ returns HTTP 200 with { status: "ok" } (46 ms)
   Test Suites: 1 passed, 1 total
   Tests:       1 passed, 1 total
   Time:        8.293 s
   FINAL_TEST_EXIT=0
   ```

4. `npm install`：成功，`added 608 packages`，exit 0。npm allow-scripts 策略拦截了 prisma 的 postinstall（引擎未自动下载），不影响 `prisma validate` 与测试；后续任务首次 `prisma generate`/`migrate` 前需 `npm approve-scripts` 放行。

## 设计要点

- 容量：`Trip.capacity` 注释声明仅 3|4、总人数含发单人；Prisma schema 无法表达 CHECK，3|4 校验留给应用层（Task 2 DTO/事务），后续迁移可加原生 SQL `CHECK (capacity IN (3,4))`。
- `TripMember.memberCount` 支持一次加入 1–2 名拼友；`@@unique([tripId, userId])` 为加入幂等兜底。
- `TripConfirmation.idempotencyKey @unique` 支持重复确认幂等；`retractUntil` 预留 15 秒反悔窗口；`Trip.version` 预留乐观锁。
- `RecommendationDecision.reasons` 为字符串数组（白名单 TIME_CLOSE/RELIABLE/VERIFIED/OPEN_SLOT，最多 3 个，应用层强制）。

## 未完成项

- 未运行 `prisma migrate` / `prisma generate`（无运行中的 PostgreSQL，且引擎下载被 npm allow-scripts 拦截）；Docker 未验证（未执行 `docker compose up`）。
- 未实现任何业务逻辑、认证、聊天、小程序（按边界留待 Task 2+）。

## 风险

- capacity 3|4 目前仅有 schema 注释，无数据库级 CHECK；若绕过应用层写库可产生非法容量，建议首个迁移任务补原生 CHECK。
- NestJS 依赖为 ^10 版本线，Prisma 提示可升级 7.9.1（大版本，未跟随，保持计划基线）。
- `docker-compose.yml` 使用 `:?` 强制要求 `POSTGRES_PASSWORD`，未建 `.env` 时 `docker compose up` 会报错，属预期行为；`.env.example` 已给出模板。
