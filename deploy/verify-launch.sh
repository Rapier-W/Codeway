#!/usr/bin/env bash
# 上线前一键就绪校验：检查证书、生产环境变量（CORS / Cookie / 数据库 / 七牛）是否齐备。
# 用法： bash deploy/verify-launch.sh
# 退出码：0 = 全部通过；1 = 存在硬失败（阻断上线）。
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass=0; fail=0; warn=0
ENV_FILE="deploy/.env.prod"
CERTS_DIR="deploy/certs"

ok()   { echo -e "${GREEN}[PASS]${NC} $1"; pass=$((pass+1)); }
bad()  { echo -e "${RED}[FAIL]${NC} $1"; fail=$((fail+1)); }
wrn()  { echo -e "${YELLOW}[WARN]${NC} $1"; warn=$((warn+1)); }

# 从 .env.prod 提取某个变量的值（兼容 KEY=VALUE，忽略注释与空行）
get_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || { echo ""; return; }
  # 取最后一个定义，去除首尾引号
  grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n1 | sed -E "s/^[^=]+=//; s/^[[:space:]]*['\"]?//; s/['\"]?[[:space:]]*$//"
}

echo "=== Codeway 上线前就绪校验 ==="
echo

# 1) 生产 env 文件存在
if [ -f "$ENV_FILE" ]; then ok "生产环境变量文件 $ENV_FILE 存在"; else bad "缺少 $ENV_FILE（先 cp deploy/.env.prod.example deploy/.env.prod 并填写）"; fi

# 2) 数据库密码
PGPW="$(get_env POSTGRES_PASSWORD)"
if [ -n "$PGPW" ]; then ok "POSTGRES_PASSWORD 已设置"; else bad "POSTGRES_PASSWORD 未设置（强随机值）"; fi

# 3) CORS_ORIGINS 必须为 https
CORS="$(get_env CORS_ORIGINS)"
if [ -z "$CORS" ]; then
  bad "CORS_ORIGINS 未设置"
elif [[ "$CORS" == https://* ]]; then ok "CORS_ORIGINS 使用 https：$CORS"; else bad "CORS_ORIGINS 必须是 https 开头（当前：$CORS）"; fi

# 4) Cookie 策略一致性
SAME_SITE="$(get_env COOKIE_SAME_SITE)"; SAME_SITE="${SAME_SITE:-lax}"
COOKIE_DOMAIN="$(get_env COOKIE_DOMAIN)"
case "$SAME_SITE" in
  lax|strict|none) ok "COOKIE_SAME_SITE=$SAME_SITE 合法" ;;
  *) bad "COOKIE_SAME_SITE=$SAME_SITE 非法（应为 lax|strict|none）" ;;
esac
if [ "$SAME_SITE" = "none" ]; then
  if [ -n "$COOKIE_DOMAIN" ]; then ok "跨站 Cookie 已配置 COOKIE_DOMAIN=$COOKIE_DOMAIN"; else bad "COOKIE_SAME_SITE=none 时必须设置 COOKIE_DOMAIN（如 .your-domain.com）"; fi
else
  if [ -n "$COOKIE_DOMAIN" ]; then wrn "同域部署下设置了 COOKIE_DOMAIN=$COOKIE_DOMAIN；同域一般留空即可，确认是否有意为之"; else ok "同域部署 Cookie 未设 COOKIE_DOMAIN（默认当前域）"; fi
fi

# 5) 七牛（短信 / Kodo）配置（缺失仅告警，不阻断，但影响短信与截图存储）
for k in QINIU_ACCESS_KEY QINIU_SECRET_KEY QINIU_KODO_BUCKET QINIU_KODO_DOMAIN; do
  v="$(get_env $k)"
  if [ -n "$v" ]; then ok "$k 已设置"; else wrn "$k 未设置（短信 / 对象存储将不可用）"; fi
done

# 6) TLS 证书（HTTPS 生产配置必需）
if [ -f "$CERTS_DIR/fullchain.pem" ] && [ -f "$CERTS_DIR/privkey.pem" ]; then
  ok "证书文件齐全：$CERTS_DIR/fullchain.pem + privkey.pem"
else
  bad "缺少 TLS 证书：$CERTS_DIR/fullchain.pem 与/或 privkey.pem 不存在（HTTPS 生产配置 nginx.conf 将启动失败）"
fi

# 7) 提示：http-only 试点配置仅在备案前使用
if grep -q "nginx.http-only.conf" docker-compose.prod.yml 2>/dev/null; then
  wrn "docker-compose.prod.yml 仍引用 nginx.http-only.conf（仅 HTTP 试点）；全量上线请改回 deploy/nginx.conf"
fi

echo
echo "=== 汇总：PASS=$pass  FAIL=$fail  WARN=$warn ==="
if [ "$fail" -gt 0 ]; then
  echo -e "${RED}存在阻断项，未达上线标准。${NC}"
  exit 1
else
  echo -e "${GREEN}未检出阻断项，可进入上线流程（仍请人工复核 WARN）。${NC}"
  exit 0
fi
