#!/usr/bin/env bash
# Restores a backup made by backup.sh. DESTRUCTIVE: replaces current data. Usage: ./scripts/restore.sh backups/<timestamp>
set -euo pipefail
DIR="${1:?usage: restore.sh backups/<timestamp>}"
read -r -p "This REPLACES the current database and audio files. Type RESTORE to continue: " c
[ "$c" = "RESTORE" ] || { echo aborted; exit 1; }
(cd "$DIR" && sha256sum -c SHA256SUMS)
if [ -n "${DATABASE_URL:-}" ]; then
  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" "$DIR/db.dump"
  mkdir -p "${AUDIO_DIR:-./data/audio}" && tar -xzf "$DIR/audio.tgz" -C "${AUDIO_DIR:-./data/audio}"
else
  docker compose exec -T db pg_restore --clean --if-exists --no-owner -U experiment -d experiment < "$DIR/db.dump"
  docker compose exec -T app tar -xzf - -C /data/audio < "$DIR/audio.tgz"
fi
echo "Restore complete."
