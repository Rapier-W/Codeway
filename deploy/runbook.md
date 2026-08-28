# 同路行（Codeway）生产运维手册 / Runbook

面向阶段 8（容器化部署）、阶段 9（域名/HTTPS/备案）、阶段 10（运维与试点）的运维动作。
配套文件：`docker-compose.prod.yml`、`deploy/nginx.conf`、`deploy/nginx.http-only.conf`、
`deploy/.env.prod.example`、`scripts/db-backup.sh`、`scripts/db-restore.sh`。

---

## 0. 拓扑与安全边界

```
公网 80/443 ──► [nginx 边缘] ──/api──► [api: NestJS] ──► [postgres]
                 (静态 PWA)      (同源)     (内部网络 appnet，不开放公网)
```

- **只有 nginx 暴露 80/443**；`api`(3000) 与 `postgres`(5432) 仅处于 `appnet` 内部网络。
- PostgreSQL **不映射公网端口**；备份通过 `docker compose exec` 在宿主机完成，无需开放端口。
- 订单截图存于七牛云 Kodo **私有桶**；数据库只保存对象 key / MIME / 大小 / 生命周期元数据。
- 生产环境 **必须** 启用 HTTPS、反向代理、私有 Kodo 桶、数据库备份/恢复演练。`SKIP_DB_CONNECT=true` 仅用于无数据库 smoke，**生产禁止开启**。

---

## 1. 首次部署

### 1.1 准备
```bash
# 1) 准备生产环境变量（切勿提交 .env.prod）
cp deploy/.env.prod.example deploy/.env.prod
# 编辑 deploy/.env.prod：POSTGRES_PASSWORD、QINIU_*、WECHAT_*、AMAP_SERVER_KEY、CORS_ORIGINS 等
# 注意：POSTGRES_PASSWORD / 各类密钥 必须强随机；CORS_ORIGINS 填公网 https origin。

# 2) 构建并启动（会自动 prisma migrate deploy + 启动）
docker compose -f docker-compose.prod.yml up -d --build
```

### 1.2 验证
```bash
# 服务健康
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost/api/health        # 应返回 200

# 查看日志
docker compose -f docker-compose.prod.yml logs -f api
```

---

## 2. 环境变量与密钥

- 所有密钥来自 `deploy/.env.prod`，**不进镜像、不进 git**（`.gitignore` 已排除 `.env*` 仅保留 `.example`）。
- API 实际读取的变量（以 `apps/api/src` 中 `process.env.*` 为准）：
  `DATABASE_URL`、`PORT`、`NODE_ENV`、`CORS_ORIGINS`、`POSTGRES_LOCK_TIMEOUT_MS`、
  `SKIP_DB_CONNECT`、`QINIU_ACCESS_KEY/SECRET_KEY/SMS_TEMPLATE_ID`、
  `QINIU_KODO_BUCKET/UPLOAD_HOST/DOWNLOAD_HOST/ACCESS_KEY/SECRET_KEY`、
  `AMAP_SERVER_KEY`、`WECHAT_APPID/APP_SECRET`、
  `COOKIE_SAME_SITE`、`COOKIE_DOMAIN`（后两项为本阶段新增，见 §6）。
- 短信仅用 `QINIU_*`（签名/模板在七牛控制台配置）；当前代码 **不** 读取 `SESSION_*_SECRET` / `APP_ORIGIN`，无需填写。

---

## 3. 数据库迁移 / 回滚

- 启动入口 `apps/api/docker-entrypoint.sh` 在每次启动执行 `prisma migrate deploy`（**幂等**，只应用已合入的迁移）。
- **不要在容器内跑 `migrate dev` / `db push` / 重置**；迁移文件由代码评审 + CI 控制。
- 新增迁移流程（开发侧）：在本地 `npm run prisma:migrate` 生成迁移并评审合入，部署时由 `migrate deploy` 自动落地。

### 回滚迁移
Prisma 不支持自动 down migration。回滚策略：
1. 在 `prisma/migrations/` 中新增一个**补偿迁移**（反向 DDL）并评审合入；
2. 或先 `scripts/db-restore.sh` 恢复到升级前备份（见 §4），再部署旧镜像 tag。

---

## 4. 备份与恢复

### 备份（逻辑dump，自动保留 14 天）
```bash
bash scripts/db-backup.sh
# 产物：backups/tongluxing-<db>-<时间戳>.sql.gz
```
建议加入定时任务（cron / 七牛云 VM 计划任务），例如每日 03:00：
```cron
0 3 * * * cd /path/to/Codeway && bash scripts/db-backup.sh >> backups/cron.log 2>&1
```

### 恢复（会覆盖现有数据，谨慎）
```bash
bash scripts/db-restore.sh backups/tongluxing-<db>-<时间戳>.sql.gz
# 脚本会要求输入 YES 二次确认。
```
> 恢复前建议先停 api 以避免写入冲突：`docker compose -f docker-compose.prod.yml stop api`，恢复后再 `start api`。

---

## 5. 监控与告警

- **存活**：定时 `curl -fsS http://<host>/api/health`；非 200 即告警。
- **容器**：`docker compose ... ps` 应全部 `healthy`/`Up`；api 健康检查 30s 起算。
- **资源**：关注 API 内存（运行时 `NODE_OPTIONS=--max-old-space-size=512`）、PG 磁盘（`pgdata` 卷）。
- **业务**：订单截图保留期到期清理每小时执行一次（`FareUploadCleanupService`，含 `cleanupExpiredBoundScreenshots`，阶段 3 + 阶段 10）。
- **建议告警项**：health 连续失败、PG 磁盘 >80%、近 7 天无备份成功、短信发送失败率突增。

---

## 6. 限流 / 安全自查（阶段 5 已落地，部署复核）

- **认证限流**：`ThrottlerModule` 已在 `auth.module` 启用，验证码/登录接口受保护。
- **会话 Cookie**：`auth.service.buildCookieOptions` 已支持 `COOKIE_SAME_SITE` 与 `COOKIE_DOMAIN` 环境变量：
  - 同域部署（Web 与 API 同一域名，由 nginx 同源托管）：保持 `COOKIE_SAME_SITE=lax` + `COOKIE_DOMAIN=` 即可，`secure` 随 `NODE_ENV=production` 自动开启。
  - 跨域部署（Web/API 不同源）：设 `COOKIE_SAME_SITE=none` 并显式 `COOKIE_DOMAIN=<你的根域>`，`secure` 随 `none` 自动开启。
- **会话token**：仅存 SHA-256 哈希于 DB，原始 token 只存在于 HttpOnly Cookie，DB 泄露不可重放。
- **状态事务**：`POSTGRES_LOCK_TIMEOUT_MS`（默认 3000）让锁竞争快速失败为 503 `RIDE_STATE_BUSY`。
- **日志脱敏**：生产日志不得打印手机号全量/密钥；现有短信日志已做 `maskPhone`。

---

## 7. 发布 / 回滚（代码版本）

- 发布：合并到 `master` → 在 VM 上 `git pull` → `docker compose -f docker-compose.prod.yml up -d --build`。
- 回滚：用镜像 tag 或 `git checkout <旧commit>` 后重建；配合 §3 的数据库补偿迁移或 §4 的备份恢复。
- 灰度试点：阶段 10 先小范围白名单用户，观察订单/截图/短信链路 3–7 天再全量。

---

## 8. HTTPS / 域名 / 备案（阶段 9 核查清单）

公网发布前**必须**补齐，否则不得全量开放：

- [ ] 正式域名解析到七牛云 VM 公网 IP（A 记录）。
- [ ] 域名 **ICP 备案** 完成（中国大陆服务器强制要求）。
- [ ] 申请 TLS 证书（Let's Encrypt / 七牛云证书），放入 `deploy/certs/fullchain.pem` 与 `privkey.pem`。
- [ ] 将 `deploy/nginx.conf` 挂载为默认配置（HTTPS 强制 + HSTS）；移除 http-only 配置与 certs 挂载注释前的临时状态。
- [ ] `CORS_ORIGINS` 改为 `https://<你的域名>`。
- [ ] 确认 Cookie `secure`/`SameSite` 在 HTTPS 下正确（同域保持 lax）。
- [ ] 短信签名主体、备案主体、域名主体保持一致（合规）。
- [ ] 上线隐私政策与推荐说明页（`/disclaimer`，阶段 7 已提供）。

> 备案/证书就绪前的临时试点，可用 `deploy/nginx.http-only.conf`（仅 HTTP），但**不得**对外全量开放注册/真实业务。

---

## 9. 常见问题排查

- **nginx 起不来（SSL 报错）**：证书路径缺失。试点期改用 `nginx.http-only.conf`；生产期确认 `deploy/certs/` 已挂载且文件名匹配 `nginx.conf`。
- **api 健康检查失败**：看 `docker compose ... logs api`；多为 `DATABASE_URL` 解析不到 `postgres`（确认 compose 中 `environment.DATABASE_URL` 用了 `postgres:5432` 服务名）。
- **跨域 / Cookie 不写入**：检查 `CORS_ORIGINS` 是否含页面 origin；跨域需 `COOKIE_SAME_SITE=none` + `COOKIE_DOMAIN`。
- **Kodo 上传报错**：确认 5 个 `QINIU_KODO_*` 全部填写；否则生产会 `fail-closed`（拒绝启动存储相关能力）。
