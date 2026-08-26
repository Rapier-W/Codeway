# 真实短信与 Cookie 会话认证集成设计

## 目标

以本地 `master` 的 Web HTTP 联调和业务幂等实现为基线，吸收远端已实现的七牛云短信验证码、Session Cookie 和认证 Guard，同时保持移动端字体和本地视觉系统不变。

## 范围

- 后端：`AuthModule`、短信验证码发送/校验、Session 持久化、HttpOnly Cookie、认证 Guard、限流依赖和认证 migration。
- 前端：真实短信验证码登录、Cookie 会话请求、开发登录显式开关。
- 数据库：新增 `sms_codes`、`sessions`；保留本地 `RideRecord`、`VehicleUpdate`、`EmergencyContact` 幂等字段及 migration。
- 验证：认证单测、HTTP E2E、API/Web 全量测试、Prisma migration、字体引用检查。

## 保留规则

- 不合并远端整体 `origin/master`。
- 保留本地 Web 页面、API Adapter、页面测试、平台写入幂等、车辆状态机和协同文件。
- 移动端保留本地字体族、`@font-face`（如有）、CSS token 和回退栈；禁止引入远端未验证的字体文件或全局字体覆盖。
- 生产环境仅允许 Cookie Session 认证；`x-user-id` 仅可在非生产开发环境使用。
- 密钥仅通过环境变量注入，`.env` 不入库。

## 认证流程

1. `POST /api/auth/request-code`：校验手机号、限流、保存验证码并调用七牛云短信；无供应商密钥时仅开发环境输出日志。
2. `POST /api/auth/verify-code`：校验验证码，创建/更新用户，生成 Session，设置 HttpOnly Cookie。
3. 受保护请求携带 `credentials: include`；Guard 优先校验 Cookie，开发环境才回退 `x-user-id`。
4. `POST /api/auth/logout`：删除 Session 并清理 Cookie。

## 兼容与错误处理

- 保持前端现有 `/auth/request-code`、`/auth/verify-code` 契约。
- 统一错误过滤器输出业务错误码；验证码错误、过期、重试超限、冷却和 Session 过期均可被前端翻译。
- 重复请求使用现有幂等头；验证码发送/验证的幂等行为以服务端验证码状态和 Session 规则为准。

## 验收标准

- Prisma schema、migration 无漂移，正式库和隔离 E2E 库均可部署。
- API 默认测试、认证测试、真实 PostgreSQL HTTP E2E 全部通过。
- Web 测试、类型检查和生产构建通过。
- 构建产物仅引用本地批准字体或系统回退字体，移动端无远端字体加载错误。
