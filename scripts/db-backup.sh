#!/usr/bin/env bash
# 生产 PostgreSQL 逻辑备份。
# 用法：bash scripts/db-backup.sh
# 依赖：docker compose、docker-compose.prod.yml 与 deploy/.env.prod 存在。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.prod"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
BACKUP_DIR="$ROOT_DIR/backups"
RETENTION_DAYS=14

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE 不存在，请先 cp deploy/.env.prod.example deploy/.env.prod 并填值。" >&2
  exit 1
fi

# 仅读取非敏感的库名/用户（不打印密码）
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
POSTGRES_USER="${POSTGRES_USER:-tongluxing}"
POSTGRES_DB="${POSTGRES_DB:-tongluxing}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/tongluxing-${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

echo "[backup] dumping $POSTGRES_DB@postgres -> $OUT"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists \
  | gzip > "$OUT"

echo "[backup] done: $(du -h "$OUT" | cut -f1)"

echo "[backup] pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'tongluxing-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
