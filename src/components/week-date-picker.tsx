"use client";

import { useRouter } from "next/navigation";
import { mondayOf, toISODate } from "@/lib/dates";

export function WeekDatePicker({ currentWeekISO }: { currentWeekISO: string }) {
  const router = useRouter();

  function handleChange(newDateStr: string) {
    if (!newDateStr) return;

    const date = new Date(`${newDateStr}T00:00:00.000Z`);
    if (isNaN(date.getTime())) return;

    // Always navigate to the Monday that owns the selected date.
    router.push(`/employee?week=${toISODate(mondayOf(date))}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 font-medium hidden sm:inline">Jump to:</span>
      <input
        type="date"
        value={currentWeekISO}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-750 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition-colors cursor-pointer"
      />
    </div>
  );
}
