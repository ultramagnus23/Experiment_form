#!/usr/bin/env bash
# Backs up the database AND the uploaded audio into ./backups/<timestamp>/
# Usage (docker compose):  ./scripts/backup.sh
#       (bare metal):      DATABASE_URL=... AUDIO_DIR=... ./scripts/backup.sh
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="backups/$TS"; mkdir -p "$OUT"
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --no-owner "${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" > "$OUT/db.dump"
  if [ -d "${AUDIO_DIR:-./data/audio}" ]; then
    tar -czf "$OUT/audio.tgz" -C "${AUDIO_DIR:-./data/audio}" .
  else
    echo "No local AUDIO_DIR: audio lives in Vercel Blob. Keep your original audio files; their SHA-256s are in the dashboard/CSV."
  fi
else
  docker compose exec -T db pg_dump -U experiment --format=custom --no-owner experiment > "$OUT/db.dump"
  docker compose exec -T app tar -czf - -C /data/audio . > "$OUT/audio.tgz"
fi
sha256sum "$OUT"/* > "$OUT/SHA256SUMS"
echo "Backup written to $OUT"
