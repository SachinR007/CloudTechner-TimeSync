# CT Orbit Production Runbook

This app is deployed as a Node.js/Next.js process managed by PM2. PostgreSQL remains outside the app process and is backed up/restored separately.

## GitHub Self-Hosted Runner Deploy

Production deploys run on the VM through a repo-level GitHub self-hosted runner.

Expected runner:

- Service: `actions.runner.cloudtechner-ct-orbit.ct-orbit-prod-runner.service`
- Linux user: `timesheet`
- Labels: `self-hosted`, `linux`, `arm64`, `ct-orbit-prod`
- App path: `/home/timesheet/timesheet-app`

The deploy workflow is manual (`workflow_dispatch`) and runs one deployment at a time. It does not need SSH secrets or a long-lived repository token. `actions/checkout` uses GitHub's short-lived token to check out `main`, and the production app repo fetches `main` using the same short-lived GitHub Actions token. Validation that needs the production database runs from `/home/timesheet/timesheet-app`, where the real `.env` already exists.

Check runner health on the VM:

```bash
sudo systemctl status actions.runner.cloudtechner-ct-orbit.ct-orbit-prod-runner.service --no-pager -l
```

Trigger deployment from GitHub:

`Actions -> Deploy Production -> Run workflow`

Use `create_db_backup=true` for normal production deploys.

Production environment approval is optional. If CloudTechner wants an extra approval gate later, add a GitHub environment named `production` with required reviewers, then add `environment: production` back to the deploy job.

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

## Backfill Standard Leave Tasks

After deploying code that includes the leave-task template, run this once to add
the tasks to existing active projects. Preview first:

```bash
cd /home/timesheet/timesheet-app
npm run tasks:backfill-leave
```

Apply after the preview looks correct:

```bash
npm run tasks:backfill-leave -- --apply
```

Validate active projects:

```bash
set -a
source .env
set +a
PSQL_URL="${DATABASE_URL%%\?*}"

psql "$PSQL_URL" -c "
select p.name,
       count(t.id) filter (where t.name in ('Casual Leave', 'Sick Leave', 'Privilege Leave')) as leave_task_count
from \"Project\" p
left join \"Task\" t on t.\"projectId\" = p.id
where p.\"isActive\" = true
group by p.id, p.name
having count(t.id) filter (where t.name in ('Casual Leave', 'Sick Leave', 'Privilege Leave')) <> 3
order by p.name;
"
```

No rows means every active project has all three standard leave tasks.

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
