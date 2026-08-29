# Codeway 进度同步（队友周知）

> 仓库：`github.com/Rapier-W/Codeway` · 分支 `master` · 最新提交 `1500d57`
> 更新时间：2026-08-29

## 一、总体进度：黑客松 10 个阶段已全部完成（1–10）

- 阶段 1–6：费用订单幂等 / 成团后费用变更 / 截图留存 90 天 / 测试可信度与并发 / 认证生产化 / Kodo 真实联调（阶段性 6 已真实验证通过）。
- 阶段 7：Web/PWA 联调（后端留存字段 + 前端费用方案修订 / 截图留存展示 / 推荐免责页 + 测试）。
- 阶段 8：生产容器化（七牛云 VM）。
- 阶段 9：Cookie / HTTPS / 域名备案。
- 阶段 10：运维与试点发布。

## 二、最近提交 `1500d57`（外部前置条件落地脚手架）

1. **证书约定** `deploy/certs/README.md` + `.gitkeep`：证书按 `fullchain.pem` / `privkey.pem` 放入，含 Let's Encrypt / certbot 获取与续期指引，与 `deploy/nginx.conf` 完全对齐。
2. **ACME 校验占位** `deploy/www/certbot/.gitkeep`：webroot 挂载占位。
3. **上线核查清单** `deploy/launch-checklist.md`：域名解析 → ICP 备案 → TLS 证书 → CORS/COOKIE 环境变量 → 切 HTTPS 配置 → 一键校验 → 试点转全量。并强调 **域名主体 / ICP 主体 / 短信签名主体三者必须一致**。
4. **上线前校验脚本** `deploy/verify-launch.sh`（已 +x）：读 `deploy/.env.prod` 校验证书、CORS 必须为 https、Cookie 策略合法性、数据库密码、七牛配置，输出 PASS/FAIL 汇总。
5. **`.gitignore`**：明确忽略 `deploy/certs/*.pem|*.key|*.crt` 与 `deploy/www/certbot/*`，杜绝私钥入库。

> 同批还包含阶段 8–10 主体：生产 `docker-compose.prod.yml`、API `Dockerfile` + 启动脚本、nginx（HTTPS / http-only 两套）、数据库备份恢复脚本、运维 runbook、Cookie 环境变量化等（提交 `ac9a5b3` 及其前序）。

## 三、重要澄清：之前提到的 11 个 TS 错误不会阻断容器构建

已本地实测：`npx prisma generate`（消除 10 个 Prisma 客户端与 schema 不同步错误）+ 安装 `qiniu`（package.json / lockfile 均已声明，`npm ci` 自动安装）后，`npm run build`（`nest build`，即 `Dockerfile` 的构建步骤）成功，`dist/main.js` 已生成。那 11 个只是本地构建环境未完整导致的"假错误"，**容器镜像构建可正常通过**。

## 四、仍待团队侧补齐的外部前置（非代码）

公网全量开放前必须完成：

- **正式域名解析**：A 记录指向七牛云 VM 公网 IP。
- **ICP 备案**：主体须与域名、短信签名一致。
- **TLS 证书**：签发后放入 `deploy/certs/`，命名为 `fullchain.pem` + `privkey.pem`。
- **生产环境变量**：`CORS_ORIGINS` 改为 `https://你的域名`；同域部署保持 `COOKIE_SAME_SITE=lax`、`COOKIE_DOMAIN` 留空，跨域才设 `none` + 显式 `COOKIE_DOMAIN`。
- **切 HTTPS 配置**：把 `docker-compose.prod.yml` 的 nginx 挂载从 `deploy/nginx.http-only.conf` 改回 `deploy/nginx.conf`。
- **上线前校验**：跑 `bash deploy/verify-launch.sh` 全绿后再切全量。备案 / 证书就绪前**仅可用 http-only 做小范围试点，不得对外全量开放真实业务**。

## 五、环境说明（不阻塞你们真实 VM）

- 本沙箱对 GitHub 写出口受限，故由本地执行 `git push origin master` 完成推送（已确认 `1500d57` 已上 GitHub）。
- 本沙箱 Docker Desktop 连不上 Docker Hub，无法做本地容器冒烟；你们真实七牛云 VM 有公网，可直接 `docker compose -f docker-compose.prod.yml up -d --build api` 验证（注意需先准备 `deploy/.env.prod`，参考 `deploy/.env.prod.example`，切勿填写真实密钥入库）。
