# 部署证书目录（deploy/certs/）

本目录用于存放 Nginx 的 TLS 证书，**仅在启用 HTTPS 生产配置（`deploy/nginx.conf`）时需要**。
备案 / 证书就绪前做小范围试点，请改用 `deploy/nginx.http-only.conf`（仅 HTTP，切勿承载真实业务）。

## 1. 文件命名约定（必须与 nginx.conf 一致）

| 期望文件名            | 容器内路径                      | 说明                         |
| --------------------- | ------------------------------- | ---------------------------- |
| `fullchain.pem`       | `/etc/nginx/certs/fullchain.pem` | 服务端证书 + 中间证书链       |
| `privkey.pem`         | `/etc/nginx/certs/privkey.pem`   | 私钥（**绝不可提交到 Git**）  |

`docker-compose.prod.yml` 已将 `./deploy/certs` 以只读方式挂载到容器的 `/etc/nginx/certs`。
只要文件名正确，无需改动 `nginx.conf`。

## 2. 获取证书的方式

- **Let's Encrypt（推荐，免费）**：使用 certbot 的 webroot 模式，校验目录已预留为 `deploy/www/certbot`（挂载到容器 `/var/www/certbot`，对应 `nginx.conf` 的 `location /.well-known/acme-challenge/`）。
  ```bash
  # 在宿主机（七牛云 VM）执行，certbot 把文件写到 deploy/www/certbot，证书写到 deploy/certs
  certbot certonly --webroot -w deploy/www/certbot \
    -d your-domain.com -d www.your-domain.com \
    --deploy-hook "cp \$RENEWED_LINEAGE/fullchain.pem deploy/certs/fullchain.pem && cp \$RENEWED_LINEAGE/privkey.pem deploy/certs/privkey.pem && docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload"
  ```
- **云厂商 / CA 购买**：在阿里云 / 腾讯云 / 七牛等控制台申请并下载 Nginx 格式证书，将 `full_chain.crt` 改名 `fullchain.pem`、`private.key` 改名 `privkey.pem` 放入本目录。

## 3. 上线前核查

1. 两个文件均已存在且非空。
2. 证书 `subjectAltName` 覆盖访问域名（含 www 与非 www，按实际）。
3. 私钥权限 `600`，属主为部署用户；本目录不要提交到 Git（见仓库 `.gitignore`）。
4. 确认 `docker-compose.prod.yml` 的 nginx 服务挂载的是 `./deploy/nginx.conf`（不是 http-only 版本），且 certs / certbot 两条挂载未被注释。
5. 运行 `bash deploy/verify-launch.sh` 做一键就绪校验。

## 4. 续期

Let's Encrypt 证书有效期 90 天。上面的 `--deploy-hook` 已包含续期后自动 `cp` 并重载 Nginx。
建议加一条 cron（示例，每月 1 号凌晨）：
```bash
0 3 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/fullchain.pem deploy/certs/fullchain.pem && cp /etc/letsencrypt/live/your-domain.com/privkey.pem deploy/certs/privkey.pem && docker compose -f /path/to/docker-compose.prod.yml exec -T nginx nginx -s reload
```
