"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/dates";

type Allocation = {
  id: string;
  projectName: string;
  clientName: string;
  percentage: number;
  startDate: string;
  endDate: string | null;
};

export type EmployeeAllocationSummary = {
  id: string;
  name: string;
  currentAllocations: Allocation[];
  previousAllocations: Allocation[];
  utilization: number;
};

function AllocationCard({ allocation }: { allocation: Allocation }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900" title={allocation.projectName}>{allocation.projectName}</p>
          <p className="truncate text-xs text-muted-foreground" title={allocation.clientName}>{allocation.clientName}</p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
          {allocation.percentage}%
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
        <span>{formatDisplayDate(allocation.startDate)} to {allocation.endDate ? formatDisplayDate(allocation.endDate) : "Open"}</span>
      </div>
    </div>
  );
}

export function EmployeeAllocationSummaryTable({ employees }: { employees: EmployeeAllocationSummary[] }) {
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee allocations</CardTitle>
        <p className="text-sm text-muted-foreground">Each employee appears once. Review active utilization and expand a row for previous project assignments.</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Employee</th>
              <th className="px-3 py-3">Active allocations</th>
              <th className="px-3 py-3 text-right">Utilization</th>
              <th className="px-3 py-3 text-right">History</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.map((employee) => {
              const expanded = expandedEmployeeId === employee.id;
              return (
                <Fragment key={employee.id}>
                  <tr className="align-top hover:bg-muted/20">
                    <td className="px-3 py-4 font-semibold text-gray-800">{employee.name}</td>
                    <td className="px-3 py-3">
                      {employee.currentAllocations.length === 0 ? (
                        <span className="italic text-muted-foreground">No active project</span>
                      ) : (
                        <div className="grid gap-2 lg:grid-cols-2">
                          {employee.currentAllocations.map((allocation) => <AllocationCard key={allocation.id} allocation={allocation} />)}
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-4 text-right font-bold ${employee.utilization > 100 ? "text-rose-600" : "text-gray-800"}`}>
                      {employee.utilization}%
                    </td>
                    <td className="px-3 py-4 text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => setExpandedEmployeeId(expanded ? null : employee.id)}>
                        {expanded ? <ChevronDown /> : <ChevronRight />}
                        {expanded ? "Close" : "View"}
                      </Button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={4} className="px-6 py-4">
                        <div className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-800"><ChevronRight className="size-4" /> Previous allocations</div>
                        {employee.previousAllocations.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No previous project allocations.</p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {employee.previousAllocations.map((allocation) => <AllocationCard key={allocation.id} allocation={allocation} />)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {employees.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No employees or allocations found.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
