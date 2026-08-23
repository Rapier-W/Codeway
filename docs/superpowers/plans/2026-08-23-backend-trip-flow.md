# 同路行后端首个垂直闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可测试的 NestJS + TypeScript + Prisma 后端，并贯通手机号验证后的发布行程、多人容量、列表推荐理由、加入、成员确认、15 秒回退和我的出行核心闭环。

**Architecture:** 采用模块化单体后端，PostgreSQL 作为业务事实源。首阶段使用 REST API 和数据库持久化；聊天先保留 REST 消息接口，WebSocket 作为后续适配边界。所有行程状态变更由服务端事务、行级锁/版本号和幂等键保证。

**Tech Stack:** Node.js 22+, TypeScript, NestJS, Prisma, PostgreSQL, Jest, Supertest, Docker Compose。

**Spec:** `E:\night-ride\docs\02-功能清单.md`、`E:\night-ride\docs\03-页面设计.md`、`E:\night-ride\docs\07-系统架构方案.md`

## Global Constraints

- MVP 单车总人数只能是 3 或 4（含发单人），一次加入只能是 1–2 名拼友。
- 未完成手机号验证的用户只能浏览，不能发布或加入；学生认证只作信任标签，不拦截。
- 列表只返回未来行程，按 `depart_time ASC`；每张卡片最多 3 个固定推荐理由，不改变排序。
- 主状态：`招募中 → 双向确认中 → 已成团 → 待叫车 → 已叫车 → 行程结束待结算 → 结算完成 → 待评价 → 已归档`。
- 全部成员确认后才能成团；最后一名成员确认开启 15 秒反悔窗口。
- 反悔窗口内任一成员撤回，行程原子回退为“招募中”，所有确认作废并通知全部成员。
- 重复确认、撤回、加入和事件上报必须幂等，不得重复成团或超容量。
- 金额使用整数分；客户端不作为费用、权限和状态的可信来源。
- 推荐理由白名单：`TIME_CLOSE`、`RELIABLE`、`VERIFIED`、`OPEN_SLOT`；低信用行程不返回正向理由。

---

### Task 1: 后端工程骨架与数据库基线

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/test/health.e2e-spec.ts`
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Produces `GET /health` returning `{ status: "ok" }`.
- Produces Prisma models for `User`, `Trip`, `TripMember`, `TripConfirmation`, `RecommendationDecision`, and `AuditLog`.

- [ ] **Step 1: Write the failing health test** asserting `GET /health` returns HTTP 200 and `status=ok`.
- [ ] **Step 2: Run `npm test -- --runInBand` and verify the test fails because the app does not exist.**
- [ ] **Step 3: Scaffold the NestJS app, Prisma schema, Docker PostgreSQL service, and environment template.**
- [ ] **Step 4: Run `npm install`, `npx prisma validate`, and the health test; verify all pass.**
- [ ] **Step 5: Commit with `codex: scaffold api and database baseline`.**

### Task 2: Trip domain and capacity-safe join flow

**Files:**
- Create: `apps/api/src/trips/trips.module.ts`
- Create: `apps/api/src/trips/trips.controller.ts`
- Create: `apps/api/src/trips/trips.service.ts`
- Create: `apps/api/src/trips/dto/create-trip.dto.ts`
- Create: `apps/api/src/trips/dto/list-trips.dto.ts`
- Create: `apps/api/src/trips/dto/join-trip.dto.ts`
- Create: `apps/api/src/trips/trips.service.spec.ts`
- Create: `apps/api/test/trips.e2e-spec.ts`

**Interfaces:**
- `POST /trips` accepts origin, destination, departTime, capacity (3|4), feePlan, and femaleOnly.
- `GET /trips?date=&origin=&time=&femaleOnly=` returns future trips ordered by `departTime ASC` with up to 3 reason codes.
- `GET /trips/:id` returns trip, members, capacity, and canonical status.
- `POST /trips/:id/join` accepts `memberCount` 1 or 2 and is idempotent by request key.

- [ ] **Step 1: Write tests for unverified-user rejection, capacity validation, 1–2 member joins, over-capacity rejection, future-time filtering, and time ordering.**
- [ ] **Step 2: Run the focused tests and verify each fails for the missing domain behavior.**
- [ ] **Step 3: Implement DTO validation, service transactions, unique membership constraints, and reason-code generation.**
- [ ] **Step 4: Run focused unit/e2e tests and verify the full happy path plus rejection cases.**
- [ ] **Step 5: Commit with `codex: add capacity-safe trip flow`.**

### Task 3: Member confirmation, 15-second rollback, and audit events

**Files:**
- Create: `apps/api/src/trips/dto/confirm-trip.dto.ts`
- Create: `apps/api/src/trips/dto/withdraw-confirmation.dto.ts`
- Modify: `apps/api/src/trips/trips.service.ts`
- Create: `apps/api/src/trips/confirmation.service.ts`
- Create: `apps/api/src/trips/confirmation.service.spec.ts`
- Create: `apps/api/test/confirmations.e2e-spec.ts`

**Interfaces:**
- `POST /trips/:id/confirmations` accepts an idempotency key and confirms the current member.
- `POST /trips/:id/confirmations/:confirmationId/withdraw` is valid only before `retractUntil`.
- Produces audit events for confirm, form-group, withdraw, rollback, and duplicate requests.

- [ ] **Step 1: Write tests for partial confirmation, all-member confirmation, duplicate confirmation, concurrent confirmation, within-window withdrawal, expired withdrawal, and rollback notification events.**
- [ ] **Step 2: Run focused tests and verify they fail before the state machine is implemented.**
- [ ] **Step 3: Implement transaction boundaries with row locking/version checks and unique current-confirmation constraints.**
- [ ] **Step 4: Run focused tests plus the complete API test suite; verify no duplicate group formation or invalid state transition.**
- [ ] **Step 5: Commit with `codex: enforce confirmation state machine`.**

### Task 4: Minimal client contract and developer documentation

**Files:**
- Create: `apps/miniprogram/README.md`
- Create: `apps/miniprogram/api-contract.md`
- Create: `docs/superpowers/specs/2026-08-23-trip-flow-api.md`
- Modify: `TEAM-TASKS.md`

- [ ] **Step 1: Document request/response examples for login placeholder, trips, join, confirmation, and withdrawal.**
- [ ] **Step 2: Document canonical statuses, error codes, empty states, and idempotency requirements.**
- [ ] **Step 3: Run a Markdown link/path check and compare each contract field with the NestJS DTOs.**
- [ ] **Step 4: Commit with `codex: document trip flow api contract`.**

## Deferred after this plan

Third-party ride adapters, vehicle sync, Kodo order screenshots, fee disputes, SOS, reviews, reporting, WebSocket delivery, and the native WeChat mini-program UI are separate bounded plans. They must not be silently folded into these tasks.

