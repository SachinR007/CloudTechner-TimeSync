"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { addDays, formatDisplayDate, toISODate } from "@/lib/dates";

const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseISODate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function WeekDatePicker({ currentDateISO }: { currentDateISO: string }) {
  const router = useRouter();
  const selectedDate = parseISODate(currentDateISO);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1)));

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), 1));
    const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
    const firstCell = addDays(firstOfMonth, -mondayOffset);
    return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
  }, [visibleMonth]);

  function chooseDate(date: Date) {
    setOpen(false);
    router.push(`/employee?date=${toISODate(date)}`);
  }

  function shiftMonth(direction: number) {
    setVisibleMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + direction, 1)));
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <span className="hidden text-xs font-medium text-gray-500 sm:inline">Jump to:</span>
      <button
        type="button"
        onClick={() => {
          setVisibleMonth(new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1)));
          setOpen((value) => !value);
        }}
        className="flex h-8 min-w-32 items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-750 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Jump to timesheet date. Selected ${formatDisplayDate(selectedDate)}`}
      >
        <span>{formatDisplayDate(selectedDate)}</span>
        <CalendarDays className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose a timesheet date" className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1 hover:bg-gray-100" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <span className="text-sm font-semibold text-gray-800">{monthLabel(visibleMonth)}</span>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1 hover:bg-gray-100" aria-label="Next month"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {CALENDAR_WEEKDAYS.map((day) => <span key={day} className="py-1 text-[11px] font-semibold text-gray-500">{day}</span>)}
            {calendarDays.map((date) => {
              const iso = toISODate(date);
              const isSelected = iso === currentDateISO;
              const isOutsideMonth = date.getUTCMonth() !== visibleMonth.getUTCMonth();
              return <button key={iso} type="button" onClick={() => chooseDate(date)} className={`h-8 rounded text-xs font-medium transition-colors ${isSelected ? "bg-emerald-700 text-white" : "hover:bg-emerald-50"} ${isOutsideMonth ? "text-gray-400" : "text-gray-800"}`} aria-label={`Choose ${formatDisplayDate(date)}`}>{date.getUTCDate()}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
