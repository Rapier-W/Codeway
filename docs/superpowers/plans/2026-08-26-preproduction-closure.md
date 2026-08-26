# 上线前费用闭环与可重复验收实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在上线前补齐费用订单幂等、成团后分摊变更、短信日志隐私、截图 90 天留存，并让 PostgreSQL E2E 隔离且能证明真实锁竞争超时。

**Architecture:** 通过 Prisma migration 建立订单幂等字段、不可变费用方案修订、变更申请/决策和截图保留字段；FarePlanService 与 FareService 在锁定 Trip 行的事务中执行状态机。短信改为显式提供者和统一脱敏日志；E2E 使用 run-scoped fixture 与第二个 Prisma 连接验证真实 PostgreSQL 锁超时。

**Tech Stack:** NestJS 10、TypeScript、Prisma 5、PostgreSQL、Jest、Supertest、Kodo ObjectStorageProvider、PowerShell。

**Spec:** docs/superpowers/specs/2026-08-26-preproduction-closure-design.md

## Global Constraints

- 不引入在线支付、钱包、资金托管、自动叫车下单、WebSocket 或普通用户争议结案入口。
- 所有状态写入先在 PostgreSQL 事务中锁定 Trip 行；失败不得留下部分记录。
- 费用分摊变更只作用于 fare-plan revision，不触发成团 15 秒反悔状态机。
- 实际费用订单同一行程不可被新请求覆盖；请求键、上传意图和订单必须严格绑定。
- 日志禁止验证码、完整手机号、Authorization、请求/响应正文、供应商原文和 session token。
- 生产密钥仅通过环境变量注入；不得提交 .env、真实 Kodo 对象、测试凭据或敏感日志。
- 每个任务按 RED → GREEN → 重构 → 新鲜验证 → 提交执行；实现者与复核者必须不同代理。

## 文件结构与边界

- apps/api/prisma/schema.prisma：模型、关系和状态字段。
- apps/api/prisma/migrations/20260826120000_preproduction_closure/migration.sql：DDL、唯一索引和 partial index。
- apps/api/src/fare/fare.service.ts：实际订单幂等、上传意图消费、截图查看和保留清理。
- apps/api/src/fare/fare.controller.ts：订单 Idempotency-Key 和费用方案路由。
- apps/api/src/fare/fare-plan.service.ts：方案规范化、修订确认、申请和决策状态机。
- apps/api/src/fare/dto/：订单、方案、申请和决策 DTO。
- apps/api/src/fare/fare-upload-cleanup.service.ts：上传意图和绑定截图清理入口。
- apps/api/src/auth/sms.service.ts：显式短信提供者和脱敏日志。
- apps/api/src/fare/*.spec.ts、apps/api/test/*.e2e-spec.ts：单测和真实数据库 HTTP 验收。

### Task 0: 创建隔离工作区并验证基线

**Files:** .worktrees/preproduction-closure（worktree）；读取 AGENTS.md、TEAM-TASKS.md、规格和本计划。

**Interfaces:** 消费当前 master 的 de23d35；产出分支 codex/preproduction-closure，不污染主工作树。

- [ ] **Step 1: 检查忽略、创建 worktree**
```
git check-ignore -q .worktrees
if ($LASTEXITCODE -ne 0) { throw '.worktrees must be ignored' }
git worktree add .worktrees/preproduction-closure -b codex/preproduction-closure
Set-Location .worktrees/preproduction-closure
git status --short
```
- [ ] **Step 2: 运行基线**
```
Set-Location apps/api
npm test -- --runInBand
npm run build
npx prisma validate
```
Expected：基线测试、build、Prisma validate 通过；失败需先记录，不归因于本计划。
- [ ] **Step 3: Commit**
```
git commit --allow-empty -m "codex: start preproduction closure worktree"
```

### Task 1: 实际费用订单 Idempotency-Key 与不可覆盖

**Files:** 修改 apps/api/prisma/schema.prisma、apps/api/src/fare/fare.controller.ts、apps/api/src/fare/fare.service.ts；新增 migration；测试 fare.service.spec.ts 和 postgres-http.e2e-spec.ts。

**Interfaces:** 消费 IdempotencyKey decorator、ObjectUpload 原子认领和 statObject；产出 createOrder(tripId, userId, dto, requestKey)，响应不再含 overwritten。

- [ ] **Step 1: 先写 RED**
```
it('rejects a missing order key', async () => {
  await expect(service.createOrder('trip-1', 'user-1', dto, '')).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED');
});
it('does not overwrite an existing order with another key', async () => {
  await postOrder('key-a', uploadA, 1200).expect(201);
  await postOrder('key-b', uploadB, 1300).expect(409);
  await expect(prisma.fareOrder.count({ where: { tripId } })).resolves.toBe(1);
});
```
- [ ] **Step 2: 运行 RED**
```
npm test -- --runInBand apps/api/src/fare/fare.service.spec.ts
npm run test:e2e:postgres -- --runInBand apps/api/test/postgres-http.e2e-spec.ts
```
- [ ] **Step 3: 添加 schema/migration**
给 FareOrder 添加 requestKey unique、sourceUploadId unique，并建立 ObjectUpload.fareOrder 关系；migration 回填既有数据后创建唯一索引。
- [ ] **Step 4: 实现事务**
```
await lockTrip(client, tripId);
const sameKey = await client.fareOrder.findUnique({ where: { requestKey } });
if (sameKey) return assertSameOrderRequest(sameKey, tripId, userId, dto);
if (await client.fareOrder.findUnique({ where: { tripId } })) {
  throw new ConflictException('FARE_ORDER_ALREADY_SUBMITTED');
}
// stat object -> conditional ObjectUpload claim -> create FareOrder
```
同键请求体不同返回 IDEMPOTENCY_KEY_REUSED；捕获 P2002 后只按请求键回读；不得删除旧确认/支付记录。
- [ ] **Step 5: GREEN、migration、build**
```
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm test -- --runInBand apps/api/src/fare/fare.service.spec.ts
npm run build
```
- [ ] **Step 6: Commit**
```
git add apps/api/prisma apps/api/src/fare apps/api/test/postgres-http.e2e-spec.ts
git commit -m "codex: make fare order creation idempotent"
```

### Task 2: 成团后费用分摊修订与全员变更申请

**Files:** 修改 schema.prisma、fare.controller.ts、fare.module.ts；新增 fare-plan.service.ts、fare-plan.service.spec.ts、fare-plan.dto.ts、fare-plan-change-request.dto.ts、fare-plan-decision.dto.ts 和 migration；更新 HTTP E2E。

**Interfaces:** 消费 TripMember 快照、TripStatus、IdempotencyKey 和审计模式；产出 getFarePlan、createChangeRequest、decideChangeRequest、confirmRevision。

- [ ] **Step 1: 先写 RED**
```
it('rejects CUSTOM allocations whose total is not 100', async () => {
  await expect(service.createChangeRequest(tripId, creatorId,
    { proposedPlan: { mode: 'CUSTOM', allocations: { a: 50, b: 49 } } }, 'key'))
    .rejects.toThrow('FARE_PLAN_PERCENT_TOTAL_INVALID');
});
it('supersedes the old revision only after every member approves', async () => {
  const change = await service.createChangeRequest(tripId, creatorId, changeDto, 'change-1');
  await service.decideChangeRequest(change.id, memberId, { decision: 'APPROVED' }, 'decision-1');
  expect(await oldRevisionStatus()).toBe('SUPERSEDED');
});
```
- [ ] **Step 2: 运行 RED**
```
npm test -- --runInBand apps/api/src/fare/fare-plan.service.spec.ts
```
- [ ] **Step 3: 添加模型和索引**
建立 FarePlanRevision、FarePlanConfirmation、FarePlanChangeRequest、FarePlanChangeDecision；创建 request/member/revision 唯一键和每行程至多一个 PENDING 申请的 partial unique index。回填当前方案的初始 revision。
- [ ] **Step 4: 实现锁定事务**
```
if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_CHANGE_FARE_PLAN');
if (trip.disputeLocked || hasSubmittedFareOrder(trip.id)) {
  throw new ConflictException('FARE_PLAN_CHANGE_NOT_ALLOWED');
}
// lock Trip + request; compare frozen member IDs; reject/expire/apply atomically
```
全员批准时旧确认标记 VOID、旧 revision 标记 SUPERSEDED、创建新 PENDING_CONFIRMATION revision 并审计；不触发 15 秒成团反悔。
- [ ] **Step 5: 写 HTTP E2E**
覆盖 3/4 人、发布者权限、非成员表决、拒绝、24 小时过期、同键重复表决、成员集合变化和再次全员确认。
- [ ] **Step 6: GREEN、build、commit**
```
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm test -- --runInBand
npm run build
git add apps/api/prisma apps/api/src/fare apps/api/test/postgres-http.e2e-spec.ts
git commit -m "codex: add fare plan change workflow"
```

### Task 3: 短信日志脱敏与显式提供者

**Files:** 修改 apps/api/src/auth/sms.service.ts、sms.service.spec.ts、必要时 auth.module.ts 和 .env.example。

**Interfaces:** 消费 SMS_PROVIDER=dev|qiniu 和 Qiniu 环境变量；产出 maskPhone(phone)、不泄密日志和生产 fail-closed 配置检查。

- [ ] **Step 1: 先写 RED**
```
it('never logs the verification code or full phone', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await service.sendCode('13800000000', '127.0.0.1');
  const output = log.mock.calls.flat().join(' ');
  expect(output).not.toContain('123456');
  expect(output).not.toContain('13800000000');
  log.mockRestore();
});
```
- [ ] **Step 2: 实现并验证**
SMS_PROVIDER=dev 只记录掩码手机号、关联 ID 和 provider；qiniu 只记录状态码/错误分类，不读取响应正文。生产未知或缺失 provider 直接拒绝启动/发送。
```
npm test -- --runInBand apps/api/src/auth/sms.service.spec.ts
npm run build
git add apps/api/src/auth apps/api/.env.example
git commit -m "codex: redact sms logs"
```

### Task 4: 截图 90 天留存、争议结案和清理

**Files:** 修改 schema.prisma、fare.service.ts、fare-upload-cleanup.service.ts、相关 migration、fare.service.spec.ts 和 HTTP E2E；新增 fare-retention.service.spec.ts。

**Interfaces:** 消费 ObjectStorageProvider 删除/签名、FareDispute 和订单确认；产出 cleanupExpiredBoundScreenshots(now)、resolveFareDisputeForRetention(orderId, actorId, resolvedAt)。

- [ ] **Step 1: 先写时间注入 RED**
```
expect(await service.cleanupExpiredBoundScreenshots(day89)).toBe(0);
expect(await service.cleanupExpiredBoundScreenshots(day90)).toBe(1);
expect(await service.cleanupExpiredBoundScreenshots(day90)).toBe(0);
```
- [ ] **Step 2: 添加字段和状态语义**
增加 retentionDeleteAfter、screenshotDeletedAt、FareDispute.resolvedAt；确认后设 90 天，争议时清空，受控结案后从 resolvedAt 重计。
- [ ] **Step 3: 实现清理与下载限制**
逐订单锁定并复查开放争议；先删对象，再条件更新删除时间并审计。对象不存在按幂等成功；已删订单详情为 screenshotAvailable=false，下载返回 410 SCREENSHOT_RETENTION_EXPIRED。
- [ ] **Step 4: GREEN、migration、commit**
```
npx prisma validate
npx prisma migrate deploy
npm test -- --runInBand apps/api/src/fare
npm run build
git add apps/api/prisma apps/api/src/fare apps/api/test/postgres-http.e2e-spec.ts
git commit -m "codex: enforce fare screenshot retention"
```

### Task 5: PostgreSQL E2E run-scoped fixture 与自动清理

**Files:** 新增 apps/api/test/helpers/postgres-fixture.ts；修改 postgres-http.e2e-spec.ts、auth-postgres.e2e-spec.ts 和必要的 API test scripts。

**Interfaces:** 消费 E2E_DATABASE_URL 和 Prisma 外键；产出 createFixture(prisma, runId)、cleanupFixture(prisma, fixture)，清理失败必须抛错。

- [ ] **Step 1: 先写 RED 隔离测试**
```
const a = await createFixture(prisma, 'run-a-test-a');
const b = await createFixture(prisma, 'run-a-test-b');
expect(a.creatorId).not.toBe(b.creatorId);
await cleanupFixture(prisma, a);
await expect(prisma.trip.findUnique({ where: { id: a.tripId } })).resolves.toBeNull();
await expect(prisma.trip.findUnique({ where: { id: b.tripId } })).resolves.not.toBeNull();
await cleanupFixture(prisma, b);
```
- [ ] **Step 2: 实现 fixture 和逆序删除**
每个测试独立创建带 run token 的用户/行程/请求键；按 Review、PaymentMark、费用确认/方案决策、争议、订单、上传、叫车、车辆、聊天、SOS、通知、审计、成员、session、短信、行程、用户顺序清理，仅使用 fixture ID。
- [ ] **Step 3: 移除共享状态并连续运行**
```
npm run test:e2e:postgres
npm run test:e2e:postgres
npm run build
```
连续两次均通过；清理检查只针对本次 run token，不删除 migration 或外部数据。
- [ ] **Step 4: Commit**
```
git add apps/api/test apps/api/package.json
git commit -m "codex: isolate postgres e2e fixtures"
```

### Task 6: 真实 PostgreSQL 锁竞争与状态超时

**Files:** 新增 apps/api/test/postgres-lock-contention.e2e-spec.ts；修改 apps/api/src/platform/platform.service.ts、必要时 prisma.service.ts、.env.example 和 HTTP E2E。

**Interfaces:** 消费 stateTx/RIDE_STATE_BUSY；产出测试专属 POSTGRES_LOCK_TIMEOUT_MS，且只映射 P2028/P2024/55P03。

- [ ] **Step 1: 先写真实锁 RED E2E**
```
const holder = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
await holder.$transaction(async client => {
await client.$queryRawUnsafe('SELECT id FROM trips WHERE id = $1 FOR UPDATE', tripId);
  await signalLockHeld();
  await waitForRelease();
});
const response = await request(app.getHttpServer()).post('/api/trips/' + tripId + '/ride/open')
  .set('x-user-id', creatorId).set('Idempotency-Key', key).send({ platform: 'manual' });
expect(response.status).toBe(503);
expect(response.body.code).toBe('RIDE_STATE_BUSY');
```
- [ ] **Step 2: 实现事务级超时和错误识别**
事务开始执行 SET LOCAL lock_timeout；只将 P2028、P2024 和嵌套 cause 的 SQLSTATE 55P03 转为 ServiceUnavailableException('RIDE_STATE_BUSY')，其他错误原样抛出。
- [ ] **Step 3: 验证释放锁重试和无部分写入**
释放 holder 后用新键重试必须 201；失败请求没有 RideRecord/VehicleUpdate；保留 mock 快速回归。
- [ ] **Step 4: 运行并提交**
```
npm run test:e2e:postgres
npm test -- --runInBand
npm run build
git add apps/api/src/platform apps/api/test apps/api/.env.example
git commit -m "codex: verify real postgres lock contention"
```

### Task 7: 全量复验、独立审查与协同记录

**Files:** 修改本地 TEAM-TASKS.md 和与费用状态/保留期冲突的 API/架构文档；不上传协同文件。

**Interfaces:** 消费 Task 1–6 提交；产出测试证据、独立复核结论和剩余风险。

- [ ] **Step 1: 运行 API、Web 和仓库卫生验证**
```
Set-Location apps/api
npx prisma migrate status
npx prisma validate
npm test -- --runInBand
npm run test:e2e:postgres
npm run build
Set-Location ../web
npm test -- --run
npm run typecheck
npm run build
Set-Location ../..
git diff --check
git status --short
```
- [ ] **Step 2: 独立复核**
复核订单不可覆盖、请求键重用、成员快照权限、短信日志、截图留存、migration、E2E 清理和真实 503 证据；Codex 检查 diff 并重跑命令。
- [ ] **Step 3: 更新协同记录并提交**
在 TEAM-TASKS.md 写入每个任务 SHA、测试数量、数据库仅写主机/端口、复核结论和剩余风险，然后提交：
```
git add docs TEAM-TASKS.md
git commit -m "codex: close preproduction validation"
```

## 完成判定

- [ ] 同键订单并发只产生一张订单并只消费一次上传意图；跨键不会覆盖。
- [ ] 3/4 人分摊变更覆盖全员同意、拒绝、过期、非成员和重复决策；新修订重新全员锁定。
- [ ] 日志无完整手机号、验证码或供应商正文。
- [ ] 截图 89/90 天、争议、结案重计时和重复清理均通过。
- [ ] PostgreSQL E2E 独立且连续运行两次无业务污染。
- [ ] 真实锁竞争返回 503/RIDE_STATE_BUSY，释放后重试成功且无部分写入。
- [ ] API/Web 全量验证、migration、build、diff check 和独立复核全部通过。
