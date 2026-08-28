# 同路行 Web/PWA API 契约说明

## 当前联调基线

- 前端基础地址由 `VITE_API_BASE_URL` 提供，默认 `/api`。
- 已支持幂等的写操作携带 `Idempotency-Key`，认证 Cookie 使用 `credentials: include`；费用订单创建目前尚未在服务端消费该请求键，不能宣称为端到端幂等。
- 当前后端支持 HttpOnly Session Cookie；`x-user-id` 仅在非生产开发环境作为兼容回退，生产环境必须使用 Cookie 会话。
- 客户端不保存会话 token、手机号原文、SOS 精确位置或订单截图；费用截图的对象键、上传 token 和私有查看 URL 只存在于当前请求/点击流程，绝不写入 Pinia 或浏览器存储。

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
| POST | `/trips/:id/fare-screenshot-uploads` | 仅行程发布者在 `RIDE_BOOKED` / `PENDING_SETTLEMENT` 申请一次性截图上传意图；请求含 `mimeType`、`sizeBytes` 与 `Idempotency-Key` |
| POST | `/trips/:id/fare-order` | 创建费用订单；请求仅为 `{ screenshotUploadId, actualTotalFareCents }`，金额为整数分。单个上传意图只能原子消费一次；请求键幂等和既有订单的“变更申请”约束尚待补齐，当前不得将重提交流程当作费用变更入口 |
| GET | `/fare-orders/:id/screenshot` | 仅同程成员主动请求；返回 60 秒私有查看 URL |
| POST | `/fare-orders/:id/confirm` | 确认费用 |
| POST | `/fare-orders/:id/dispute` | 发起费用异议并锁定结算 |
| POST | `/fare-orders/:id/payment-mark` | 记录已付标记，争议时禁止操作 |
| POST | `/emergency-contacts` | 保存紧急联系人 |
| POST | `/fare-orders/:id/review` | 以真实订单 ID 评价同程成员 |
| POST | `/reports` | 举报 |
| POST | `/analytics/events` | 埋点和推荐决策记录 |

### 费用方案修订（阶段 2：成团后费用变更）

后端已提供行程维度的费用方案变更接口，前端在 `FarePlanView`（`/trips/:id/fare-plan`）接入：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/trips/:id/fare-plan` | 获取当前生效费用方案与当前 revision |
| POST | `/trips/:id/fare-plan/change-requests` | 仅发单人发起变更；创建 PENDING 申请与 24h 过期；同行程已有 PENDING 申请则拒绝 |
| POST | `/trips/:id/fare-plan/change-requests/:id/decisions` | 成员表决 APPROVED/REJECTED；全员同意才应用（旧确认作废、旧 revision 标记 SUPERSEDED、新 revision 标记 CONFIRMED、Trip.feePlan 更新），任一拒绝或过期则原方案不变 |
| GET | `/trips/:id/fare-plan/change-requests/current` | 当前变更申请状态与各成员表决情况 |

前端 `ApiClient` 对应方法：`getFarePlan`、`createFareChangeRequest`、`decideFareChangeRequest`、`getCurrentFareChangeRequest`。该流程**不触发成团 15 秒反悔状态机**，且全程可审计、不可删旧确认。

### 私有费用截图上传链路

1. Web/PWA 本地预检 JPEG、PNG、WebP 与不超过 10MB；预检只改善体验，后端和对象存储才是可信边界。
2. 发布者请求上传意图。后端生成 `fare-screenshots/{userId}/{tripId}/{uuid}.{ext}`，授权有效 10 分钟。
3. 浏览器用 `FormData` 将 `token` 与文件直传上传域名，直传请求不带 API Cookie 或 `x-user-id` 头。
4. 创建订单只提交 `screenshotUploadId`。后端以 `ObjectUpload` 归属、有效期、未消费状态和对象存储 `stat` 的真实 key/MIME/大小核验；条件更新只允许一个请求消费意图。
5. 行程成员点击“查看车费截图”后才请求短时 URL。前端不缓存 URL，打开新窗口时使用 `noopener,noreferrer`。

上传意图仅允许 JPEG/PNG/WebP，最大 `10 * 1024 * 1024` 字节。失败重试必须重新申请上传意图；过期、未消费且用途为 `FARE_SCREENSHOT` 的对象由后端每小时清理。已绑定订单的对象绝不参与孤儿清理；其 **90 天保留 / 争议处理后再保留 90 天** 政策已实现：确认订单时写入 `retentionDeleteAfter = confirmedAt + 90 天`，争议时清空为 `null` 并标记 `screenshotDeletedAt`，结案后从 `resolvedAt` 重计。

`GET /fare-orders/:id`（订单详情）现已返回 `retentionDeleteAfter` 与 `screenshotDeletedAt` 两个字段（均为 ISO 字符串或 `null`），前端 `Order` 据此展示“车费截图留存”状态。`GET /fare-orders/:id/screenshot` 在 `screenshotDeletedAt` 存在时返回 `SCREENSHOT_RETENTION_EXPIRED`，前端据此提示“截图已过期或已删除，无法查看”。

相关迁移：`20260826090000_kodo_fare_uploads`、`20260826100000_object_upload_declared_size`。

## 认证接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/request-code` | 手机号验证码请求；服务端限流，生产环境缺少供应商配置时拒绝发送 |
| POST | `/auth/verify-code` | 校验验证码并设置 HttpOnly Session Cookie |
| GET | `/auth/me` | 根据 Session Cookie 获取当前用户 |
| POST | `/auth/logout` | 删除 Session 并清理 Cookie |

Web 请求统一使用 `credentials: include`。真实 HTTP 默认走短信验证码，只有 `VITE_ENABLE_DEV_LOGIN=true` 才启用开发登录降级。

本地开发短信 Fake 当前会向进程控制台输出手机号和验证码，绝不能用于共享环境或生产；上线前必须将其改为脱敏、受控的开发测试机制。七牛云供应商失败日志也不得记录手机号或原始响应。

## 尚未完成的真实供应商核验

- 七牛云短信：服务端适配已完成，但签名、接口路径和模板参数仍需真实供应商文档/测试凭据核验。
- 微信登录/手机号授权：当前使用开发会话占位。
- Kodo：私有桶 Provider、受限上传意图、对象元数据核验和短时读取契约已完成；当前仅用内存 Fake 验证，未配置真实私有桶、域名或 AK/SK，不能视为真实 Kodo 联调完成。
- 高德和第三方叫车 Deep Link：当前走手动降级。
- WebSocket：聊天仍是 REST 边界，未做实时推送。

## 移动端字体兼容

- 保留本地 `base.css` 的视觉 token 和字体栈；当前字体为 `Inter`、系统字体及 `Microsoft YaHei`、`PingFang SC`、`Noto Sans CJK SC` 中文回退。
- 不引入远端字体文件、`@font-face` 或外部字体 CDN，避免移动端字体加载失败。
- 生产构建已检查源码和产物，无外部字体 URL 或字体文件引用。

## 错误格式

```json
{ "code": "TRIP_CAPACITY_EXCEEDED", "message": "TRIP_CAPACITY_EXCEEDED", "statusCode": 409 }
```

前端 Adapter 应把 HTTP 状态和服务端错误码转换为统一的 `ApiError`，页面必须提供重试或下一步操作，禁止空白页。

## Web 真实联调补充

| 方法 | 路径 | Web 用途 |
|---|---|---|
| GET | `/trips/mine?role=joined|published` | 我的出行两个角色标签 |
| GET | `/trips/:id/messages?before=&limit=` | 聊天历史游标分页 |

订单详情现在返回 `members` 摘要，评价页从同程成员中选择目标并排除当前用户。车辆、叫车和联系人页面已移除硬编码业务数据；叫车平台不可用时继续使用复制路线与手动拨号降级。费用创建已使用受限上传意图与直传 Adapter，但真实 Kodo 私有桶仍未配置。
