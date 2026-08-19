#!/usr/bin/env bash
# Backup diario de Postgres para producción — pensado para correr desde el
# crontab del usuario `ubuntu` en el VPS (NO el de root, que es todo de
# CyberPanel — no tocar). Rotación local de 14 días, sin destino offsite por
# ahora (decisión de producto: alcanza para arrancar, se revisa más adelante
# si el volumen de datos lo justifica).
#
# Uso:
#   ./scripts/backup-postgres.sh
#
# Variables de entorno opcionales (con default pensado para el docker-compose
# de este repo, ver .env.example):
#   REPO_DIR      default: directorio del propio script (../ desde scripts/)
#   BACKUP_DIR    default: $REPO_DIR/backups
#   RETENTION_DAYS default: 14
#   POSTGRES_USER default: pos
#   POSTGRES_DB   default: pos_saas

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
POSTGRES_USER="${POSTGRES_USER:-pos}"
POSTGRES_DB="${POSTGRES_DB:-pos_saas}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/${POSTGRES_DB}-${TIMESTAMP}.sql.gz"

cd "$REPO_DIR"

# -T: sin pseudo-tty — necesario para correr desde cron (no hay terminal).
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT_FILE"

# Confirmar que el dump no quedó vacío/corrupto antes de dar el backup por
# bueno — un pg_dump que falló a mitad de camino igual puede dejar un
# archivo con bytes (el gzip de una salida parcial), así que se valida el
# gzip en sí, no solo que el archivo exista.
if ! gzip -t "$OUT_FILE" 2>/dev/null; then
  echo "ERROR: el backup $OUT_FILE no es un gzip válido — se descarta." >&2
  rm -f "$OUT_FILE"
  exit 1
fi

echo "Backup OK: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Rotación: borra backups locales de más de RETENTION_DAYS días.
find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
