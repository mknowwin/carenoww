#!/usr/bin/env bash
#
# Dumps the Carenoww MongoDB database with mongodump and stores the result
# under scripts/backups/<timestamp>/.
#
# Usage:
#   ./scripts/backup-mongo.sh                 # uses MONGODB_URI from .env
#   MONGODB_URI="mongodb://..." ./scripts/backup-mongo.sh
#   ./scripts/backup-mongo.sh --uri "mongodb://..." --out /custom/backups --keep 14
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." &>/dev/null && pwd)"

BACKUP_ROOT="${SCRIPT_DIR}/backups"
KEEP=0
URI=""

usage() {
  echo "Usage: $0 [--uri <mongodb-uri>] [--out <backup-dir>] [--keep <n>]"
  echo
  echo "  --uri   MongoDB connection string (default: MONGODB_URI from .env)"
  echo "  --out   Directory to write backups into (default: scripts/backups)"
  echo "  --keep  Number of most recent backups to retain; older ones are deleted (default: keep all)"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uri) URI="$2"; shift 2 ;;
    --out) BACKUP_ROOT="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${URI}" ]]; then
  if [[ -n "${MONGODB_URI:-}" ]]; then
    URI="${MONGODB_URI}"
  elif [[ -f "${PROJECT_ROOT}/.env" ]]; then
    URI="$(grep -E '^MONGODB_URI=' "${PROJECT_ROOT}/.env" | tail -n1 | cut -d '=' -f2- | tr -d '"'"'"'' )"
  fi
fi

if [[ -z "${URI}" ]]; then
  echo "Error: no MongoDB URI found. Set MONGODB_URI in .env, export it, or pass --uri." >&2
  exit 1
fi

if ! command -v mongodump &>/dev/null; then
  echo "Error: mongodump not found. Install the MongoDB Database Tools:" >&2
  echo "  https://www.mongodb.com/docs/database-tools/installation/" >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_ROOT}/${TIMESTAMP}"
mkdir -p "${DEST}"

echo "Dumping MongoDB to ${DEST} ..."
mongodump --uri="${URI}" --out="${DEST}"

ARCHIVE="${BACKUP_ROOT}/${TIMESTAMP}.tar.gz"
tar -czf "${ARCHIVE}" -C "${BACKUP_ROOT}" "${TIMESTAMP}"
rm -rf "${DEST}"

echo "Backup complete: ${ARCHIVE}"

if [[ "${KEEP}" -gt 0 ]]; then
  ls -1t "${BACKUP_ROOT}"/*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    echo "Removing old backup: ${old}"
    rm -f "${old}"
  done
fi
