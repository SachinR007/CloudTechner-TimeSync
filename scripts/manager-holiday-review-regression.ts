import assert from "node:assert/strict";
import { reviewHolidaysForWeek } from "../src/lib/review-holidays";

const dates = [
  "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
  "2026-10-02", "2026-10-03", "2026-10-04",
];

const automaticHoliday = reviewHolidaysForWeek({
  dates,
  holidayNamesByDate: { "2026-10-02": "Gandhi Jayanti" },
  loggedHoursByDate: { "2026-09-28": 8, "2026-09-29": 8, "2026-09-30": 8, "2026-10-01": 8 },
});
assert.deepEqual(automaticHoliday, [{ date: "2026-10-02", name: "Gandhi Jayanti", worked: false, creditedHours: 8 }]);

const workedHoliday = reviewHolidaysForWeek({
  dates,
  holidayNamesByDate: { "2026-10-02": "Gandhi Jayanti" },
  loggedHoursByDate: { "2026-10-02": 4 },
});
assert.deepEqual(workedHoliday, [{ date: "2026-10-02", name: "Gandhi Jayanti", worked: true, creditedHours: 0 }]);

console.log("MANAGER_HOLIDAY_REVIEW_REGRESSION_PASS");
