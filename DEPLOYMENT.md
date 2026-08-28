# 同路行网站版 MVP 部署说明

## 组件

- 七牛云 VM：目标生产拓扑通过 Docker Compose 运行 Nginx、Vue PWA 静态文件、NestJS API 和 PostgreSQL。
- PostgreSQL：业务事实源，建议与 API 同地域并限制内网访问。
- 七牛云 Kodo：订单截图私有桶；数据库只保存对象 key、MIME、大小和生命周期元数据。
- Redis：MVP 暂不部署；扩展多实例 Socket.IO、限流或广播前再引入。

## 环境变量

复制 `.env.example` 为 `.env`，设置真实值。禁止提交 `.env`、短信/会话密钥、Kodo 密钥或高德 Key。

必须项：`DATABASE_URL`、`POSTGRES_PASSWORD`、`PORT`、`APP_ORIGIN`、`SESSION_ACCESS_SECRET`、`SESSION_REFRESH_SECRET`。

适配器项：`SMS_ACCESS_KEY`、`SMS_SECRET_KEY`、`SMS_SIGN_NAME`、`SMS_TEMPLATE_ID`、`KODO_BUCKET`、`KODO_ACCESS_KEY`、`KODO_SECRET_KEY`、`VITE_AMAP_BROWSER_KEY`、`AMAP_SERVER_KEY`。未配置时保持手动降级；浏览器 Key 只能配置在高德白名单中的正式/测试域名。

## 发布检查

```powershell
Push-Location apps/api
npm ci
npm run prisma:generate
npm run prisma:validate
npm run build
npm test -- --runInBand --no-cache
Pop-Location
```

## 生产部署（阶段 8/9/10 已落地）

`docker-compose.yml` 仍只作为 PostgreSQL **开发** 数据库基线。生产部署清单与配套文件已新增：

- `docker-compose.prod.yml`：Nginx（边缘）+ NestJS API + PostgreSQL，三者仅处于内部网络 `appnet`，只有 Nginx 暴露 80/443；API 与 PG 不开放公网。API 启动时自动 `prisma migrate deploy`。
- `apps/api/Dockerfile`（多阶段构建）+ `apps/api/docker-entrypoint.sh`（migrate deploy → 启动）。
- `deploy/nginx.Dockerfile`（构建 Vue PWA 静态 + nginx）、`deploy/nginx.conf`（HTTPS 强制 + 反代 `/api` + SPA 回退）、`deploy/nginx.http-only.conf`（备案前临时试点，仅 HTTP）。
- `deploy/.env.prod.example`：生产环境变量模板（仅含 API 实际读取的变量）。
- `scripts/db-backup.sh` / `scripts/db-restore.sh`：PostgreSQL 逻辑备份与恢复（保留 14 天，恢复需二次确认）。
- `deploy/runbook.md`：迁移/回滚、备份恢复、监控告警、限流安全自查、HTTPS/域名/ICP 核查清单、排障。

Cookie 跨站策略已在 `auth.service.buildCookieOptions` 支持 `COOKIE_SAME_SITE` 与 `COOKIE_DOMAIN` 环境变量（同域保持 `lax`+`secure`，跨域才需 `none`+显式 domain）。

正式域名和 ICP 备案当前暂缓；公网发布前必须补齐 HTTPS、域名、隐私政策、短信签名审核、CORS/Allowed Origins 与 Cookie 域/`Secure` 属性验证（详见 `deploy/runbook.md` §8 核查清单）。生产环境必须使用 HTTPS、反向代理、日志脱敏、私有 Kodo 桶和数据库备份/恢复演练。`SKIP_DB_CONNECT=true` 只用于无数据库的启动 smoke，生产不得设置。
