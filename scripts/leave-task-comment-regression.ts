import assert from "node:assert/strict";
import { commentsCriteriaForTask, isLeaveTaskName } from "@/lib/timesheet-rules";

assert.equal(isLeaveTaskName("Casual Leave"), true);
assert.equal(isLeaveTaskName("  sick leave "), true);
assert.equal(isLeaveTaskName("PRIVILEGE LEAVE"), true);
assert.equal(isLeaveTaskName("Project work"), false);

assert.equal(commentsCriteriaForTask("Casual Leave", "COMPULSORY"), "NOT_REQUIRED");
assert.equal(commentsCriteriaForTask(" sick leave ", "MORE_THAN_8_HOURS"), "NOT_REQUIRED");
assert.equal(commentsCriteriaForTask("Project work", "COMPULSORY"), "COMPULSORY");
assert.equal(commentsCriteriaForTask("Project work", "LESS_THAN_8_HOURS"), "LESS_THAN_8_HOURS");

console.log("Leave-task comment regression checks passed.");
