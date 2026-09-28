import assert from "node:assert/strict";
import {
  filterByActivity,
  allocationOverlapsRange,
  normalizeReportDate,
  normalizeActivityFilter,
  notificationSectionFor,
} from "../src/lib/management-reporting";

type Row = { isActive: boolean };

assert.equal(normalizeActivityFilter(undefined), "all");
assert.equal(normalizeActivityFilter("ACTIVE"), "active");
assert.equal(normalizeActivityFilter("inactive"), "inactive");
assert.equal(normalizeActivityFilter("unexpected"), "all");

const rows: Row[] = [{ isActive: true }, { isActive: false }, { isActive: true }];
assert.deepEqual(filterByActivity(rows, "all"), rows);
assert.deepEqual(filterByActivity(rows, "active"), [rows[0], rows[2]]);
assert.deepEqual(filterByActivity(rows, "inactive"), [rows[1]]);

assert.equal(normalizeReportDate("2026-02-28"), "2026-02-28");
assert.equal(normalizeReportDate("2026-02-30"), undefined);
assert.equal(allocationOverlapsRange(new Date("2026-01-01"), new Date("2026-01-31"), "2026-01-15", "2026-02-15"), true);
assert.equal(allocationOverlapsRange(new Date("2026-01-01"), new Date("2026-01-31"), "2026-02-01", undefined), false);

assert.equal(notificationSectionFor("Aditi did not fill the timesheet of previous week."), "team");
assert.equal(notificationSectionFor("A generic message", "MISSED_TIMESHEET"), "personal");
assert.equal(notificationSectionFor("Your timesheet was approved."), "personal");

console.log("MANAGEMENT_REPORTING_REGRESSION_PASS");
