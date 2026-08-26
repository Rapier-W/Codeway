# Kodo 私有桶费用截图闭环设计

## 目标

为 Web/PWA 的费用订单提供真实、可授权且不可伪造的截图上传链路。截图存入七牛云 Kodo 私有桶，业务服务只保存其受控对象键和经服务端核验的元数据；任何 Kodo 密钥、上传令牌或永久访问地址均不得进入仓库或客户端配置。

## 范围与非范围

本任务包含：费用截图上传意图、短时直传凭证、Kodo 对象核验、订单提交绑定、成员受限下载、未使用文件清理、前端上传交互、迁移和真实 PostgreSQL HTTP E2E。

本任务不包含：学生认证/举报附件上传、公开图床、在线 OCR、图片转码、CDN 公共分发、真实生产 Kodo 凭据验收，以及争议结案后的管理端处置。已绑定订单的截图继续遵循架构文档中“结算完成后保留 90 天；有争议则处理完成后再保留 90 天”的保留政策；自动处置接口在具备争议结案流程时单独实现。

## 已选方案

采用“后端授权、客户端直传、后端核验”的 Kodo 私有桶方案。

1. 行程发布者在费用订单页面选择一张截图。
2. Web 先在本地检查 MIME 类型和不超过 10 MB，随后请求后端创建上传意图。
3. 后端校验会话、发布者身份、行程状态与 Kodo 配置，生成一次性对象键及有效期 10 分钟的单对象上传凭证。
4. 浏览器以 `multipart/form-data` 直接上传 Kodo；API 服务不转发文件内容。
5. Web 以 `uploadId` 创建费用订单；后端从 Kodo `stat` 获取真实大小和 `Content-Type`，并同上传意图的键、上传者、行程、限制逐项比对。通过后才在事务内消费上传意图并写入 `FareOrder`。
6. 订单成员请求截图时，后端重新执行成员权限检查，并返回有效期 60 秒的私有下载 URL；URL 不写入数据库，不作为 API 的长期字段。

相较于由 NestJS 接收再转传，本方案不占用 VM 的大文件带宽、内存和连接；相较于只接收客户端提交的 `screenshotKey`，它消除了任意对象键伪造和跨行程引用。

## 安全与数据规则

- 桶必须为私有桶。Kodo Access Key、Secret Key、bucket 名称与上传域名只通过 API 进程环境变量提供；`.env`、真实凭据、上传令牌、Cookie 和真实截图均不得提交。
- 仅允许 `image/jpeg`、`image/png`、`image/webp`；最大为 `10 * 1024 * 1024` 字节。客户端预检用于体验，Kodo 策略和 API `stat` 核验才是可信控制。
- 对象键只由后端生成，格式固定为 `fare-screenshots/{userId}/{tripId}/{uuid}.{ext}`。上传令牌的 scope 必须绑定到单一 bucket/key，并限制 MIME、大小和 10 分钟有效期。
- 上传意图持久化为 `ObjectUpload`：`id`、用途、provider、objectKey（唯一）、tripId、ownerId、allowedMimeType、maxSizeBytes、expiresAt、claimedAt、deletedAt、createdAt`。它是对象键归属的唯一可信来源。
- 只允许处于可提交费用状态的行程发布者创建上传意图；只允许同一行程成员获取该订单截图的短时下载 URL。
- 创建订单不再信任浏览器给出的 `screenshotKey`、`mimeType` 或 `sizeBytes`，而改为提交 `screenshotUploadId` 和金额；服务端从上传意图与 Kodo 核验结果填充订单字段。
- 任一阶段失败返回统一业务错误码，例如 `STORAGE_NOT_CONFIGURED`、`SCREENSHOT_UPLOAD_INVALID`、`SCREENSHOT_UPLOAD_EXPIRED`、`SCREENSHOT_NOT_FOUND`、`SCREENSHOT_METADATA_MISMATCH`、`SCREENSHOT_ACCESS_FORBIDDEN`。不得把 Kodo 凭据、原始响应或签名写回客户端。

## API 与前端契约

### 创建上传意图

`POST /trips/:tripId/fare-screenshot-uploads`

请求：`{ mimeType, sizeBytes }`，带会话认证和 `Idempotency-Key`。成功返回 `{ uploadId, objectKey, uploadUrl, uploadToken, expiresAt }`。同一个幂等键只返回原来的、尚未过期的意图；复用到其他行程、用户或元数据时返回冲突。

### 创建费用订单

保持 `POST /trips/:tripId/fare-order`，请求改为 `{ screenshotUploadId, actualTotalFareCents }`。后端锁定行程与上传意图，验证 Kodo 对象后原子标记 `claimedAt`；已消费意图不得用于另一订单。原有订单的覆盖逻辑仍受当前费用状态机约束，且只能在新截图核验成功后发生。

### 读取截图

新增 `GET /fare-orders/:fareOrderId/screenshot`。服务端仅对行程成员签发短时私有下载 URL，响应为 `{ url, expiresAt }`；非成员得到 `TRIP_MEMBER_REQUIRED`。前端不缓存 URL 到本地存储，也不展示对象键。

订单详情仍可返回截图的类型、大小和“可查看”状态，但不返回可长期复用的 URL。前端订单页将截图选择、上传中、失败重试和已绑定状态置于费用提交流程中；移除“仅记录元数据、不上传原图”的旧文案。

## 生命周期与异常

- 创建意图但未完成上传、上传失败、令牌到期或订单创建失败：对象均视为未消费。API 定时任务每小时扫描过期且未消费的意图，尝试删除对应 Kodo 对象，并标记 `deletedAt`；删除重试必须安全幂等。
- 已消费对象不得被孤儿清理任务删除。正常订单截图的 90 天保留/争议结案后的延期保留，依赖后续的订单归档与争议结案任务落实；在该任务落地前，清理程序绝不误删已绑定订单截图。
- Kodo 不可用、对象缺失、类型/大小不一致或对象已被替换：费用订单不落库，上传意图不消费，用户可重新申请上传。所有对象删除失败仅记录可审计错误，保留后续重试机会。
- 并发提交同一 `uploadId`：数据库行锁/条件更新确保仅一个请求可消费；第二个请求返回幂等结果或 `SCREENSHOT_UPLOAD_ALREADY_CLAIMED`，不会创建额外订单或绑定跨订单对象。

## 适配器边界与配置

新增 `ObjectStorageProvider` 接口，封装：创建受限上传凭证、读取对象元数据、签发私有下载 URL、删除对象。生产实现为 Kodo；单元测试和无 Kodo 凭据的 E2E 使用内存 Fake，Fake 必须模拟过期、大小/类型核验、缺失对象和删除幂等，不能被描述为真实 Kodo 验证。

环境变量模板只增加不含真实值的项：`QINIU_KODO_BUCKET`、`QINIU_KODO_UPLOAD_HOST`、`QINIU_KODO_ACCESS_KEY`、`QINIU_KODO_SECRET_KEY`。生产缺少任一项时上传/下载接口 fail-closed；既有费用订单读取不受影响。实际 bucket 创建、私有访问策略和 VM 环境变量配置由部署阶段执行。

## 验收标准

- API 单元测试覆盖发布者/成员权限、对象键隔离、10MB 与 MIME 限制、过期、重复幂等键、Kodo 元数据不匹配、并发消费和下载 URL 授权。
- 真实 PostgreSQL HTTP E2E 覆盖“发布者申请 → Fake 直传 → 提交订单 → 成员获取短时 URL”、非发布者/非成员拒绝、过期或伪造上传 ID 拒绝，以及重复提交不产生重复订单。
- Web 测试覆盖选图预检、上传进度/失败重试、订单提交和成员查看截图入口；`typecheck` 与 PWA 生产构建通过。
- `prisma migrate deploy` 能在正式库和隔离 E2E 库执行；`prisma validate`、API build、全量相关测试和 `git diff --check` 均通过。
- 未配置真实 Kodo 凭据的验证报告必须明确为 Fake/Mock 验证，不宣称已完成真实七牛云对象存储联调。
