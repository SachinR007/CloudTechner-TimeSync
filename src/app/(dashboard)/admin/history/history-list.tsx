"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

type LogItem = {
  id: string;
  action: string; // SUBMITTED | APPROVED | REJECTED | RESUBMITTED | WITHDRAWN
  actorName: string;
  employeeName: string;
  weekStart: string;
  createdAt: Date;
  comments: string | null;
  totalHours: number;
  projects: string[];
};

interface HistoryListProps {
  initialLogs: LogItem[];
}

export function HistoryList({ initialLogs }: HistoryListProps) {
  const [selectedTab, setSelectedTab] = useState<"ALL" | "APPROVED" | "REJECTED" | "PENDING" | "RESUBMITTED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Format date helper
  const formatDateStr = (date: Date) => {
    return formatDisplayDateTime(date);
  };

  // Human readable time ago helper
  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Filter logs based on selectedTab and searchQuery
  const filteredLogs = initialLogs.filter((log) => {
    // 1. Filter by Tab
    if (selectedTab !== "ALL") {
      if (selectedTab === "APPROVED" && log.action !== "APPROVED") return false;
      if (selectedTab === "REJECTED" && log.action !== "REJECTED") return false;
      if (selectedTab === "PENDING" && log.action !== "SUBMITTED") return false;
      if (selectedTab === "RESUBMITTED" && log.action !== "RESUBMITTED") return false;
    }

    // 2. Filter by Search Query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      const matchActor = log.actorName.toLowerCase().includes(query);
      const matchEmployee = log.employeeName.toLowerCase().includes(query);
      const matchProjects = log.projects.some((p) => p.toLowerCase().includes(query));
      const matchAction = log.action.toLowerCase().includes(query);
      if (!matchActor && !matchEmployee && !matchProjects && !matchAction) return false;
    }

    return true;
  });

  // Count helper for tabs
  const getTabCount = (tab: "ALL" | "APPROVED" | "REJECTED" | "PENDING" | "RESUBMITTED") => {
    if (tab === "ALL") return initialLogs.length;
    if (tab === "APPROVED") return initialLogs.filter((l) => l.action === "APPROVED").length;
    if (tab === "REJECTED") return initialLogs.filter((l) => l.action === "REJECTED").length;
    if (tab === "PENDING") return initialLogs.filter((l) => l.action === "SUBMITTED").length;
    if (tab === "RESUBMITTED") return initialLogs.filter((l) => l.action === "RESUBMITTED").length;
    return 0;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Tabs Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {(["ALL", "APPROVED", "REJECTED", "PENDING", "RESUBMITTED"] as const).map((tab) => {
            const isActive = selectedTab === tab;
            const count = getTabCount(tab);
            return (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tab.charAt(0) + tab.slice(1).toLowerCase()} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
            </svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by employee or project..."
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs text-foreground placeholder-gray-400 focus:border-emerald-500 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* History Items List */}
      <Card className="border border-gray-200/80 shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0 divide-y divide-gray-150">
          {filteredLogs.map((log) => {
            // Colors based on actions
            const isApprove = log.action === "APPROVED";
            const isReject = log.action === "REJECTED";
            const isSubmit = log.action === "SUBMITTED" || log.action === "RESUBMITTED";
            
            const dotColor = isApprove
              ? "bg-emerald-500"
              : isReject
              ? "bg-rose-500"
              : isSubmit
              ? "bg-amber-500"
              : "bg-gray-400";

            const badgeVariant = isApprove
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : isReject
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-amber-50 text-amber-800 border-amber-200";

            // Structured action message
            let actionText = "";
            let subText = "";

            if (isApprove) {
              actionText = `${log.actorName} approved ${log.employeeName}'s Week of ${formatDisplayDate(log.weekStart)} timesheet`;
              subText = `${log.totalHours} h logged${
                log.projects.length > 0 ? ` across ${log.projects.join(" and ")}` : ""
              }. Approved without changes.`;
            } else if (isReject) {
              actionText = `${log.actorName} rejected ${log.employeeName}'s Week of ${formatDisplayDate(log.weekStart)} timesheet`;
              subText = log.comments
                ? `Comment: "${log.comments}" — ${log.employeeName} was notified via email.`
                : `Rejected without comments.`;
            } else if (log.action === "WITHDRAWN") {
              actionText = `${log.employeeName} withdrew their Week of ${formatDisplayDate(log.weekStart)} timesheet`;
              subText = `Timesheet pulled back to draft state by the employee.`;
            } else {
              actionText = `${log.employeeName} submitted Week of ${formatDisplayDate(log.weekStart)} timesheet`;
              subText = `${log.totalHours} h logged. Waiting on approval from ${log.actorName}.`;
            }

            return (
              <div key={log.id} className="p-5 flex items-start justify-between gap-6 hover:bg-gray-50/40 transition-colors">
                <div className="flex gap-4">
                  {/* Status dot */}
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-bold text-gray-800 leading-tight">
                      {actionText}
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">
                      {subText}
                    </p>
                    {/* Bottom Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {log.projects.map((proj) => (
                        <Badge key={proj} variant="outline" className="text-[10px] py-0.5 px-2 bg-gray-50 text-gray-600 border-gray-200 font-medium">
                          {proj}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-gray-50 text-gray-500 border-gray-200 font-medium">
                        Week {log.weekStart.slice(5, 7)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] py-0.5 px-2 border font-bold ${badgeVariant}`}>
                        {log.action}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Right side timestamp */}
                <div className="text-right shrink-0 flex flex-col items-end gap-0.5 select-none">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {timeAgo(log.createdAt)}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {formatDateStr(log.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}

          {filteredLogs.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm font-medium">
              No matching timesheet history records found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
