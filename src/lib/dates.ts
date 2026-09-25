export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Format dates for people while keeping ISO dates for URLs, forms, and the database. */
export function formatDisplayDate(value: Date | string | null | undefined) {
  if (!value) return "-";

  const date = value instanceof Date
    ? value
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);

  if (Number.isNaN(date.getTime())) return "-";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** Format a timestamp for people while preserving a stable 24-hour time. */
export function formatDisplayDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";

  const date = value instanceof Date
    ? value
    : new Date(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);

  if (Number.isNaN(date.getTime())) return "-";

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDisplayDate(date)} ${hours}:${minutes}`;
}

/** Monday (UTC midnight) of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** A human-readable inclusive Monday-Sunday period for timesheets and reminders. */
export function formatWeekRange(value: Date | string) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  const start = mondayOf(date);
  return `${formatDisplayDate(start)} – ${formatDisplayDate(addDays(start, 6))}`;
}

export function weekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mondays (as ISO dates) whose date falls within the calendar month containing `date`. */
export function mondaysInMonth(date: Date): string[] {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const mondays: string[] = [];
  let cursor = mondayOf(new Date(Date.UTC(year, month, 1)));
  if (cursor.getUTCMonth() !== month) cursor = addDays(cursor, 7);
  while (cursor.getUTCMonth() === month && cursor.getUTCFullYear() === year) {
    mondays.push(toISODate(cursor));
    cursor = addDays(cursor, 7);
  }
  return mondays;
}
