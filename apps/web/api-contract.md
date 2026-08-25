# 同路行 Web/PWA API 契约说明

## 当前联调基线

- 前端基础地址由 `VITE_API_BASE_URL` 提供，默认 `/api`。
- 所有写操作携带 `Idempotency-Key`，认证 Cookie 使用 `credentials: include`。
- 当前后端开发会话使用 `x-user-id` 头；这只是开发占位，生产必须替换为 HttpOnly 会话。
- 客户端不保存 token、手机号原文、SOS 精确位置或订单截图。

## 已实现行程接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/trips` | 手机号已验证用户发布，`capacity` 只能为 3/4 |
| GET | `/trips` | 仅未来行程，按出发时间升序，返回最多 3 条推荐理由 |
| GET | `/trips/:id` | 详情和成员容量统计 |
| POST | `/trips/:id/join` | `memberCount` 只能为 1/2，服务端事务防超容量 |
| POST | `/trips/:id/confirmations` | 当前成员确认，幂等 |
| POST | `/trips/:id/confirmations/:confirmationId/withdraw` | 15 秒窗口内撤回并回退 |

后端状态主链路为：
`RECRUITING → CONFIRMING → FORMED → WAITING_RIDE → RIDE_BOOKED → PENDING_SETTLEMENT → SETTLED → PENDING_REVIEW → ARCHIVED`。

## 推荐理由

服务端返回 `reasonCodes`，白名单为：

- `TIME_CLOSE`
- `RELIABLE`
- `VERIFIED`
- `OPEN_SLOT`

前端 Adapter 将 `reasonCodes` 映射为展示字段 `recommendationReasons`，其中 `OPEN_SLOT` 展示为“空位充足”。低信用发布者不返回正向推荐理由。

## 已实现的安全与费用接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/trips/:id/ride/open` | 第三方叫车适配器；当前返回手动降级提示 |
| POST | `/trips/:id/vehicle` | 保存车辆信息 |
| POST | `/trips/:id/sos` | 记录 SOS 事件和通知事件，不自动报警 |
| POST | `/trips/:id/fare-order` | 创建费用订单，金额为整数分 |
| POST | `/fare-orders/:id/confirm` | 确认费用 |
| POST | `/fare-orders/:id/dispute` | 发起费用异议并锁定结算 |
| POST | `/fare-orders/:id/payment-mark` | 记录已付标记，争议时禁止操作 |
| POST | `/emergency-contacts` | 保存紧急联系人 |
| POST | `/fare-orders/:id/review` | 以真实订单 ID 评价同程成员 |
| POST | `/reports` | 举报 |
| POST | `/analytics/events` | 埋点和推荐决策记录 |

## 尚未接入真实供应商

- 七牛云短信：当前没有真实验证码发送。
- 微信登录/手机号授权：当前使用开发会话占位。
- Kodo：费用接口只接受对象键元数据，上传签名尚未接入。
- 高德和第三方叫车 Deep Link：当前走手动降级。
- WebSocket：聊天仍是 REST 边界，未做实时推送。

## 错误格式

```json
{ "statusCode": 409, "message": "TRIP_CAPACITY_EXCEEDED", "error": "Conflict" }
```

前端 Adapter 应把 HTTP 状态和服务端错误码转换为统一的 `ApiError`，页面必须提供重试或下一步操作，禁止空白页。

## Web 真实联调补充

| 方法 | 路径 | Web 用途 |
|---|---|---|
| GET | `/trips/mine?role=joined|published` | 我的出行两个角色标签 |
| GET | `/trips/:id/messages?before=&limit=` | 聊天历史游标分页 |

订单详情现在返回 `members` 摘要，评价页从同程成员中选择目标并排除当前用户。车辆、叫车和联系人页面已移除硬编码业务数据；叫车平台不可用时继续使用复制路线与手动拨号降级。费用创建仍等待 Kodo 上传签名，不在前端伪造截图上传成功。
