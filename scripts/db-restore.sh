#!/usr/bin/env bash
# 生产 PostgreSQL 逻辑恢复（会覆盖现有数据，谨慎！）。
# 用法：bash scripts/db-restore.sh <备份文件.sql.gz>
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法：bash scripts/db-restore.sh <备份文件.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.env.prod"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"

if [[ ! -f "$BACKUP_FILE" ]]; then echo "ERROR: 备份文件不存在: $BACKUP_FILE" >&2; exit 1; fi
if [[ ! -f "$ENV_FILE" ]]; then echo "ERROR: $ENV_FILE 不存在" >&2; exit 1; fi

POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
POSTGRES_USER="${POSTGRES_USER:-tongluxing}"
POSTGRES_DB="${POSTGRES_DB:-tongluxing}"

echo "⚠️ 此操作将用 $BACKUP_FILE 覆盖数据库 $POSTGRES_DB 的现有数据，且不可逆！"
read -r -p "输入 'YES' 以继续: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then echo "已取消。"; exit 0; fi

echo "[restore] 恢复中..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE"
else
  cat "$BACKUP_FILE"
fi | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction

echo "[restore] 完成。如启用了 api 服务，建议重启以重建连接池/缓存。"
