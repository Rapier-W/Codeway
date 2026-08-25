# TEAM-TASKS.md — 同路行当前任务状态

> Codex 统筹者每次会话开始必读；任务分配或状态变化时追加/更新记录，保留历史。

## 协作架构

- 统筹者：Codex
- 规划与风险复核：Reasonix DeepSeek V4 Flash
- 高风险独立审查：Reasonix GLM-5.2
- 实现与测试：Kimi K3
- 项目规则：见项目根 `AGENTS.md`

## 当前状态

**Web/PWA 前端与独立后端基线开发进行中。** 前端 Task 1–6 已完成；后端 Task 1（NestJS + Prisma + PostgreSQL 骨架）已完成，下一步进入行程容量与加入接口。

## 任务分配表

| 任务 ID | 任务描述 | 执行者 | 状态 | 产出 | 更新时间 |
|---|---|---|---|---|---|
| BOOT-20260823-01 | 初始化 Git、建立项目协同规则和代理路由 | Codex | 已完成 | `AGENTS.md`、`TEAM-TASKS.md`、Git 仓库 | 2026-08-23 |
| WEB-20260824-01 | Vue 3 + Vite + Vant + Pinia + PWA 基础工程、契约 Adapter 与 Mock | Codex + 实现代理 | 已完成 | `apps/web/`、`docs/superpowers/specs/2026-08-24-web-pwa-design.md`、`docs/superpowers/plans/2026-08-24-web-pwa.md` | 2026-08-24 |
| WEB-20260824-02 | 登录、行程列表/筛选、发布、详情、加入申请与访问保护 | Codex + Reasonix 复核 | 已完成 | `apps/web/src/views/`、`apps/web/src/components/`、`apps/web/src/api/`、`apps/web/src/router/` | 2026-08-24 |
| DEV-20260823-01 | Task 1：NestJS + Prisma 后端骨架与数据库基线 | Kimi K3 → Codex | 已完成 | `apps/api/`、`docker-compose.yml`、`.env.example` | 2026-08-23 |
| DEV-20260823-02 | Task 2:行程域与容量安全加入流程(发布/列表/容量/幂等) | Codex + Reasonix 复核 | 已完成 | `apps/api/src/trips/`、`apps/api/test/trips.e2e-spec.ts`、`test/real-capacity-concurrency.e2e-spec.ts` | 2026-08-24 |

## Task 1 后端审查记录

- 源分支提交：`260c030 kimi: scaffold api and database baseline`；当前分支合并提交：`a764b64`。
- Codex 验证：健康检查测试、Nest build、Prisma schema validate 通过；报告：`.superpowers/sdd/2026-08-23-backend-trip-flow/task-1-report.md`。
- 剩余风险：容量约束和状态事务留给后端 Task 2/3；生产 PostgreSQL 部署方式仍待上线前确定。

## DEV-20260824-02 行程容量与加入接口
- 状态：已完成
- 目标：按 `docs/superpowers/specs/2026-08-24-trip-flow-api.md` 实现发布、列表、详情、加入和推荐理由顺序。
- 约束：手机号验证、3/4 人容量、1/2 人加入、事务锁、幂等和未来行程排序必须由服务端保证。
- 产出：`apps/api/src/trips/`、`apps/api/prisma/migrations/20260824190000_trip_domain_checks/migration.sql`。
- 验证：8 个测试套件/28 个测试通过；Nest build、Prisma generate、Prisma validate、diff check 通过；独立代理复核实现。
- 真实数据库：已在本机 Docker PostgreSQL `localhost:5433` 执行 migration deploy；后续仍需在独立测试环境做并发验证。
- 注意：实现提交同时包含此前已存在的 platform/fare/confirmation 模块，已纳入当前 API build/test 验证，后续需单独做范围审查。

### DEV-20260824-02 真实 PostgreSQL migration 验证

- 状态：已完成
- 目标：补齐 Prisma 初始建表 migration，并在本机 Docker PostgreSQL `localhost:5433` 上执行真实 migration 链。
- 产出：`apps/api/prisma/migrations/20260824180000_initial_schema/migration.sql`、`apps/api/prisma/migrations/migration_lock.toml`。
- 验证：`npx prisma migrate status` 显示数据库为 up to date；`npx prisma migrate deploy` 成功应用 `20260824180000_initial_schema` 与 `20260824190000_trip_domain_checks`；`npx prisma validate` 通过；`git diff --check` 通过。
- 数据库边界：使用 `apps/api/.env` 中的本机连接串（端口 5433），未提交 `.env` 或任何凭据。

## DEV-20260824-03 Web/PWA API 契约文档
- 状态：已完成
- 产出：`apps/web/api-contract.md`，记录已实现后端路径、前端字段映射和真实供应商接入边界。
- 验证：文档路径和接口与当前 NestJS controller 对照；真实认证、短信、Kodo、地图和 WebSocket 仍明确标注为未接入。

## 子任务模板

`目标｜输入文件｜产出文件｜不可修改范围｜验收命令｜完成标准｜状态回写`

## 调用与审查规则

- 涉及 3 个以上文件、跨前后端/数据库边界、预计超过 30 分钟，或有安全/迁移/发布风险时，至少调用一个子代理。
- 规划、架构权衡和常规审查优先 Reasonix DeepSeek；复杂架构、安全和高风险改动升级 GLM-5.2。
- 跨文件编码、测试和文档落地交给 Kimi K3；由 Codex 或 Reasonix 独立复核。
- 高风险改动必须使用与实现者不同的代理复核。
- 子代理返回后，Codex 必须检查 diff、运行验收命令，并在此文件记录结论、文件路径、测试结果和剩余风险。

## 安全待办

- Kimi CLI 凭据轮换后改用环境变量注入；不得将新凭据写入仓库。
- 域名、HTTPS、小程序服务器域名、七牛云 VM 规格和备份策略在部署任务开始前补齐。

## FIX-20260825-01 队友 HTTP 分支回归修复

- 状态：**真实 PostgreSQL 验收、master 合并、E 盘同步与 GitHub 推送均已完成**。
- 已集成：保留聊天 REST、DTO 和统一错误；恢复创建行程幂等 migration 与并发 P2002 回读；恢复确认响应 Adapter；SOS 改为成员校验、幂等且不持久化坐标；订单详情使用真实 `fareOrderId`；评价改为订单反查行程并校验成员、非自评、目标同程、评分 DTO、争议锁与幂等；聊天 P2002 并发幂等回读；生产环境拒绝 `x-user-id` 身份伪造；费用状态机补 `ORDER_DISPUTED`，统一费用实现，并在全员费用确认后真实推进 `PENDING_SETTLEMENT → SETTLED → PENDING_REVIEW`。
- 测试资产：新增 `apps/api/test/postgres-http.e2e-spec.ts` 和 `npm run test:e2e:postgres`，覆盖创建、聊天、SOS、订单争议与评价的真实 PostgreSQL HTTP 闭环；已使用隔离 `tongluxing_e2e` 数据库执行。
- 已验证：正式库 `tongluxing` 与隔离库 `tongluxing_e2e` migrations 均 up to date；真实 PostgreSQL HTTP E2E `1 suite / 5 tests` 通过；API `npm run build`；默认测试 `9 suites / 33 tests`；Web `typecheck`、PWA build、`11 files / 20 tests`；`prisma validate` 和 `git diff --check`。
- 历史阻塞已解除：当前分支 `.env` 已配置 `DATABASE_URL=localhost:5433/tongluxing` 与独立 `E2E_DATABASE_URL=localhost:5433/tongluxing_e2e`，两者认证均通过。
- 协作：Reasonix 完成独立高风险审查并发现订单状态机缺口，已纳入修复；Kimi Code CLI 已调用两次，但分别因会话存储权限与 `agent.activity.updated` 生命周期错误退出，未对工作树产生修改。
- 交付：本地 master merge commit 为 `7852173`，Web 旧回归测试修正为 `ef2361c`；E:\Codeway 已同步；GitHub `origin/master` 已推送发布提交 `d522553`，发布 tree 排除了 `AGENTS.md` 与 `TEAM-TASKS.md`。

# Task 3 frontend status

- Commit `ee77032`: login, trip discovery/filtering, publish validation, detail and join sheet.
- Verification: targeted Vitest 2 files / 2 tests passed; `npm run typecheck` passed; `npm run build` passed with PWA assets; `git diff --check` passed.
- Note: targeted TripsView test emits a Vue router injection warning because it intentionally mounts without a router; production build is clean.

## Web/PWA Task 1–3 审查记录

- 视觉与移动基线：深墨蓝、夜行蓝、路灯橙、雾白；手机单列、44px 触控目标、48px 主按钮、安全区和 `100dvh` 已落地。
- Adapter：HTTP 对后端 `departTime/reasonCodes/OPEN_SLOT` 归一化为前端字段；详情使用 `GET /trips/:id`，满员行程不会从详情中消失。
- 访问与可用性：发布/详情受保护路由保存安全同源 redirect；加入弹层支持 `aria-modal`、初始焦点、Escape 和焦点恢复；卡片支持 Enter/Space。
- 最新验证：`npm test` → 6 个测试文件、15 个测试通过；`npm run typecheck` 通过；`npm run build` 通过并生成 `manifest.webmanifest`、`sw.js`；`git diff --check` 通过。列表测试仍有一个未注入 Router 的 Vue warning，不影响测试结果。
- 协作：Kimi CLI 本轮启动时返回 `Agent event 'agent.activity.updated' has no active lifecycle context`，未能执行；由等价实现代理完成 bounded Task 3。Reasonix DeepSeek 完成独立风险复核并推动契约映射、登录回跳和可访问性修复。
- 后续边界：Task 4 需重新设计 Mock 的 `CONFIRMING → FORMED → 15 秒撤回` 全员确认模型；当前确认 Adapter 仅保留接口对齐，不将单人确认误当成最终成团。

## WEB-20260824-04 确认与费用锁定闭环
- 状态：已完成（commit c5e12aa）
- 产出：CONFIRMING 全员确认、FORMED 15秒反悔倒计时、confirmationId 撤回、争议/结算锁定、金额 >0 校验。
- 验证：3 suites/9 tests passed；typecheck/build passed；diff check仅已修复末尾空行。

## WEB-20260824-05 SOS 与个人页
- 状态：已完成（commit dc1872d）
- 产出：移动端长按 SOS 事件记录、手动拨打 110、紧急联系人引导、个人页入口。
- 边界：不自动短信/报警，不保存精确位置；联系人当前为页面演示状态，持久化需后端契约。
- 验证：专项测试、typecheck、build 通过；由独立实现代理完成。

## WEB-20260824-06 集成验收
- 状态：已完成（本轮联调已收敛）
- 当前证据：Web Vitest 12 suites/24 tests、typecheck、生产 build（含 PWA manifest/sw）和 git diff --check 通过；API 默认测试 9 suites/34 tests、Nest build 和真实 PostgreSQL HTTP E2E 1 suite/5 tests 通过。
- 历史静态页面已替换：我的出行、聊天游标、订单确认/异议、车辆保存、手动叫车、紧急联系人和评价目标选择均通过 ApiClient 调用真实 HTTP 契约。
- 保留边界：真实短信/会话认证、Kodo 签名、WebSocket 和自动报警仍未接入；HTTP 联调继续使用开发登录与 `x-user-id` 占位。

## WEB-20260825-HTTP-01 真实 HTTP 联调

- 状态：已完成
- 目标：让 Web/PWA 主要页面与 NestJS + PostgreSQL 真实业务接口形成可验证闭环，并更新协同记录。
- 后端产出：`GET /trips/mine?role=joined|published`，返回角色范围内行程、成员占用人数、订单 ID 和争议锁；订单详情附带同程成员供评价选择。
- 前端产出：扩展 `ApiClient`/HTTP Adapter（我的行程、费用确认/异议、车辆、叫车、联系人、聊天游标）；替换 `MyTripsView`、`ChatView`、`OrderView`、`RideView`、`ProfileView`、`ReviewView` 静态/本地状态；统一全量 `TripStatus` 和成员数映射。
- 验证：API `npm test -- --runInBand`（9 suites/34 tests）、`npm run build`、`npm run test:e2e:postgres`（5 tests）通过；Web `npm test -- --run`（12 suites/24 tests）、`npm run typecheck`、`npm run build` 通过。
- 风险：评价页当前从订单成员中选择用户 ID；真实会话恢复和正式认证需在后续 Task 5 独立完成。
