# 同路行网站版 MVP 部署说明

## 组件

- 七牛云 VM：目标生产拓扑通过 Docker Compose 运行 Nginx、Vue PWA 静态文件、NestJS API 和 PostgreSQL。
- PostgreSQL：业务事实源，建议与 API 同地域并限制内网访问。
- 七牛云 Kodo：订单截图私有桶；数据库只保存对象 key、MIME、大小和生命周期元数据。
- Redis：MVP 暂不部署；扩展多实例 Socket.IO、限流或广播前再引入。

## 环境变量

复制 `.env.example` 为 `.env`，设置真实值。禁止提交 `.env`、短信/会话密钥、Kodo 密钥或高德 Key。

必须项：`DATABASE_URL`、`POSTGRES_PASSWORD`、`PORT`、`APP_ORIGIN`、`SESSION_ACCESS_SECRET`、`SESSION_REFRESH_SECRET`。

适配器项以各应用的 `.env.example` 为准：API 使用 `QINIU_ACCESS_KEY`、`QINIU_SECRET_KEY`、`QINIU_SMS_TEMPLATE_ID`、`QINIU_KODO_BUCKET`、`QINIU_KODO_UPLOAD_HOST`、`QINIU_KODO_DOWNLOAD_HOST`、`QINIU_KODO_ACCESS_KEY`、`QINIU_KODO_SECRET_KEY`；Web 使用 `VITE_AMAP_BROWSER_KEY`（见 `apps/web/.env.example`）。未配置时保持手动降级；浏览器 Key 只能配置在高德白名单中的正式/测试域名。

## 当前发布边界

仓库当前提供的是本地开发数据库 Compose 基线，不包含可直接上线的 Nginx、Web/API 镜像、TLS 证书目录或生产 Compose 文件。域名解析、ICP备案、证书、七牛云短信/Kodo 凭据、VM 防火墙和备份恢复演练完成前，只能进行受控试点。

## 发布检查（代码侧）

```powershell
Push-Location apps/api
npm ci
npm run prisma:generate
npm run prisma:validate
npm run build
npm test -- --runInBand --no-cache
Pop-Location

Push-Location apps/web
npm ci
npm run typecheck
npm test
npm run build
Pop-Location
```

当前 `docker-compose.yml` 仅是 PostgreSQL 开发数据库基线，不能作为生产部署清单。实现 `apps/web` 和 API 容器化后，生产 Compose 必须包含 `nginx`、`web`、`api`、`postgres` 四项服务：Nginx 仅暴露 80/443 并反向代理 `/api`、`/socket.io`；API 与 PostgreSQL 仅加入 Docker 内部网络，3000/5432 不开放公网。

正式域名和 ICP 备案当前暂缓；公网发布前必须补齐 HTTPS、域名、隐私政策、短信签名审核、CORS/Allowed Origins 与 Cookie 域/`Secure` 属性验证。生产环境必须使用 HTTPS、反向代理、日志脱敏、私有 Kodo 桶和数据库备份/恢复演练。`SKIP_DB_CONNECT=true` 只用于无数据库的启动 smoke，生产不得设置。
