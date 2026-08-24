#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${CT_ORBIT_APP_PATH:-/home/timesheet/timesheet-app}"
BRANCH="${CT_ORBIT_BRANCH:-main}"
FETCH_URL="${CT_ORBIT_FETCH_URL:-origin}"
HEALTH_URL="${CT_ORBIT_HEALTH_URL:-https://orbit.cloudtechner.com/login}"

cd "$APP_PATH"

echo "== CT Orbit deploy =="
echo "App path: $APP_PATH"
echo "Branch: $BRANCH"

git status --short
git branch "backup/prod-main-before-deploy-$(date +%Y%m%d_%H%M%S)"
git fetch "$FETCH_URL" "$BRANCH"
git checkout -B main FETCH_HEAD
git log --oneline -3

npm ci
npx prisma migrate deploy
npx prisma generate
npm run build

pm2 restart timesheet-app --update-env
sleep 5
pm2 status
pm2 logs timesheet-app --lines 50 --nostream
curl -fsSI "$HEALTH_URL" >/tmp/ct-orbit-health.headers
cat /tmp/ct-orbit-health.headers
npm audit --audit-level=moderate

echo "== CT Orbit deploy complete =="
