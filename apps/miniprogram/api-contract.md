# Codeway API 契约（MVP）

基础地址：`API_BASE_URL`

## 身份

- `POST /auth/phone`：`{ phone }`，绑定手机号并返回 `phoneVerified=true`。
- `GET /auth/me`：返回当前用户认证和信用摘要。

## 行程与确认

- `POST /trips`：发布容量 3/4 的行程。
- `GET /trips?date=&origin=&time=&femaleOnly=`：未来行程，按出发时间升序，卡片包含最多 3 个 `reasonCodes`。
- `POST /trips/:id/join`：`{ memberCount: 1|2 }`，携带 `Idempotency-Key`。
- `POST /trips/:id/confirmations`：携带 `Idempotency-Key`；返回 `CONFIRMING` 或 `FORMED` 和 `retractUntil`。
- `POST /trips/:id/confirmations/:confirmationId/withdraw`：15 秒窗口内撤回，回退为 `RECRUITING`。

## 叫车、费用与安全

- `POST /trips/:id/ride/open`：返回第三方跳转是否支持；不支持时复制路线手动打开。
- `POST /trips/:id/vehicle`：录入车牌、车型、颜色和平台。
- `POST /trips/:id/fare-order`：提交截图 key、MIME、大小和整数分金额；只允许 PNG/JPEG/WebP，≤10MB。
- `POST /fare-orders/:id/confirm`：24 小时内确认；超时转人工，不视为同意。
- `POST /fare-orders/:id/dispute`：争议会锁定结算、付款标记和评价。
- `POST /fare-orders/:id/payment-mark`：仅无争议且订单已确认时可标记。
- `POST /trips/:id/sos`：记录 SOS 并写入待发送通知事件；位置权限失败仍可提交。
- `POST /trips/:id/reviews`、`POST /reports`、`POST /analytics/events`：评价、举报和埋点。

## 错误与空状态

错误响应使用 HTTP 状态码和字符串错误码，例如 `PHONE_NOT_VERIFIED`、`TRIP_CAPACITY_EXCEEDED`、`FARE_SETTLEMENT_LOCKED`、`WITHDRAW_WINDOW_EXPIRED`。前端必须为网络失败、无结果、过期、权限拒绝提供重试/清除筛选/联系管理员操作，禁止空白页。
