import assert from "node:assert/strict";
import { defaultTimesheetDate } from "../src/lib/timesheet-default";

const today = new Date("2026-09-21T00:00:00.000Z"); // Monday

assert.equal(defaultTimesheetDate({ lastLoggedDate: new Date("2026-09-18T00:00:00.000Z"), firstEligibleDate: null, today }).toISOString().slice(0, 10), "2026-09-21");
assert.equal(defaultTimesheetDate({ lastLoggedDate: new Date("2026-09-15T00:00:00.000Z"), firstEligibleDate: null, today }).toISOString().slice(0, 10), "2026-09-16");
assert.equal(defaultTimesheetDate({ lastLoggedDate: null, firstEligibleDate: new Date("2026-09-08T00:00:00.000Z"), today }).toISOString().slice(0, 10), "2026-09-08");
assert.equal(defaultTimesheetDate({ lastLoggedDate: null, firstEligibleDate: null, today }).toISOString().slice(0, 10), "2026-09-21");

console.log("TIMESHEET_DEFAULT_REGRESSION_PASS");
