# TEAM-TASKS.md — Codeway当前任务状态

> Codex 统筹者每次会话开始必读；任务分配或状态变化时追加/更新记录，保留历史。

## 协作架构

- 统筹者：Codex
- 规划与风险复核：Reasonix DeepSeek V4 Flash
- 高风险独立审查：Reasonix GLM-5.2
- 实现与测试：Kimi K3
- 项目规则：见项目根 `AGENTS.md`

## 当前状态

**Task 2 已实现并完成 Codex 集成验证；当前变更仍待同步/提交。** Task 1 的启动路径阻断已修复，行程发布与加入闭环已落地。

## 任务分配表

| 任务 ID | 任务描述 | 执行者 | 状态 | 产出 | 更新时间 |
|---|---|---|---|---|---|
| BOOT-20260823-01 | 初始化 Git、建立项目协同规则和代理路由 | Codex | 已完成 | `AGENTS.md`、`TEAM-TASKS.md`、Git 仓库 | 2026-08-23 |
| DEV-20260823-01 | Task 1：NestJS + Prisma 后端骨架与数据库基线 | Kimi K3 → Codex | 已完成 | `apps/api/`、`docker-compose.yml`、`.env.example` | 2026-08-23 |
| DEV-20260823-02 | Task 2：行程发布、列表推荐理由、容量安全加入与幂等 | Codex | 已完成（待同步） | `apps/api/src/trips/`、`apps/api/test/trips.e2e-spec.ts` | 2026-08-23 |
| DEV-20260823-03 | Task 3：双向确认、15 秒反悔回退、状态机与审计 | Codex | 已完成（待同步） | `apps/api/src/trips/confirmation.service.ts`、`apps/api/test/confirmations.e2e-spec.ts` | 2026-08-23 |
| DEV-20260823-04 | MVP 交付闭环：费用争议、叫车降级、安全、评价举报、埋点、契约 | Codex + Kimi K3 | 已完成（待同步） | `apps/api/src/fare/`、`apps/api/src/platform/`、`apps/miniprogram/`、`DEPLOYMENT.md` | 2026-08-23 |

## Task 1 审查记录

- Kimi 提交：`260c030 kimi: scaffold api and database baseline`。
- Codex 验证：`npm test -- --runInBand` 通过（1/1）；`npm run build` 通过；带临时 `DATABASE_URL` 的 `npm run prisma:validate` 通过。
- 剩余风险：容量约束和状态事务留给 Task 2/3；生产 PostgreSQL 部署方式仍待上线前确定。

## Task 2 审查记录

- 启动修复：增加 `apps/api/tsconfig.build.json`，Nest 生产入口统一输出为 `dist/main.js`；Docker PostgreSQL 仅绑定 `127.0.0.1`。
- 功能：手机号验证门控、容量 3/4、成员占位 1/2、未来行程筛选/时间排序、固定推荐理由白名单、低信用不展示理由、加入请求幂等。
- 验证：`npm run prisma:validate`、`npm run build`、`npm test -- --runInBand --no-cache`（7/7）及 `npm start` `/health` smoke 均通过。
- 剩余风险：尚未生成 Prisma migration；并发容量最终一致性和双向确认状态机属于 Task 3。

## Task 3 审查记录

- 状态：统一使用 `TripStatus` 常量；确认状态为 `CONFIRMING`，全员确认后进入 `FORMED` 并开启 15 秒反悔窗口。
- 事务：确认与撤回均在 Prisma transaction 内锁定行程；撤回会将有效确认置为 `VOID`、行程回退 `RECRUITING`，并写入 `withdraw` 与 `rollback` 审计事件。
- 幂等：确认按 `idempotency-key` 返回已有确认；重复撤回返回已作废结果，不重复成团或回退。
- 验证：`npm run prisma:validate`、`npm run build`、`npm test -- --runInBand --no-cache`（5 suites / 15 tests）及 `/health` smoke 均通过。
- 独立审查修复：幂等键先经过当前行程/成员校验并拒绝跨行程或跨用户复用；重复确认返回当前行程状态；旧 VOID 确认返回当前状态；加入状态迁移白名单；回退事务追加 `notify-members` 事件。
- 构建修复：生产 tsconfig 关闭增量缓存，确保新增模块完整输出；`SKIP_DB_CONNECT=true` 仅用于无数据库启动 smoke，不改变生产默认连接行为。
- 验证：独立审查后 `npm test -- --runInBand --no-cache`（5 suites / 16 tests）、`npm run build`、`npm run prisma:generate`、`npm run prisma:validate` 与 `SKIP_DB_CONNECT=true` 的 `/health` smoke 均通过。
- 剩余风险：尚未连接真实 PostgreSQL 验证行级锁；未生成 Prisma migration；`notify-members` 目前是事务内审计/待发送事件，微信订阅消息适配器属于后续通知模块。

## MVP 交付审查记录

- 费用：订单截图 PNG/JPEG/WebP、单张 ≤10MB、整数分金额；24 小时确认窗口超时转人工；争议锁定结算、付款标记和评价。
- 平台降级：第三方叫车返回手动复制路线；手机号验证为开发占位接口；SOS 写入事件并生成待发送通知事件；评价、举报和推荐埋点接口已提供。
- 契约与部署：新增 `apps/miniprogram/api-contract.md`、`apps/miniprogram/README.md`、`DEPLOYMENT.md` 和环境变量模板。
- 验证：Prisma generate/validate、8 suites / 26 tests、生产构建、Docker Compose 配置和 `SKIP_DB_CONNECT=true` 启动 health smoke 均通过。
- 交付限制：尚未接入真实微信登录、Kodo 上传签名、高德/滴滴唤起和真实 PostgreSQL migration；必须在具备平台资质和生产数据库后进行上线联调。

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

