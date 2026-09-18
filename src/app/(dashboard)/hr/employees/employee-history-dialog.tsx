"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmployeeHistoryDetails, type EmployeeHistoryDetails, type ProjectHistoryEntry } from "./actions";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

const STATUS_VARIANT: Record<ProjectHistoryEntry["status"], "default" | "secondary" | "outline"> = {
  Active: "default",
  Ended: "outline",
  "Project Inactive": "outline",
};

export function EmployeeHistoryDialog({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<EmployeeHistoryDetails | null>(null);

  function load(period?: string) {
    setError(null);
    startTransition(async () => {
      try {
        setDetails(await getEmployeeHistoryDetails(employeeId, period));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load employee history");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && details === null) load();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        className="max-w-full break-words text-left font-semibold text-gray-900 underline-offset-2 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        title={`View ${employeeName}'s timesheet and project history`}
        onClick={() => handleOpenChange(true)}
      >
        {employeeName}
      </button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{details?.employeeName ?? employeeName} &mdash; Employee history</DialogTitle>
        </DialogHeader>

        {isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!isPending && !error && details && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-semibold">Timesheet history</h3><p className="text-xs text-muted-foreground">Weekly submission timeline and status</p></div>
                <select
                  aria-label="Timesheet month"
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={details.selectedPeriod ?? ""}
                  disabled={details.availablePeriods.length === 0 || isPending}
                  onChange={(event) => load(event.target.value)}
                >
                  {details.availablePeriods.length === 0 && <option value="">No submissions</option>}
                  {details.availablePeriods.map((period) => <option key={period} value={period}>{new Date(`${period}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}
                </select>
              </div>
              {details.timesheets.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No timesheet submissions in this month.</p> : (
                <Table><TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
                  {details.timesheets.map((timesheet) => <TableRow key={timesheet.id}><TableCell><div className="font-medium">{formatDisplayDate(timesheet.weekStartDate)}</div><div className="text-xs text-muted-foreground">Submitted: {formatDisplayDateTime(timesheet.submittedAt)}</div></TableCell><TableCell>{timesheet.totalHours} h</TableCell><TableCell><Badge variant={timesheet.status === "APPROVED" ? "default" : timesheet.status === "REJECTED" ? "destructive" : "outline"}>{timesheet.status}</Badge>{timesheet.rejectionComments && <p className="mt-1 text-xs text-rose-600">{timesheet.rejectionComments}</p>}</TableCell></TableRow>)}
                </TableBody></Table>
              )}
            </section>
            <section className="min-w-0 space-y-3"><div><h3 className="font-semibold">Project history</h3><p className="text-xs text-muted-foreground">Derived from recorded timesheet work</p></div>
              {details.projectHistory.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No project history recorded for this employee.</p> : (
                <Table><TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
                  {details.projectHistory.map((history) => <TableRow key={history.id}><TableCell><div className="font-medium">{history.projectName}</div><div className="text-xs text-muted-foreground">{history.clientName} · {history.allocationPercentage}%</div></TableCell><TableCell className="text-sm">{formatDisplayDate(history.startDate)}<br />{history.endDate ? formatDisplayDate(history.endDate) : "Present"}</TableCell><TableCell><Badge variant={STATUS_VARIANT[history.status]}>{history.status}</Badge></TableCell></TableRow>)}
                </TableBody></Table>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
