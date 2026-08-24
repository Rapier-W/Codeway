# 同路行网站化架构设计

**状态：已确认，待实施计划**
**日期：2026-08-24**
**替代基线：** 网站客户端替代微信小程序客户端；保留独立 NestJS 后端、PostgreSQL、七牛云 VM 与 Kodo。

## 1. 目标与范围

同路行从微信小程序调整为手机优先、兼容桌面浏览器的 PWA 网站。MVP 继续提供同路行程发布、加入、聊天、全员确认与 15 秒反悔、第三方叫车降级、订单截图/费用争议、SOS、评价和举报。

本次不接入真实微信能力，不做在线支付、司机端、实时车辆定位、自动行车守护或 Redis 集群。真实域名与 ICP 备案暂缓，但它们是公开发布的前置阻断项。

## 2. 已确认的技术决策

| 范围 | 决策 |
|---|---|
| Web 客户端 | Vue 3、Vite、TypeScript、Vant、Pinia、PWA |
| API | NestJS 模块化单体，REST + Socket.IO |
| 身份 | 手机号 + 七牛云短信验证码；Cookie 会话 |
| 会话 | 短期 access token + 长期 refresh token；仅保存 refresh token 哈希；Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Lax` |
| 数据库 | PostgreSQL，单台 VM 内部 Docker 网络访问 |
| 文件 | 七牛云 Kodo 私有桶；浏览器使用短时上传凭证与短时访问 URL |
| 地图 | 高德：前端 JS SDK，后端 Web 服务 API；前后端 Key 分离 |
| 聊天 | 单实例 Socket.IO；消息和业务事实落 PostgreSQL；以后需要横向扩展时增加 Redis Adapter |
| 部署 | 单台七牛云 VM，Docker Compose 运行 Nginx、API、PostgreSQL |
| PWA 缓存 | 只缓存静态资源；不缓存 API、聊天、订单截图、手机号或 SOS 数据 |

## 3. 逻辑架构

```text
浏览器 / 手机 PWA
  ├─ Vue 页面、Vant 交互、Pinia 展示状态
  ├─ 高德 JS SDK（选点、展示）
  └─ Socket.IO + REST（同域）
              │ HTTPS / WSS
              ▼
Nginx
  ├─ /              静态前端
  ├─ /api/*         NestJS REST API
  └─ /socket.io/*   NestJS Socket.IO
              │ Docker 内部网络
              ▼
NestJS 模块化单体
  ├─ Auth / Sms / Session
  ├─ Trips / Confirmations / Chat
  ├─ Fare / Dispute / Review / Report
  ├─ SOS / Notification outbox / Analytics
  └─ Kodo / AMap / Ride Provider adapters
       │             │              │
       ▼             ▼              ▼
 PostgreSQL      Kodo 私有桶   七牛短信 / 高德
```

前端不直接访问 PostgreSQL、七牛云短信、服务端高德 Key 或 Kodo 长期密钥。Pinia 只保存展示状态；权限、金额、行程状态、争议锁定和聊天写入权限一律由后端判定。

## 4. 认证与安全设计

### 4.1 短信登录

1. 浏览器提交手机号，请求验证码。
2. 后端验证手机号格式、频率、失败次数和验证码有效期，再通过七牛云短信适配器发送。
3. 浏览器提交验证码；后端验证成功后创建/更新用户并设置两类 Cookie。
4. access token 过期时，浏览器调用刷新接口；后端比对 refresh token 哈希、撤销状态与过期时间。
5. 退出、改手机号、用户禁用或异常登录时，后端撤销 refresh token。

MVP 限制：同手机号 60 秒内最多一条、每天最多 10 条、连续 5 次验证码失败后暂时冻结。验证码不可明文持久化；保存哈希、过期时间和失败计数即可。

### 4.2 同域与 Cookie

正式域名确定后使用 `https://domain/` 提供前端，`https://domain/api/*` 提供 API。Nginx 同域反向代理避免 CORS；所有修改性请求同时要求 Cookie、CSRF 防护和幂等键。开发环境由 Vite proxy 转发到本地 NestJS。

### 4.3 PWA 与隐私

Service Worker 仅预缓存构建产物；API 响应一律 `no-store`，订单截图和 SOS 响应不进入 Cache Storage。离线时显示可解释的网络失败页与重试入口，不显示旧的敏感业务数据。

## 5. 外部能力与降级

| 能力 | 正常路径 | 降级路径 |
|---|---|---|
| 短信 | 七牛云短信验证码 | 返回可展示错误与重试时间；不开放发布/加入 |
| 高德 | 前端搜索选点、后端地理编码/路线 | 手动输入模糊地点；不阻塞行程流程 |
| 叫车 | 合法 Web/App 链接或带参跳转 | 复制起点、终点、时间，用户手动打开第三方 App |
| Kodo | 短时上传凭证 + 私有对象 | 上传失败可重试；不创建订单记录 |
| SOS 通知 | 通知 outbox → 支持的消息渠道 | 记录 SOS，展示紧急联系人和 110 手动拨号引导 |

Kodo 上传凭证必须绑定用户、行程、用途、对象前缀和短过期时间。后端在创建费用订单时校验对象 key 归属、MIME、大小、哈希和成员权限；订单截图下载使用短时签名 URL 或后端代理。

## 6. 单 VM 部署

```text
七牛云 VM
├─ Docker Compose
│  ├─ nginx       唯一公网入口：80/443
│  ├─ api         仅 Docker 网络暴露 3000
│  └─ postgres    仅 Docker 网络暴露 5432
├─ 持久化 volume  PostgreSQL 数据
└─ 定时备份任务   pg_dump 加密后上传 Kodo
```

- 建议 Ubuntu LTS、至少 2 vCPU / 4 GB RAM / 40 GB SSD。
- SSH 仅允许管理 IP；API 3000 与 PostgreSQL 5432 不开放公网。
- Nginx 负责 TLS、静态前端、`/api` 和 `/socket.io` 反代。
- 域名与 ICP 完成前只允许受控测试，不把公网 IP 作为正式入口。
- 正式环境禁止 `SKIP_DB_CONNECT=true`。

## 7. 数据与备份

- PostgreSQL 是用户、行程、确认、费用、争议、消息、审计和会话撤销状态的唯一事实源。
- 每日逻辑备份上传 Kodo；保留期与恢复演练在部署计划中明确。
- Kodo 为私有桶；正常订单截图结算后保留 90 天，争议订单在争议关闭后再保留 90 天。
- 单 VM 只适合 MVP：VM 故障同时影响 API 与数据库。对外规模扩大前分离 PostgreSQL 或使用托管数据库。

## 8. 聊天扩展边界

MVP 使用一个 NestJS 进程的 Socket.IO 房间，房间键为 `tripId`。发送消息时先做会话与成员权限校验、将消息落 PostgreSQL，再广播。断线重连通过 REST 获取历史消息；客户端发送 idempotency key，后端防止重复消息。

未来多实例时保留 WebSocket 协议和前端连接地址，只增加 Redis、Socket.IO Redis Adapter、负载均衡 WebSocket 配置以及限流/在线状态缓存；Redis 不成为业务事实源。

## 9. 实施边界与验收

实施分为以下独立工作包：

1. Web 客户端骨架、路由、Vant 设计基础、PWA 静态缓存与同域开发代理。
2. 短信验证码、Cookie 会话、刷新/退出、速率限制、CSRF 与 API 身份替换。
3. Kodo 上传签名、私有下载、订单对象归属校验与生命周期任务。
4. 高德 Web/JS 适配器、地点输入与手动降级。
5. Socket.IO 聊天、PostgreSQL 消息与重连历史接口。
6. Docker Compose、Nginx、生产环境变量模板、备份/恢复与健康检查。
7. 真实 PostgreSQL migration、并发集成测试、安全审查和小范围试点。

公开发布前必须满足：真实域名和 HTTPS、ICP（如 VM 位于中国大陆并对公网服务时）、七牛短信签名/模板审核、私有 Kodo 桶、生产 PostgreSQL migration、备份验证、真实短信/高德/Kodo 冒烟测试、隐私政策和用户协议。
