# 公网全量开放前核查清单（外部前置条件）

> 适用：Codeway「同路行」在七牛云 VM 上正式对外发布之前。
> 代码侧（容器化 / HTTPS 配置 / Cookie 策略 / 备份脚本）已在阶段 8–10 完成；本清单是**必须由团队/运营侧补齐的外部前置项**。
> 备案 / 证书就绪前，可用 `deploy/nginx.http-only.conf` 做小范围试点，**不得**对外全量开放真实业务。

## 0. 通用原则（务必先读）
- **主体一致**：域名注册主体、ICP 备案主体、短信签名（Qiniu SMS）申请主体，三者必须一致（企业或个人的统一社会信用代码 / 身份证）。不一致会被管局驳回、短信签名审核不通过。
- **先备案后解析公网流量**：在国内，未备案域名即便解析也会被阻断。建议备案通过后再把 A 记录指向 VM 公网 IP。
- **证书与私钥绝不入库**：`deploy/certs/*.pem` 已被 `.gitignore` 忽略（见仓库根 `.gitignore`）。

---

## 1. 域名注册与解析
- [ ] 注册正式域名（如 `tongluxing.example.com`）。
- [ ] 域名注册主体与 ICP / 短信签名主体一致。
- [ ] 在 DNS 控制台添加 A 记录指向七牛云 VM 的公网 IP（含 `@` 与 `www`，按实际）。
- [ ] 验证解析生效：`dig +short your-domain.com`。

## 2. ICP 备案
- [ ] 通过域名注册商 / 云厂商（阿里云 / 腾讯云 / 七牛合作接入商）提交 ICP 备案。
- [ ] 准备材料：营业执照（企业）或身份证（个人）、域名证书、接入商要求的核验单 / 当面核验。
- [ ] 备案主体 = 域名主体 = 短信签名主体（一致）。
- [ ] 备案通过后取得 **ICP 备案号**，需展示在网站页脚（前端落地页补「备案号 + 公安备案链接」）。
- [ ] 取得备案号后，在网站底部增加跳转至 `https://beian.miit.gov.cn` 的链接。

## 3. TLS 证书
- [ ] 获取证书（Let's Encrypt 免费 / 云厂商购买），见 `deploy/certs/README.md`。
- [ ] 将证书按约定命名放入 `deploy/certs/`：
  - `fullchain.pem` → `/etc/nginx/certs/fullchain.pem`
  - `privkey.pem`   → `/etc/nginx/certs/privkey.pem`
- [ ] 配置自动续期（Let's Encrypt `--deploy-hook` 或 cron，见 README）。
- [ ] 验证证书覆盖访问域名（含 www / 非 www）。

## 4. 生产环境变量（deploy/.env.prod）
基于 `deploy/.env.prod.example` 复制并填写，**重点核对以下与安全 / 跨域相关的项**：

- [ ] `CORS_ORIGINS` 改为 `https://your-domain.com,https://www.your-domain.com`（必须是 https，且与前端部署域名一致）。
- [ ] 同域部署：`COOKIE_SAME_SITE=lax`、`COOKIE_DOMAIN` 留空（Cookie 默认作用于当前域）。
- [ ] 若有独立前端域（前后端不同源）：`COOKIE_SAME_SITE=none` 且 `COOKIE_DOMAIN=.your-domain.com`（注意开头的点），并确保 Cookie 走 HTTPS（`NODE_ENV=production` 下已自动 `secure`）。
- [ ] `POSTGRES_PASSWORD` 使用强随机值。
- [ ] `QINIU_*` / `QINIU_KODO_*` 与备案主体一致的短信签名、Kodo 私有桶配置正确。
- [ ] `DATABASE_URL` 由 compose 自动注入（容器内 `postgres:5432`），无需手填。

## 5. 切换 HTTPS 生产配置
- [ ] 确认 `docker-compose.prod.yml` 中 nginx 服务挂载的是 `./deploy/nginx.conf`（不是 `nginx.http-only.conf`）。
- [ ] 确认 `./deploy/certs` 与 `./deploy/www/certbot` 两条挂载未被注释。

## 6. 上线前一键校验
- [ ] 运行 `bash deploy/verify-launch.sh`，全部 PASS。
- [ ] 启动后验证：
  - `curl -I http://your-domain.com` → 应 301 跳转到 https。
  - `curl -I https://your-domain.com/api/health` → `200 OK`。
  - 浏览器登录后，DevTools → Application → Cookies：会话 Cookie 的 `Secure` 与 `SameSite` 属性符合第 4 步设定。
  - `curl -I https://your-domain.com` 响应头含 `Strict-Transport-Security`。

## 7. 试点 → 全量
- [ ] 先用 `nginx.http-only.conf` 小范围试点（限内部 / 受邀用户），验证业务流程与短信送达。
- [ ] 备案 + 证书就绪后切到 `nginx.conf`，按第 6 步全量校验，再对外公布。

## 8. 上线后运维（对应 deploy/runbook.md）
- [ ] 配置数据库每日备份（`scripts/db-backup.sh`，保留 14 天）。
- [ ] 配置基础监控 / 告警（进程存活、磁盘、证书到期、/api/health）。
- [ ] 确认限流（`ThrottlerModule`）与错误日志脱敏已生效（见 runbook 安全自查章节）。
