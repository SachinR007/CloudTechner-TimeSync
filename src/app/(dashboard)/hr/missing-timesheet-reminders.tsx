"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { sendTimesheetReminders } from "./actions";
import { captureDashboardScroll, restoreDashboardScroll } from "@/lib/dashboard-scroll";

export type ReminderEmployee = { id: string; name: string; role: string; totalHours: string; statusLabel: string; canNotify: boolean; weekStartISO: string };

export function MissingTimesheetReminders({ rows }: { rows: ReminderEmployee[] }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const targets = rows.filter((row) => row.canNotify);
  const selectedIds = [...selected];
  const allTargetsSelected = targets.length > 0 && targets.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((prior) => { const next = new Set(prior); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function toggleAll() {
    setSelected((prior) => { const next = new Set(prior); targets.forEach((row) => (allTargetsSelected ? next.delete(row.id) : next.add(row.id))); return next; });
  }

  function notify(ids: string[]) {
    if (!ids.length) return;
    const scroll = captureDashboardScroll();
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await sendTimesheetReminders(ids, rows.find((row) => row.id === ids[0])!.weekStartISO);
        setSelected(new Set());
        setMessage(`${result.notified} employee${result.notified === 1 ? " was" : "s were"} notified${result.skipped ? `; ${result.skipped} already submitted.` : "."}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not send reminders.");
      } finally {
        restoreDashboardScroll(scroll);
      }
    });
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-gray-400">Reminders include the full Monday–Sunday week and appear in the recipient&apos;s notification bell.</p>
      {targets.length > 0 && <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input aria-label="Select all employees needing a reminder" type="checkbox" checked={allTargetsSelected} onChange={toggleAll} disabled={pending} className="size-4 cursor-pointer rounded border-gray-300 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed" />Select all</label>
        <Button size="sm" disabled={pending || selectedIds.length === 0} onClick={() => notify(selectedIds)}>{pending ? "Notifying…" : `Notify selected (${selectedIds.length})`}</Button>
      </div>}
    </div>
    {message && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p>}
    <table className="w-full text-sm"><thead className="bg-gray-50/45"><tr className="border-b border-gray-100"><th className="w-14 px-3" /><th className="w-[35%] py-3 pl-2 text-left font-semibold text-gray-500">Employee</th><th className="w-[20%] text-left font-semibold text-gray-500">System Role</th><th className="w-[15%] text-center font-semibold text-gray-500">Total Hours</th><th className="w-[15%] text-center font-semibold text-gray-500">Status</th><th className="w-[15%] pr-6 text-right font-semibold text-gray-500">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50/30"><td className="w-14 px-3 py-3.5 text-center align-middle"><input aria-label={`Select ${row.name}`} type="checkbox" disabled={!row.canNotify || pending} checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="size-4 cursor-pointer rounded border-gray-300 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed" /></td><td className="py-3.5 pl-2 font-semibold text-gray-800">{row.name}<span className="mt-0.5 block text-[10px] font-normal text-gray-400">{row.id}</span></td><td className="py-3.5 text-sm font-medium text-gray-600">{row.role}</td><td className="py-3.5 text-center font-bold text-gray-700">{row.totalHours}</td><td className="py-3.5 text-center"><span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{row.statusLabel}</span></td><td className="py-3.5 pr-6 text-right">{row.canNotify && <Button variant="outline" size="sm" disabled={pending} onClick={() => notify([row.id])}>Notify</Button>}</td></tr>)}</tbody></table>
  </div>;
}
