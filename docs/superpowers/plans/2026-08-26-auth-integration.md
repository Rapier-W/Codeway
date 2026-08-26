# 真实短信与 Cookie 会话认证集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development or execute this plan task-by-task with review gates.

**Goal:** 在本地业务闭环基线上接入远端短信验证码与 Cookie Session 认证，并保持本地 Web HTTP 联调与字体系统。

**Architecture:** 采用选择性移植而非整体 merge。认证模块独立挂载到 NestJS，全局 Guard 负责 Cookie 会话和开发回退；Web Adapter 使用 `credentials: include`，登录页默认真实验证码流程。

**Tech Stack:** NestJS 10、Prisma 5、PostgreSQL、Vue 3、Vite、TypeScript、Vitest、七牛云短信。

**Spec:** `docs/superpowers/specs/2026-08-26-auth-integration-design.md`

## Global Constraints

- 本地业务实现优先，禁止用远端版本覆盖 Web HTTP 联调、幂等 migration、车辆状态机和页面测试。
- 生产环境禁止 `x-user-id` 身份伪造；开发回退必须显式受 `NODE_ENV !== production` 限制。
- 不提交密钥、`.env`、Cookie 原文或短信验证码日志。
- 保留本地移动端字体栈与视觉 token，不引入未经验证的远端字体覆盖。

---

### Task 1: 合并认证后端与数据库结构

**Files:**
- Create: `apps/api/src/auth/*.ts`
- Create: `apps/api/prisma/migrations/20260825210000_auth_session/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/http-app.ts`, `apps/api/package.json`, `apps/api/package-lock.json`, `apps/api/.env.example`
- Preserve: 本地平台幂等字段/migration、`AGENTS.md`、`TEAM-TASKS.md`
- Test: `apps/api/src/auth/*.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

- [ ] 先运行现有 API 测试建立基线：`npm test -- --runInBand`。
- [ ] 添加认证测试，覆盖验证码成功、错误/过期、Session 创建、Guard Cookie 校验、生产拒绝 `x-user-id`。
- [ ] 以远端认证实现为输入，手工整合模块、依赖、schema 和 migration，不覆盖本地业务字段。
- [ ] 删除未使用且无 migration 的 `FareDispute.requestKey` 字段，保留三个实际平台幂等字段。
- [ ] 运行 `npx prisma generate`、`npx prisma validate`、`npm run build` 和认证测试。

### Task 2: 切换 Web 登录到 Cookie Session

**Files:**
- Modify: `apps/web/src/views/LoginView.vue`, `apps/web/src/api/http-client.ts`, `apps/web/src/api/contracts.ts`, `apps/web/src/stores/session.ts`, `apps/web/src/api/http-client.spec.ts`
- Preserve: `apps/web/src/**/*.spec.ts` 页面测试、字体相关 CSS/token

- [ ] 先增加失败测试：HTTP 模式登录必须调用验证码校验而不是自动 dev-login；请求包含 `credentials: include`。
- [ ] 最小实现登录流程和显式 `VITE_ENABLE_DEV_LOGIN` 开关，默认走真实短信验证码。
- [ ] 验证登录回跳、会话用户加载和登出行为。
- [ ] 扫描 CSS/构建配置，确保字体族与本地基线一致，不出现远端字体覆盖。

### Task 3: 真实数据库迁移与 HTTP E2E

**Files:**
- Modify: `apps/api/test/postgres-http.e2e-spec.ts`, `TEAM-TASKS.md`, `apps/web/api-contract.md`

- [ ] 在 `tongluxing` 与隔离 `tongluxing_e2e` 执行 `npx prisma migrate deploy`，确认 `migrate status` up to date。
- [ ] 扩展真实 E2E：验证码登录、Cookie 访问受保护接口、登出后 401；保留原有聊天/费用/SOS/评价/平台幂等场景。
- [ ] 运行 API 默认测试、API build、Web Vitest、typecheck、build 和 `git diff --check`。
- [ ] 更新协同记录，记录本地优先合并、字体验收、测试结果与未接入边界。

### Task 4: 独立审查与集成提交

- [ ] 由不同代理审查认证安全、迁移一致性和字体冲突。
- [ ] 修复 Critical/Important 问题并重复全部验证。
- [ ] 提交：`codex: integrate remote auth while preserving local web flow`。
