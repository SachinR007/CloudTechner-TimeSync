"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";
import type { ProjectHistoryStint } from "@/lib/project-history";

type Timesheet = {
  id: string;
  weekStartDate: string;
  totalHours: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionComments: string | null;
};

const statusVariant = { DRAFT: "secondary", SUBMITTED: "outline", APPROVED: "default", REJECTED: "destructive" } as const;

function periodLabel(period: string) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${period}-01T00:00:00Z`));
}

export function EmployeeDetailsTabs({ employeeId, periods, selectedPeriod, timesheets, projectHistory }: {
  employeeId: string;
  periods: string[];
  selectedPeriod: string | null;
  timesheets: Timesheet[];
  projectHistory: ProjectHistoryStint[];
}) {
  const [tab, setTab] = useState<"timesheets" | "projects">("timesheets");
  const router = useRouter();

  return <div className="space-y-5">
    <div role="tablist" aria-label="Employee history" className="flex gap-1 border-b">
      <button type="button" role="tab" aria-selected={tab === "timesheets"} onClick={() => setTab("timesheets")} className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab === "timesheets" ? "border-emerald-600 text-emerald-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Timesheet history</button>
      <button type="button" role="tab" aria-selected={tab === "projects"} onClick={() => setTab("projects")} className={`border-b-2 px-4 py-2 text-sm font-semibold ${tab === "projects" ? "border-emerald-600 text-emerald-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Project history</button>
    </div>

    {tab === "timesheets" && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Timesheet submission timeline</h2><p className="text-sm text-muted-foreground">Weekly hours, submission dates, and approval status.</p></div>
        <select aria-label="Timesheet month" className="rounded-md border bg-background px-3 py-2 text-sm" value={selectedPeriod ?? ""} disabled={periods.length === 0} onChange={(event) => router.push(`/hr/employees/${employeeId}?period=${encodeURIComponent(event.target.value)}`)}>
          {periods.length === 0 && <option value="">No submissions</option>}
          {periods.map((period) => <option key={period} value={period}>{periodLabel(period)}</option>)}
        </select>
      </div>
      {timesheets.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No timesheet submissions for this month.</p> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Week</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y">{timesheets.map((timesheet) => <tr key={timesheet.id}><td className="px-4 py-3 font-medium">{formatDisplayDate(timesheet.weekStartDate)}</td><td className="px-4 py-3">{timesheet.totalHours} h</td><td className="px-4 py-3 text-muted-foreground">{formatDisplayDateTime(timesheet.submittedAt)}</td><td className="px-4 py-3"><Badge variant={statusVariant[timesheet.status]}>{timesheet.status}</Badge>{timesheet.rejectionComments && <p className="mt-1 text-xs text-destructive">{timesheet.rejectionComments}</p>}</td></tr>)}</tbody></table></div>}
    </section>}

    {tab === "projects" && <section className="space-y-4"><div><h2 className="font-semibold">Project history</h2><p className="text-sm text-muted-foreground">Projects derived from recorded timesheet work.</p></div>
      {projectHistory.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No project history recorded for this employee.</p> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Allocation</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y">{projectHistory.map((project) => <tr key={project.id}><td className="px-4 py-3"><p className="font-medium">{project.projectName}</p><p className="text-xs text-muted-foreground">{project.clientName}</p></td><td className="px-4 py-3">{project.allocationPercentage}%</td><td className="px-4 py-3">{formatDisplayDate(project.startDate)} — {project.endDate ? formatDisplayDate(project.endDate) : "Present"}</td><td className="px-4 py-3"><Badge variant={project.status === "Active" ? "default" : "outline"}>{project.status}</Badge></td></tr>)}</tbody></table></div>}
    </section>}
  </div>;
}
