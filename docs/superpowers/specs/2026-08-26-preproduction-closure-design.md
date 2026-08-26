# 上线前费用闭环与可重复验收设计

**日期：** 2026-08-26
**状态：** 已确认业务规则，待用户审阅本文档后进入实施计划
**范围：** 费用订单请求幂等、成团后分摊变更、短信日志脱敏、费用截图留存、PostgreSQL E2E 隔离和真实锁竞争验证。

## 1. 目标与边界

本轮在不扩大 MVP 为支付或资金托管产品的前提下，收敛上线前最影响资金凭证一致性、隐私和验收可信度的缺口。

- 实际费用订单必须消费 HTTP `Idempotency-Key`，同一请求可安全重试，不能覆盖既有订单。
- 成团后锁定的是**分摊方案**，与行程结束后提交的**实际费用订单**是两套独立状态；修改已锁定方案必须走全员同意的变更申请。
- 任何日志均不得泄露完整手机号、验证码、凭证 URL/token、Authorization、短信供应商原文响应或费用截图内容。
- 已绑定费用截图在适用的保留期届满后可重复、可审计地清理；未结案争议不得被自动清理。
- PostgreSQL HTTP E2E 可反复运行而不残留业务 fixture，并用真实数据库锁竞争证明 `RIDE_STATE_BUSY` 的行为。

不在本轮范围内：在线支付、钱包、资金托管、普通用户争议结案入口、自动叫车下单、WebSocket、短信供应商真实凭据接入和 Kodo 生产桶配置。

## 2. 术语与不变量

| 概念 | 含义 | 不变量 |
| --- | --- | --- |
| 分摊方案（fare plan） | `EQUAL`、`FIXED` 或 `CUSTOM` 的费用承担规则，成团后由所有成员锁定。 | 每个行程任一时刻至多一份生效的已锁定方案。 |
| 分摊修订（revision） | 不可变的分摊方案版本及该版本的全员确认记录。 | 旧版本只能 `SUPERSEDED`，确认只能 `VOID`，不得物理删除。 |
| 变更申请（change request） | 发布者针对当前锁定方案提出的一次替代方案。 | 一次只允许一份有效申请；成员快照一经申请不可变。 |
| 实际费用订单（fare order） | 行程结束后，发布者提交的实际车费金额和 Kodo 截图凭证。 | 每行程只可成功创建一张订单，不能用新截图静默覆盖。 |
| 订单确认 | 成员对实际金额与截图的 24 小时确认。 | 只影响订单结算，不复用为分摊方案确认。 |

所有会改变上述状态的操作均在 PostgreSQL 事务内先锁定 `Trip` 行；并发冲突不能造成部分写入或删除已有确认。

## 3. 成团后费用分摊方案

### 3.1 数据模型

新增以下持久化模型，`Trip.feePlan` 作为对当前生效方案的兼容性快照，只能由修订应用事务更新，不能由控制器直接写入。

| 模型 | 关键字段 | 约束 |
| --- | --- | --- |
| `FarePlanRevision` | `id`、`tripId`、`sequence`、`plan Json`、`status`、`createdAt`、`lockedAt`、`supersededAt` | `@@unique([tripId, sequence])`；状态为 `PENDING_CONFIRMATION`、`LOCKED`、`SUPERSEDED`。 |
| `FarePlanConfirmation` | `revisionId`、`userId`、`status`、`idempotencyKey`、`confirmedAt`、`voidedAt` | `@@unique([revisionId, userId])`；确认状态为 `CONFIRMED` 或 `VOID`。 |
| `FarePlanChangeRequest` | `id`、`tripId`、`baseRevisionId`、`proposedPlan Json`、`reason`、`requestedBy`、`status`、`requestKey`、`expiresAt`、`appliedAt` | `requestKey` 全局唯一；状态为 `PENDING`、`REJECTED`、`EXPIRED`、`APPLIED`。PostgreSQL partial unique index 限制每个 `tripId` 至多一个 `PENDING` 申请。 |
| `FarePlanChangeDecision` | `requestId`、`userId`、`decision`、`decidedAt` | `@@unique([requestId, userId])`；决策为 `PENDING`、`APPROVED`、`REJECTED`。 |

创建申请时，以当前 `TripMember` 记录生成全体成员决策快照。每个账号一票；`memberCount = 2` 是两个座位，不产生两张同意票。发起人创建申请即落一条明确的 `APPROVED` 决策。

### 3.2 方案校验与初始锁定

服务端解析、规范化并保存 `plan`，拒绝前端任意 JSON：

- `EQUAL`：仅允许模式和值为空，按成员账号均分；展示层可再按座位解释，不改变确认投票单位。
- `FIXED`：每个当前成员账号提供正整数分金额；总和与 `totalAmountCents` 相等。
- `CUSTOM`：每个当前成员账号提供整数百分比；合计严格为 100，不能有重复、缺失成员或负值。

成团时创建第 1 个 `FarePlanRevision(PENDING_CONFIRMATION)`；全体当前成员确认后置为 `LOCKED`、写入 `lockedAt` 和 `Trip.feePlan`。确认接口的重复请求以修订与用户为幂等边界；同一幂等键换修订或用户返回 `409 IDEMPOTENCY_KEY_REUSED`。

### 3.3 费用变更申请状态机

仅发布者可创建申请，且必须存在当前 `LOCKED` 修订。允许的行程状态为 `FORMED`、`WAITING_RIDE`、`RIDE_BOOKED`；行程已进入 `PENDING_SETTLEMENT`、已有实际费用订单、订单为 `CONFIRMED`/`DISPUTED`/`MANUAL_REVIEW`、或 `disputeLocked = true` 时统一拒绝 `409 FARE_PLAN_CHANGE_NOT_ALLOWED`。

```text
LOCKED revision
    │ 发布者创建（24 小时；其本人自动 APPROVED）
    ▼
PENDING request ──任一成员拒绝──> REJECTED（旧 revision 保持 LOCKED）
    │
    ├──超过 expiresAt──> EXPIRED（旧 revision 保持 LOCKED）
    │
    └──全员 APPROVED──> APPLIED
                           │ 同一事务：旧确认→VOID，旧 revision→SUPERSEDED
                           ▼
                         新 revision PENDING_CONFIRMATION
                           │ 全员再次确认
                           ▼
                         新 revision LOCKED
```

每次创建、表决、过期检查和应用均锁定行程；表决同时锁定申请行。申请过期通过每次读取/表决时的惰性检查以及调度清理器处理。拒绝、过期和失败的申请绝不改变原分摊方案或其确认。

全员同意时，在一个事务中二次核对成员集合仍与快照相同、原修订仍为 `LOCKED`：作废旧确认、标记旧修订 `SUPERSEDED`、创建新 `PENDING_CONFIRMATION` 修订、将申请标记 `APPLIED`、清空 `Trip.feePlan` 的“已锁定”标记并写审计日志。新修订必须重新由全体成员确认后才再次锁定；不触发 15 秒成团反悔状态机。

### 3.4 HTTP 接口与受控错误

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| `GET` | `/trips/:tripId/fare-plan` | 成员读取当前修订、确认进度和活动申请摘要；非成员 403。 |
| `POST` | `/trips/:tripId/fare-plan-revisions/:revisionId/confirm` | 成员确认待锁定修订；要求 `Idempotency-Key`。 |
| `POST` | `/trips/:tripId/fare-plan-change-requests` | 发布者提交变更申请；要求 `Idempotency-Key`。 |
| `POST` | `/fare-plan-change-requests/:id/decisions` | 快照中的成员同意或拒绝；要求 `Idempotency-Key`。 |

缺失请求键为 `400 IDEMPOTENCY_KEY_REQUIRED`；同键不同资源、操作者或规范化请求体为 `409 IDEMPOTENCY_KEY_REUSED`；非发布者创建为 `403 ONLY_CREATOR_CAN_CHANGE_FARE_PLAN`；非快照成员表决为 `403 FARE_PLAN_DECISION_MEMBER_REQUIRED`；重复且相同的确认/表决只回读首次结果。

## 4. 实际费用订单幂等与截图消费

`POST /trips/:id/fare-order` 必须注入 `@IdempotencyKey()`，并将 `FareOrder.requestKey` 与 `FareOrder.sourceUploadId` 设为全局唯一。`sourceUploadId` 是已被消费的 `ObjectUpload.id`，使每个上传意图只能绑定一次订单。

在“锁行程 → 校验发布者、行程状态和争议锁”的单个事务中按以下顺序执行：

1. 先按 `requestKey` 回读订单；`tripId`、`submittedBy`、`sourceUploadId`、金额完全相同则返回原订单，任一不同为 `409 IDEMPOTENCY_KEY_REUSED`。
2. 若该行程已有其他订单，返回 `409 FARE_ORDER_ALREADY_SUBMITTED`，不消费上传意图，也不删除订单确认或支付标记。
3. 核验上传意图所属、未认领、未删除、未过期；在对象存储 `stat` 核验对象键、MIME 和大小。
4. 以条件更新原子认领上传意图，创建订单并写审计。并发唯一键冲突 `P2002` 必须回读同请求键；不匹配仍报 `IDEMPOTENCY_KEY_REUSED`。

订单不再返回 `overwritten`。若业务确实需要变更分摊，走第 3 节；若实际订单或截图有争议，走现有争议与人工处理流程，不允许重新上传覆盖凭证。

## 5. 截图 90 天保留与争议结案

`FareOrder` 新增 `retentionDeleteAfter DateTime?` 和 `screenshotDeletedAt DateTime?`。现有 10 分钟“未认领上传意图”清理保留不变；本节处理的是已经绑定订单的截图。

- 正常订单：订单全员确认、`confirmedAt` 落库时，设置 `retentionDeleteAfter = confirmedAt + 90 天`。
- 开放争议：发起争议时将 `retentionDeleteAfter` 置空；在 `FareDispute` 中增加 `resolvedAt`。不能自动把 `DISPUTED` 当作结案。
- 受控结案：只提供服务层/运维任务使用的 `resolveFareDisputeForRetention`，由既有可信管理身份接入后调用；其检查订单确为争议状态、写入结案审计，然后将保留期设为 `resolvedAt + 90 天`。本轮不公开普通用户 HTTP 结案端点。
- 清理任务：按到期订单逐个锁定订单和行程，复查未有开放争议、未删除且到期；先删除 Kodo 对象，再更新 `screenshotDeletedAt` 和审计。Kodo 报对象不存在（如 612）视作幂等删除成功；其他存储错误保留记录供下次重试。
- 已清理后：详情 `screenshotAvailable = false`；下载接口返回 `410 SCREENSHOT_RETENTION_EXPIRED`，不得签发 URL。订单的金额、状态和审计记录仍保留。

不在 Kodo 上设置“对象创建后固定 90 天删除”的桶生命周期规则，因为争议结案会重新起算，固定生命周期可能提前删除证据。

## 6. 短信日志与开发登录安全

`SmsService` 定义唯一的脱敏日志格式。允许记录：掩码手机号（如 `138****0000`）、不可逆关联 ID、供应商 HTTP 状态和受控错误分类。禁止记录：验证码、完整手机号、`Authorization`、请求/响应正文、短信模板参数、供应商原始错误和 session token。

- 开发模式不再通过控制台输出验证码。开发登录使用显式 `SMS_PROVIDER=dev` 与仅在本地环境存在的固定测试验证码/测试 fixture；生产环境须显式 `SMS_PROVIDER=qiniu` 且完整配置通过启动校验，否则 fail closed。
- 单测拦截 `console.log`/`console.error`，对成功与供应商失败分支断言输出不含完整手机号、验证码或正文。
- 验证码明文存储是独立生产前安全待办；本轮记录为遗留风险，后续迁移到哈希比对后才可声称认证数据静态加密完成。

## 7. 可重复 PostgreSQL HTTP E2E

两个 PostgreSQL E2E 文件均使用 run-scoped fixture helper。每个测试独立创建自己的用户、行程、请求键、上传意图和订单，禁止引用前一测试设置的 `tripId` 或 `fareOrderId`。测试 ID/手机号包含本次 run token，既避免并发碰撞，也使清理可精确限定范围。

每个用例的 `afterEach` 按外键逆序清理该 fixture：

```text
Review / PaymentMark / FareOrderConfirmation / FarePlanConfirmation /
FarePlanChangeDecision / FarePlanChangeRequest / FarePlanRevision /
FareDispute / FareOrder / ObjectUpload / RideRecord / VehicleUpdate /
ChatMessage / SosEvent / NotificationEvent / AuditLog / TripConfirmation /
TripMember / Session / SmsCode / Trip / User
```

清理失败必须让该测试失败，不能吞掉；迁移表和非本 run 数据不可删除。验收要求同一 E2E 命令连续执行两次均通过，且完成后仅保留 migration 元数据及测试以外数据。

## 8. 真实锁竞争、超时与 503

保留当前对 `P2028/P2024` 的快速 mock 回归，但它不作为真实并发证据。新增真实 PostgreSQL 用例：第二个独立 Prisma 连接执行 `SELECT id FROM trips WHERE id = ? FOR UPDATE` 并保持该事务；HTTP 请求并发调用 `openRide` 或 `updateVehicle`。

应用事务支持正式配置项 `POSTGRES_LOCK_TIMEOUT_MS`：生产设置为一个有限值，测试使用短值（例如 250ms）；在状态写事务内执行 `SET LOCAL lock_timeout`。只将明确的 `P2028`、`P2024` 与 PostgreSQL 锁/事务超时（包括 SQLSTATE `55P03` 的 Prisma 包装）映射为 `503 RIDE_STATE_BUSY`；其他数据库错误原样上抛。

锁释放后，使用新请求键重试必须返回成功，并断言失败请求没有留下 `RideRecord`/`VehicleUpdate` 等部分写入。这是并发控制的完整验证，不为测试添加仅测试可调用的生产后门。

## 9. 测试与完成标准

实现按 TDD：每个服务行为先写失败单测或 HTTP E2E，再以最小事务实现通过，最后重构。最低验收为：

1. 同键并发订单请求均返回 201 与同一订单，仅消费一个上传意图；同键改金额/上传 ID 为 409；不同键重提不覆盖。
2. 三人和四人行程覆盖：全员同意后旧修订与确认可追溯地作废、新修订等待重确认；任一拒绝、24 小时过期、非成员表决、同键重复表决均不改旧锁定方案。
3. 日志测试证明不泄露手机号、验证码、供应商正文或凭据。
4. 时间可注入的保留测试：89 天不删、90 天删；开放争议不删；结案后重新计 90 天；重复清理幂等。
5. PostgreSQL E2E 各测试独立、整个命令连续运行两次无污染；迁移状态、Nest build、API 单测、Web 测试/typecheck/PWA build 与 `git diff --check` 全部通过。
6. 真实锁竞争返回 `503/RIDE_STATE_BUSY`，释放锁后重试成功，且无部分写入。

## 10. 实施拆分

实施计划将拆为可独立验收的 bounded task：

1. Prisma migration 与订单幂等/截图保留服务基础。
2. 分摊修订、变更申请和确认 API。
3. 短信脱敏及开发/生产提供者显式配置。
4. E2E fixture 隔离、真实锁超时和完整回归。

每个高风险任务由实现者之外的代理独立复核；所有正式变更提交前必须运行新鲜验证，并将证据追加到本地 `TEAM-TASKS.md`。
