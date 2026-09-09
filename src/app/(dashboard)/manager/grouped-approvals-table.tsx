"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { ReviewButton } from "./review-button";
import type { ReviewLine } from "./review-dialog";
import { formatDisplayDate } from "@/lib/dates";

export type ApprovalRowData = {
  approvalId: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  weekStartDate: string;
  projectHours: number;
  dates: string[];
  lines: ReviewLine[];
  submitComments: string;
};

interface GroupedApprovalsTableProps {
  approvals: ApprovalRowData[];
}

export function GroupedApprovalsTable({ approvals }: GroupedApprovalsTableProps) {
  // State for which employee groups are expanded
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  // Group approvals by employeeId
  const employeeGroups = React.useMemo(() => {
    const map = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        items: ApprovalRowData[];
        totalHours: number;
        projectNames: string[];
      }
    >();

    for (const item of approvals) {
      if (!map.has(item.employeeId)) {
        map.set(item.employeeId, {
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          items: [],
          totalHours: 0,
          projectNames: [],
        });
      }
      const group = map.get(item.employeeId)!;
      group.items.push(item);
      group.totalHours += item.projectHours;
      if (!group.projectNames.includes(item.projectName)) {
        group.projectNames.push(item.projectName);
      }
    }

    return Array.from(map.values());
  }, [approvals]);

  const toggleEmployee = (employeeId: string) => {
    setExpanded((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-gray-50/80 text-gray-500 border-b border-gray-200">
          <tr>
            <th className="py-3 px-3 w-8"></th>
            <th className="py-3 px-4 font-semibold text-gray-600">Employee</th>
            <th className="py-3 px-4 font-semibold text-gray-600">Project(s)</th>
            <th className="py-3 px-4 font-semibold text-gray-600">Timesheets</th>
            <th className="py-3 px-4 font-semibold text-gray-600">Total Hours</th>
            <th className="py-3 px-4 text-right font-semibold text-gray-600">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-150">
          {employeeGroups.map((group) => {
            const isExpanded = expanded[group.employeeId] ?? true;
            const isMulti = group.items.length > 1;

            return (
              <React.Fragment key={group.employeeId}>
                {/* Employee Header Row */}
                <tr
                  onClick={() => toggleEmployee(group.employeeId)}
                  className="bg-white hover:bg-gray-50/80 cursor-pointer transition-colors font-medium border-b border-gray-100"
                >
                  <td className="py-3 px-3 text-gray-400">
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isExpanded ? "rotate-90 text-emerald-600" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                  <td className="py-3 px-4 font-bold text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="hover:text-emerald-700 transition-colors">{group.employeeName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    <div className="flex flex-wrap gap-1">
                      {group.projectNames.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px] bg-gray-50 text-gray-700 border-gray-200 font-medium">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge className={`text-xs font-semibold ${isMulti ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                      {group.items.length} {group.items.length === 1 ? "timesheet" : "timesheets"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 font-bold text-gray-800">
                    {group.totalHours} hrs
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-semibold text-emerald-700">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:underline focus:outline-none"
                    >
                      {isExpanded ? "Hide dropdown ▲" : "View dropdown ▼"}
                    </button>
                  </td>
                </tr>

                {/* Dropdown Items (Expanded View) */}
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="p-0 bg-emerald-50/20">
                      <div className="px-5 py-3 border-b border-emerald-100/60">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-850 mb-2 flex items-center justify-between">
                          <span>Pending Submissions for {group.employeeName} ({group.items.length})</span>
                          <span className="text-[10px] text-gray-400 normal-case font-medium">Click Review to inspect tasks & approve</span>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                              <tr>
                                <th className="py-2.5 px-4 text-left">Project</th>
                                <th className="py-2.5 px-4 text-left">Week Start Date</th>
                                <th className="py-2.5 px-4 text-left">Project Hours</th>
                                <th className="py-2.5 px-4 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.items.map((item) => (
                                <tr key={item.approvalId} className="hover:bg-emerald-50/30 transition-colors">
                                  <td className="py-2.5 px-4 font-semibold text-gray-800">
                                    {item.projectName}
                                  </td>
                                  <td className="py-2.5 px-4 font-medium text-gray-600">
                                    {formatDisplayDate(item.weekStartDate)}
                                  </td>
                                  <td className="py-2.5 px-4 font-bold text-gray-800">
                                    {item.projectHours} hrs
                                  </td>
                                  <td className="py-2.5 px-4 text-right">
                                    <ReviewButton
                                      approvalId={item.approvalId}
                                      employeeName={item.employeeName}
                                      projectName={item.projectName}
                                      dates={item.dates}
                                      lines={item.lines}
                                      submitComments={item.submitComments}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {employeeGroups.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">
                Nothing pending review.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
