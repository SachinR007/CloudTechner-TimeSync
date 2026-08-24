#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${CT_ORBIT_APP_PATH:-/home/timesheet/timesheet-app}"
BACKUP_DIR="${CT_ORBIT_BACKUP_DIR:-/home/timesheet/backups}"

cd "$APP_PATH"

set -a
source .env
set +a

PSQL_URL="${DATABASE_URL%%\?*}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/timesheet_prod_${STAMP}.dump"
COUNTS_FILE="$BACKUP_DIR/timesheet_counts_${STAMP}.txt"

mkdir -p "$BACKUP_DIR"

echo "== CT Orbit DB backup =="
echo "Backup file: $BACKUP_FILE"

psql "$PSQL_URL" -c "
select 'Employee' as table_name, count(*) from \"Employee\"
union all select 'Client', count(*) from \"Client\"
union all select 'Project', count(*) from \"Project\"
union all select 'Task', count(*) from \"Task\"
union all select 'ProjectAllocation', count(*) from \"ProjectAllocation\"
union all select 'TimesheetHeader', count(*) from \"TimesheetHeader\"
union all select 'TimesheetLine', count(*) from \"TimesheetLine\"
union all select 'TimesheetApproval', count(*) from \"TimesheetApproval\"
union all select 'ApprovalHistory', count(*) from \"ApprovalHistory\"
union all select 'ImportRun', count(*) from \"ImportRun\"
union all select 'AllocationRequest', count(*) from \"AllocationRequest\"
union all select 'Notification', count(*) from \"Notification\"
union all select 'Leave', count(*) from \"Leave\"
union all select 'LeaveBalance', count(*) from \"LeaveBalance\"
union all select 'HolidayPlan', count(*) from \"HolidayPlan\"
union all select 'Holiday', count(*) from \"Holiday\"
union all select 'AuditLog', count(*) from \"AuditLog\"
order by table_name;
" | tee "$COUNTS_FILE"

pg_dump "$PSQL_URL" -Fc -f "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE" "$COUNTS_FILE"
sha256sum "$BACKUP_FILE" | tee "${BACKUP_FILE}.sha256"
chmod 600 "${BACKUP_FILE}.sha256"

echo "== CT Orbit DB backup complete =="
