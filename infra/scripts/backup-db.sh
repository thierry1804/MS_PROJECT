#!/usr/bin/env bash
# Daily dump of the local Postgres container (db-data volume has no automatic
# snapshotting, unlike Neon's point-in-time recovery it replaced). Idempotent,
# keeps the last $KEEP_DAYS days, prunes older ones.
set -euo pipefail

CONTAINER="ms_project-db-1"
PG_USER="atelier"
PG_DB="atelier"
BACKUP_DIR="${BACKUP_DIR:-/home/debian/backups/atelier}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/atelier-$stamp.sql.gz"
tmp="$out.part"

docker exec "$CONTAINER" pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$tmp"
mv "$tmp" "$out"

find "$BACKUP_DIR" -name 'atelier-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

echo "Backup écrit : $out ($(du -h "$out" | cut -f1))"
