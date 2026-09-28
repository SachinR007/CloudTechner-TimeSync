# Management reporting and timesheet defaults: TDD evidence

## User journeys

- HR can filter employees and projects by active status.
- Timesheet administrators can review read-only utilization data and team missed-timesheet reminders.
- An employee opening My Timesheet resumes on the next working date after their last logged work date.
- An employee selects dates from a Monday-first calendar while the weekly data model remains Monday based.

## RED and GREEN evidence

| Guarantee | RED evidence | GREEN evidence |
|---|---|---|
| Management filter and notification classification helpers behave safely | `tsx scripts/management-reporting-regression.ts` failed because `management-reporting` did not exist. | `MANAGEMENT_REPORTING_REGRESSION_PASS` |
| Default date skips weekends and uses allocation/today fallback | `tsx scripts/timesheet-default-regression.ts` failed because `timesheet-default` did not exist. | `TIMESHEET_DEFAULT_REGRESSION_PASS` |
| Manager reminder metadata identifies the affected employee while personal reminders stay personal | Notification regression initially failed after the personal/team distinction was specified. | `NOTIFICATION_REGRESSION_PASS` |

## Final validation

- `HOLIDAY_PLAN_REGRESSION_PASS`
- `MANAGEMENT_REPORTING_REGRESSION_PASS`
- `NOTIFICATION_REGRESSION_PASS`
- `TIMESHEET_DEFAULT_REGRESSION_PASS`
- `tsc --noEmit` passed.
- Focused ESLint passed with no errors. Existing dashboard `<img>` optimization warning remains outside this feature.
- Prisma schema validation passed; the additive notification metadata migration was applied only to local Docker PostgreSQL during validation.

Coverage tooling is not configured in this repository. GitHub Linux CI remains the authoritative production build check because the Windows local Next build does not complete its worker stage or emit a `BUILD_ID`.
