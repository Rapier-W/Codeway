# Web 与 NestJS 真实 HTTP 联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让主要 Web/PWA 页面在 HTTP 模式下使用真实 NestJS API 完成可验证的业务闭环。

**Architecture:** 保留 `ApiClient` 作为前端边界，由 `HttpApiClient` 负责路径、请求头和响应归一化；NestJS 增加最小的我的行程查询接口并复用现有领域服务。页面只依赖 `ApiClient`，Mock 客户端继续用于单元测试。

**Tech Stack:** NestJS、Prisma、PostgreSQL、Vue 3、TypeScript、Pinia、Vitest、Jest、PWA。

**Spec:** `docs/superpowers/specs/2026-08-25-http-integration-design.md`

## Global Constraints

- 所有写请求携带 `Idempotency-Key`，认证使用现有开发会话占位；不得把 `dev-login` 当成生产认证。
- `Trip.capacity` 只允许 3/4，成员占用数包含发布者，加入人数只允许 1/2。
- 行程状态使用 `RECRUITING → CONFIRMING → FORMED → WAITING_RIDE → RIDE_BOOKED → PENDING_SETTLEMENT → SETTLED → PENDING_REVIEW → ARCHIVED`，另有 `CANCELLED`、`EXPIRED`、`ORDER_DISPUTED`。
- 订单争议时锁定结算、支付标记和评价；前端必须禁用对应操作并给出原因。
- Kodo、真实短信、WebSocket 和自动报警不在本计划中。
- 不提交 `.env`、数据库密码、短信/Kodo/地图密钥。

---

### Task 1: 后端我的行程和响应契约

**Files:**
- Modify: `apps/api/src/trips/trips.controller.ts`
- Modify: `apps/api/src/trips/trips.service.ts`
- Create: `apps/api/src/trips/dto/list-my-trips.dto.ts`
- Test: `apps/api/test/trips.e2e-spec.ts`

**Interfaces:**
- Produces `GET /trips/mine?role=joined|published`.
- Response items include `id`, `origin`, `destination`, `departTime`, `capacity`, `activeMemberCount`, `status`, `fareOrderId`, `disputeLocked`, and `role`.

- [ ] 写测试：创建两个用户和两类行程，验证发布者、成员只能看到自己的对应角色。
- [ ] 运行 `npm test -- --runInBand test/trips.e2e-spec.ts`，确认新增测试失败。
- [ ] 实现 DTO、controller 路由（放在 `@Get(':id')` 之前）和 service 查询。
- [ ] 统一计算 `activeMemberCount` 与首个订单 ID，避免前端依赖 Prisma 内部结构。
- [ ] 重跑该测试并运行 API 默认测试。
- [ ] 提交 `codex: add my trips HTTP query`。

### Task 2: Web API 契约与 HTTP Adapter

**Files:**
- Modify: `apps/web/src/api/contracts.ts`
- Modify: `apps/web/src/api/http-client.ts`
- Modify: `apps/web/src/api/mock-client.ts`
- Test: `apps/web/src/api/http-client.spec.ts`

**Interfaces:**
- Adds `listMyTrips(role)`, `confirmFareOrder`, `disputeFareOrder`, `updateVehicle`, `openRide`, `listMessagesPage`, and `addEmergencyContact`.
- `TripStatus` includes every status in Global Constraints.
- `MessagePage` preserves `messages`, `hasMore`, and `nextCursor`.

- [ ] 写失败测试，断言 URL、方法、body、幂等头和响应归一化。
- [ ] 运行 `npm test -- http-client.spec.ts`，确认失败。
- [ ] 实现 HTTP 方法和 Mock 对应方法，统一 `ApiError`。
- [ ] 修复成员数从 `members[].memberCount` 汇总的 Adapter 逻辑。
- [ ] 重跑 API client 测试、typecheck。
- [ ] 提交 `codex: align web HTTP contracts`。

### Task 3: 我的出行、聊天和评价页面

**Files:**
- Modify: `apps/web/src/views/MyTripsView.vue`
- Modify: `apps/web/src/views/ChatView.vue`
- Modify: `apps/web/src/views/ReviewView.vue`
- Create/Modify: `apps/web/src/stores/my-trips.ts`
- Test: corresponding `*.spec.ts`

- [ ] 先写页面/store 失败测试：真实 client 被调用、空状态和错误重试可见。
- [ ] 实现我的出行双标签、聊天历史分页和纯空格拒绝。
- [ ] 评价页加载订单关联行程成员，提供目标成员选择并排除当前用户。
- [ ] 重跑页面测试、typecheck 和 build。
- [ ] 提交 `codex: connect trip history chat and review views`。

### Task 4: 订单、车辆、叫车和联系人页面

**Files:**
- Modify: `apps/web/src/views/OrderView.vue`
- Modify: `apps/web/src/views/RideView.vue`
- Modify: `apps/web/src/views/ProfileView.vue`
- Modify: `apps/web/src/components/RideFallback.vue`
- Test: `apps/web/src/views/OrderView.spec.ts`, `apps/web/src/views/RideView.spec.ts`, `apps/web/src/views/ProfileView.spec.ts`

- [ ] 写失败测试覆盖确认、异议、车辆保存、叫车降级和联系人保存。
- [ ] 实现 loading/error/success 状态、刷新和争议锁定。
- [ ] 从路由读取真实 tripId，移除硬编码路线与电话。
- [ ] 重新执行 Web 全套测试、typecheck、build。
- [ ] 提交 `codex: complete HTTP-backed action pages`。

### Task 5: 集成验收与协同记录

**Files:**
- Modify: `TEAM-TASKS.md`
- Modify: `apps/web/api-contract.md`

- [ ] 更新旧 Web 集成记录为完成，新增本轮接口和已知边界。
- [ ] 执行 API `npm test -- --runInBand`、`npm run test:e2e:postgres`、`npm run build`。
- [ ] 执行 Web `npm test -- --run`、`npm run typecheck`、`npm run build`。
- [ ] 检查 `git diff --check`、工作树和不应提交的密钥文件。
- [ ] 请求独立代码审查，修复 P0/P1 问题后合并回 `master`。
