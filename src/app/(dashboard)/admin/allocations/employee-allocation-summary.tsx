"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/dates";

type Allocation = { id: string; projectName: string; clientName: string; percentage: number; startDate: string; endDate: string | null };

export type EmployeeAllocationSummary = {
  id: string;
  name: string;
  currentAllocations: Allocation[];
  previousAllocations: Allocation[];
  utilization: number;
};

export function EmployeeAllocationSummaryTable({ employees }: { employees: EmployeeAllocationSummary[] }) {
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  return <Card><CardHeader><CardTitle>Employee allocations</CardTitle><p className="text-sm text-muted-foreground">Each employee appears once with their current and previous allocations.</p></CardHeader><CardContent className="overflow-x-auto">
    <table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Current projects</th><th className="px-3 py-3 text-right">Utilization</th><th className="px-3 py-3 text-right">Project history</th></tr></thead><tbody className="divide-y">
      {employees.map((employee) => { const expanded = expandedEmployeeId === employee.id; return <Fragment key={employee.id}><tr className="align-top hover:bg-muted/20"><td className="px-3 py-4 font-semibold text-gray-800">{employee.name}</td><td className="px-3 py-4">{employee.currentAllocations.length === 0 ? <span className="italic text-muted-foreground">No current project</span> : <div className="flex flex-wrap gap-2">{employee.currentAllocations.map((allocation) => <span key={allocation.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{allocation.projectName} · {allocation.percentage}%</span>)}</div>}</td><td className="px-3 py-4 text-right font-semibold text-gray-800">{employee.utilization}%</td><td className="px-3 py-4 text-right"><Button type="button" variant="outline" size="sm" onClick={() => setExpandedEmployeeId(expanded ? null : employee.id)}>{expanded ? <ChevronDown /> : <ChevronRight />}{employee.previousAllocations.length} previous</Button></td></tr>
        {expanded && <tr className="bg-muted/20"><td colSpan={4} className="px-6 py-4">{employee.previousAllocations.length === 0 ? <p className="text-sm text-muted-foreground">No previous project allocations.</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{employee.previousAllocations.map((allocation) => <div key={allocation.id} className="rounded-lg border bg-background px-3 py-2 text-xs"><p className="font-semibold text-gray-800">{allocation.projectName} · {allocation.percentage}%</p><p className="mt-1 text-muted-foreground">{allocation.clientName}</p><p className="mt-1 text-muted-foreground">{formatDisplayDate(allocation.startDate)} – {allocation.endDate ? formatDisplayDate(allocation.endDate) : "Open"}</p></div>)}</div>}</td></tr>}
      </Fragment>; })}
      {employees.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No employees or allocations found.</td></tr>}
    </tbody></table>
  </CardContent></Card>;
}
