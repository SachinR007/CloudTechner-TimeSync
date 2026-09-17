"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type UtilizationBucket = {
  percentage: number;
  employees: { id: string; name: string }[];
};

function barColor(percentage: number) {
  if (percentage > 100) return "bg-rose-500 hover:bg-rose-600";
  if (percentage === 100) return "bg-emerald-600 hover:bg-emerald-700";
  if (percentage === 0) return "bg-slate-300 hover:bg-slate-400";
  return "bg-sky-600 hover:bg-sky-700";
}

export function CurrentUtilizationChart({ buckets }: { buckets: UtilizationBucket[] }) {
  const [selectedBucket, setSelectedBucket] = useState<UtilizationBucket | null>(null);
  const highestCount = Math.max(...buckets.map((bucket) => bucket.employees.length), 1);

  return (
    <>
      <Card className="border border-gray-200/80 bg-white shadow-sm">
        <CardHeader className="border-b border-gray-100 bg-gray-50/40 px-5 py-4">
          <CardTitle className="text-sm font-bold text-gray-800">Current utilization</CardTitle>
          <p className="text-xs font-normal text-gray-500">Active employees grouped by their current total allocation. Select a bar to view the team.</p>
        </CardHeader>
        <CardContent className="p-5">
          {buckets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No active employees found.</p>
          ) : (
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max items-end gap-3 border-b border-l border-gray-200 px-4 pb-0 pt-4" role="list" aria-label="Employee utilization distribution">
                {buckets.map((bucket) => {
                  const count = bucket.employees.length;
                  const height = Math.max(32, Math.round((count / highestCount) * 160));
                  return (
                    <button
                      key={bucket.percentage}
                      type="button"
                      className="group flex w-14 flex-col items-center gap-2 rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                      onClick={() => setSelectedBucket(bucket)}
                      aria-label={`${count} employee${count === 1 ? "" : "s"} at ${bucket.percentage}% utilization`}
                    >
                      <span className="text-xs font-bold text-gray-700">{count}</span>
                      <span
                        className={`w-10 rounded-t-md transition-colors ${barColor(bucket.percentage)}`}
                        style={{ height }}
                        aria-hidden="true"
                      />
                      <span className="pb-3 text-[11px] font-semibold text-gray-600">{bucket.percentage}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedBucket !== null} onOpenChange={(open) => !open && setSelectedBucket(null)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBucket?.percentage}% utilized</DialogTitle>
            <DialogDescription>
              {selectedBucket?.employees.length ?? 0} active employee{selectedBucket?.employees.length === 1 ? "" : "s"} with this current allocation.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {selectedBucket?.employees.map((employee) => (
              <li key={employee.id} className="px-4 py-3 text-sm font-medium text-gray-800">{employee.name}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
