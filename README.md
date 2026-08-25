# CT Orbit

CT Orbit is CloudTechner's internal timesheet, allocation, approval, and HR operations app.

## Production Model

- Runtime: Next.js/Node.js managed by PM2.
- Database: PostgreSQL managed outside the app process.
- Auth: Microsoft SSO through Auth.js.
- Deployment: GitHub Actions checks plus a manual self-hosted runner production workflow.

Production runbook: [docs/production-runbook.md](docs/production-runbook.md)

## Getting Started

First, install dependencies and run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Checks

```bash
npx prisma validate
npm run lint
npm run build
npm run timesheet-access:regression
npm run security:regression
npm audit --audit-level=moderate
```

Run `npm run build` before `npm run security:regression`; the security regression starts `next start` and expects a production build to exist.

## Production Backup And Restore

```bash
bash scripts/prod-db-backup.sh
CT_ORBIT_RESTORE_CONFIRM=RESTORE_FULL_DB bash scripts/prod-db-restore.sh /home/timesheet/backups/<selected-dump>.dump
```

Never commit production dumps, `.env`, Excel exports, generated SQL imports, tokens, or private keys.

## Manual Production Deploy

```bash
cd /home/timesheet/timesheet-app
read -s GH_TOKEN
CT_ORBIT_FETCH_URL="https://x-access-token:${GH_TOKEN}@github.com/cloudtechner/ct-orbit.git" bash scripts/prod-deploy.sh
unset GH_TOKEN
```

The deploy script creates a Git backup branch, fetches the latest code, installs dependencies, applies migrations, builds, restarts PM2, validates `/login`, and runs `npm audit`.
