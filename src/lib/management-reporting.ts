export type ActivityFilter = "all" | "active" | "inactive";

export function normalizeActivityFilter(value: string | undefined): ActivityFilter {
  switch (value?.trim().toLowerCase()) {
    case "active":
      return "active";
    case "inactive":
      return "inactive";
    default:
      return "all";
  }
}

export function filterByActivity<T extends { isActive: boolean }>(items: T[], filter: ActivityFilter): T[] {
  if (filter === "all") return items;
  const isActive = filter === "active";
  return items.filter((item) => item.isActive === isActive);
}

export function normalizeReportDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

export function allocationOverlapsRange(
  allocationStart: Date,
  allocationEnd: Date | null,
  rangeStart?: string,
  rangeEnd?: string,
): boolean {
  const start = rangeStart ? new Date(`${rangeStart}T00:00:00.000Z`) : null;
  const end = rangeEnd ? new Date(`${rangeEnd}T00:00:00.000Z`) : null;
  if (start && allocationEnd && allocationEnd < start) return false;
  if (end && allocationStart > end) return false;
  return true;
}

export type NotificationSection = "personal" | "team";

/**
 * Missed-timesheet messages are created for managers because they concern a
 * direct report, not the manager's own timesheet. The stored Notification
 * model predates typed notifications, so classify the stable system wording
 * here without changing existing production records. `kind` is intentionally
 * not sufficient by itself: a personal reminder is also a missed-timesheet
 * event, but only the manager wording belongs in the My Team section.
 */
export function notificationSectionFor(message: string, kind?: string | null): NotificationSection {
  const concernsTeamMember = /\bdid not fill the timesheet\b/i.test(message);
  return concernsTeamMember || (kind === "MISSED_TIMESHEET" && concernsTeamMember) ? "team" : "personal";
}
