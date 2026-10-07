export type ReviewHoliday = {
  date: string;
  name: string;
  creditedHours: number;
  worked: boolean;
};

/**
 * Builds the holiday context shown to an approver for a timesheet week.
 * A holiday is credited only when the employee has not logged any work on
 * that date, which mirrors the employee timesheet's automatic-hours rule.
 */
export function reviewHolidaysForWeek({
  dates,
  holidayNamesByDate,
  loggedHoursByDate,
}: {
  dates: string[];
  holidayNamesByDate: Record<string, string>;
  loggedHoursByDate: Record<string, number>;
}): ReviewHoliday[] {
  return dates.flatMap((date) => {
    const name = holidayNamesByDate[date];
    if (!name) return [];

    const worked = (loggedHoursByDate[date] ?? 0) > 0;
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    return [{
      date,
      name,
      worked,
      creditedHours: isWeekday && !worked ? 8 : 0,
    }];
  });
}
