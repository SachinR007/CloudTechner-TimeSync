#!/usr/bin/env bash
set -euo pipefail

if [ "${CT_ORBIT_RESTORE_CONFIRM:-}" != "RESTORE_FULL_DB" ]; then
  echo "Refusing to restore without CT_ORBIT_RESTORE_CONFIRM=RESTORE_FULL_DB"
  exit 1
fi

if [ $# -ne 1 ]; then
  echo "Usage: CT_ORBIT_RESTORE_CONFIRM=RESTORE_FULL_DB bash scripts/prod-db-restore.sh /path/to/backup.dump"
  exit 1
fi

APP_PATH="${CT_ORBIT_APP_PATH:-/home/timesheet/timesheet-app}"
DUMP_FILE="$1"

cd "$APP_PATH"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Backup dump not found: $DUMP_FILE"
  exit 1
fi

set -a
source .env
set +a

PSQL_URL="${DATABASE_URL%%\?*}"

echo "== CT Orbit DB restore =="
echo "Dump file: $DUMP_FILE"

pm2 stop timesheet-app
pg_restore --clean --if-exists --no-owner --dbname "$PSQL_URL" "$DUMP_FILE"
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart timesheet-app --update-env
sleep 5
pm2 status
curl -fsSI "${CT_ORBIT_HEALTH_URL:-https://orbit.cloudtechner.com/login}"

echo "== CT Orbit DB restore complete =="
