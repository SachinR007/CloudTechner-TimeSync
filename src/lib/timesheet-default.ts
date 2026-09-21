import { addDays } from "@/lib/dates";

function atUtcMidnight(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextWeekday(date: Date) {
  let candidate = atUtcMidnight(date);
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

/** Returns the first date an employee should resume filling, in UTC. */
export function defaultTimesheetDate({
  lastLoggedDate,
  firstEligibleDate,
  today,
}: {
  lastLoggedDate: Date | null;
  firstEligibleDate: Date | null;
  today: Date;
}) {
  if (lastLoggedDate) return nextWeekday(addDays(lastLoggedDate, 1));
  if (firstEligibleDate) return nextWeekday(firstEligibleDate);
  return nextWeekday(today);
}
