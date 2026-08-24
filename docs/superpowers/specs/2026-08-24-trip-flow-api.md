# 同路行行程核心 API 契约

> 当前为 Web/PWA 与 NestJS 后端联调契约。真实手机号登录、短信供应商和生产域名接入前，接口路径保持稳定，认证实现可替换。

## 约定

- 基础路径：`/api`；所有写请求必须携带 `Idempotency-Key`。
- 认证：当前开发阶段可使用服务端开发会话；正式环境必须是手机号验证后的 HttpOnly 会话 Cookie。
- 时间：ISO 8601，服务端按 UTC 存储，展示层按用户时区格式化。
- 金额：整数分；客户端不能决定权限、容量、费用或状态。
- 行程状态：`RECRUITING`、`CONFIRMING`、`FORMED`、`CANCELLED`、`EXPIRED`。
- 推荐理由白名单：`TIME_CLOSE`、`RELIABLE`、`VERIFIED`、`OPEN_SLOT`；最多返回 3 条，并保留服务端决策顺序。

## 认证占位接口

### `POST /auth/request-code`

请求：`{ "phone": "13800000000" }`。返回 `204`。正式环境接入七牛云短信前，仅允许开发环境测试号码。

### `POST /auth/verify-code`

请求：`{ "phone": "13800000000", "code": "123456" }`。返回 `{ id, nickname, phoneVerified }`，并设置 HttpOnly 会话 Cookie。

未验证用户可以浏览，发布和加入返回 `PHONE_VERIFICATION_REQUIRED`（403）。

## 行程接口

### `POST /trips`

请求：`{ origin, destination, departTime, capacity, feePlan?, femaleOnly? }`。`capacity` 只能为 `3` 或 `4`，创建者占用 1 个席位并自动写入 CREATOR 成员记录。

### `GET /trips`

可选查询：`date`、`origin`、`time`、`femaleOnly`。只返回未来行程，按 `departTime ASC`，每个结果包含最多 3 条 `reasonCodes`。

### `GET /trips/:id`

返回行程详情、规范化 `status`、容量统计、成员摘要、推荐理由顺序和当前用户可操作确认信息。

### `POST /trips/:id/join`

请求：`{ "memberCount": 1 | 2 }`。服务端事务锁定行程并按成员占用总和校验容量；重复幂等键返回同一申请，超容量返回 `TRIP_CAPACITY_EXCEEDED`（409）。

## 确认接口（下一任务实现）

- `POST /trips/:id/confirmations`：当前成员确认；全部成员确认后进入 `FORMED`，最后确认开启 15 秒窗口。
- `POST /trips/:id/confirmations/:confirmationId/withdraw`：仅在 `retractUntil` 前有效；回退时所有确认作废并写审计事件。

## 错误格式

```json
{ "code": "TRIP_CAPACITY_EXCEEDED", "message": "剩余席位不足，请刷新行程状态", "status": 409 }
```

至少支持：`PHONE_VERIFICATION_REQUIRED`、`TRIP_NOT_FOUND`、`TRIP_CAPACITY_EXCEEDED`、`TRIP_NOT_READY`、`STATE_CONFLICT`、`IDEMPOTENCY_CONFLICT`。
