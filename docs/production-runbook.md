# CT Orbit Production Runbook

This app is deployed as a Node.js/Next.js process managed by PM2. PostgreSQL remains outside the app process and is backed up/restored separately.

## GitHub Secrets For Manual CI/CD Deploy

Configure these repository secrets in `cloudtechner/ct-orbit`:

- `PROD_SSH_HOST`: production VM hostname or IP.
- `PROD_SSH_USER`: Linux user used by GitHub Actions for SSH. Prefer `timesheet` if it can SSH directly.
- `PROD_SSH_PRIVATE_KEY`: private key for the SSH user.
- `PROD_APP_PATH`: `/home/timesheet/timesheet-app`.
- `PROD_REPO_READ_TOKEN`: read-only GitHub token that can fetch `cloudtechner/ct-orbit`.

The deploy workflow is manual (`workflow_dispatch`) and runs one deployment at a time.

## Manual Deploy On The VM

Run as `timesheet`:

```bash
cd /home/timesheet/timesheet-app
read -s GH_TOKEN
CT_ORBIT_FETCH_URL="https://x-access-token:${GH_TOKEN}@github.com/cloudtechner/ct-orbit.git" bash scripts/prod-deploy.sh
unset GH_TOKEN
```

The script:

1. Creates a Git backup branch before switching code.
2. Fetches the requested branch.
3. Runs `npm ci`.
4. Applies Prisma migrations.
5. Generates Prisma client.
6. Builds Next.js.
7. Restarts PM2.
8. Checks `/login`.
9. Runs `npm audit --audit-level=moderate`.

## Production Backup

Run as `timesheet`:

```bash
cd /home/timesheet/timesheet-app
bash scripts/prod-db-backup.sh
```

Backups are written under `/home/timesheet/backups`:

- `timesheet_prod_<timestamp>.dump`
- `timesheet_counts_<timestamp>.txt`
- `timesheet_prod_<timestamp>.dump.sha256`

## Restore Old Data

Use only after confirming the exact dump file:

```bash
cd /home/timesheet/timesheet-app
CT_ORBIT_RESTORE_CONFIRM=RESTORE_FULL_DB bash scripts/prod-db-restore.sh /home/timesheet/backups/timesheet_prod_before_testing_YYYYMMDD_HHMMSS.dump
```

The restore script stops PM2, restores the full PostgreSQL dump, reapplies migrations, rebuilds, restarts PM2, and checks `/login`.

## Safer Testing Phase Pattern

Before wiping data for a testing phase:

```bash
bash scripts/prod-db-backup.sh
```

After testing, restore the selected dump:

```bash
CT_ORBIT_RESTORE_CONFIRM=RESTORE_FULL_DB bash scripts/prod-db-restore.sh /home/timesheet/backups/<selected-dump>.dump
```

Keep real dump files out of GitHub. The repo ignores `.dump`, `.sql`, `.xlsx`, `.env`, and local backup folders.
