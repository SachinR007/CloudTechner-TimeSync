"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditEmployeeDialog } from "./edit-employee-dialog";
import { EmployeeHistoryDialog } from "./employee-history-dialog";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { toggleEmployeeActive, toggleEmployeeTimesheetAccess } from "./actions";

type EmployeeItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  title: string | null;
  isActive: boolean;
  canSubmitTimesheet: boolean;
  reportingManager: { id: string; name: string } | null;
  reportingManagerId: string | null;
  approverOverrideId: string | null;
  totalAllocation: number;
  currentWeekHours: number;
  projects: string[];
};

interface EmployeeListProps {
  initialEmployees: EmployeeItem[];
  allActiveEmployees: any[];
}

export function EmployeeList({ initialEmployees, allActiveEmployees }: EmployeeListProps) {
  const [selectedTab, setSelectedTab] = useState<"ALL" | "ENGINEERING" | "DESIGN" | "PRODUCT" | "ANALYTICS" | "OPS">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Categorize employee based on title/role
  const getCategory = (title: string | null, role: string) => {
    const t = (title || "").toLowerCase();
    const r = role.toLowerCase();
    if (t.includes("engineer") || t.includes("developer") || t.includes("tech") || t.includes("code")) {
      return "ENGINEERING";
    }
    if (t.includes("design") || t.includes("ui") || t.includes("ux") || t.includes("creative")) {
      return "DESIGN";
    }
    if (t.includes("product") || t.includes("pm") || t.includes("project manager") || t.includes("scrum")) {
      return "PRODUCT";
    }
    if (t.includes("analyst") || t.includes("analytics") || t.includes("data") || t.includes("bi")) {
      return "ANALYTICS";
    }
    if (t.includes("hr") || t.includes("ops") || t.includes("operation") || t.includes("admin") || r.includes("admin")) {
      return "OPS";
    }
    return "ENGINEERING"; // Default fallback
  };

  // Filter employees
  const filteredEmployees = initialEmployees.filter((emp) => {
    // 1. Filter by Tab
    if (selectedTab !== "ALL") {
      const cat = getCategory(emp.title, emp.role);
      if (cat !== selectedTab) return false;
    }

    // 2. Filter by Search Query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      const matchName = emp.name.toLowerCase().includes(query);
      const matchEmail = emp.email.toLowerCase().includes(query);
      const matchTitle = (emp.title || "").toLowerCase().includes(query);
      const matchProjects = emp.projects.some((p) => p.toLowerCase().includes(query));
      if (!matchName && !matchEmail && !matchTitle && !matchProjects) return false;
    }

    return true;
  });

  // Count helper for tabs
  const getTabCount = (tab: typeof selectedTab) => {
    if (tab === "ALL") return initialEmployees.length;
    return initialEmployees.filter((emp) => getCategory(emp.title, emp.role) === tab).length;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search and Tabs Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: "ALL", label: "All" },
            { id: "ENGINEERING", label: "Engineering" },
            { id: "DESIGN", label: "Design" },
            { id: "PRODUCT", label: "Product" },
            { id: "ANALYTICS", label: "Analytics" },
            { id: "OPS", label: "Ops" },
          ] as const).map((tab) => {
            const isActive = selectedTab === tab.id;
            const count = getTabCount(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-850 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tab.label} ({count})
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
            placeholder="Search employees..."
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs text-foreground placeholder-gray-400 focus:border-emerald-500 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.map((emp) => {
          const initials = emp.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);

          const isOverAllocated = emp.totalAllocation > 100;

          // Color arrays for initials avatar background
          const bgColors = [
            "bg-blue-600/10 text-blue-700 border-blue-500/20",
            "bg-emerald-600/10 text-emerald-700 border-emerald-500/20",
            "bg-indigo-600/10 text-indigo-700 border-indigo-500/20",
            "bg-purple-600/10 text-purple-700 border-purple-500/20",
            "bg-amber-600/10 text-amber-700 border-amber-500/20",
          ];
          // Simple hash to assign color based on initials
          const hash = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % bgColors.length;
          const avatarColorClass = bgColors[hash];

          return (
            <Card
              key={emp.id}
              className={`border transition-all duration-200 bg-white hover:shadow-md ${
                isOverAllocated
                  ? "border-rose-300 ring-1 ring-rose-200"
                  : "border-gray-200/80 shadow-xs"
              }`}
            >
              <CardContent className="p-5 flex flex-col gap-4">
                {/* Top Row: Info & Avatar */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${avatarColorClass}`}
                    >
                      {initials}
                    </div>
                  <div className="flex flex-col min-w-0">
                      <h3 className="text-sm font-bold text-gray-800 truncate leading-snug">
                        {emp.name}
                      </h3>
                      <p className="text-[10px] text-emerald-800 font-bold truncate mt-0.5 uppercase tracking-wider">
                        {emp.title || "Staff"}
                      </p>
                      <Badge
                        variant="outline"
                        className={`mt-1 w-fit text-[9px] py-0.5 px-1.5 ${
                          emp.canSubmitTimesheet
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                        }`}
                      >
                        {emp.canSubmitTimesheet ? "Timesheet enabled" : "Timesheet disabled"}
                      </Badge>
                    </div>
                  </div>
                  {/* Actions buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <EmployeeHistoryDialog employeeId={emp.id} employeeName={emp.name} />
                    <EditEmployeeDialog employee={emp} managers={allActiveEmployees} />
                    <ToggleActiveButton
                      id={emp.id}
                      isActive={emp.canSubmitTimesheet}
                      action={toggleEmployeeTimesheetAccess}
                      activeLabel="Disable TS"
                      inactiveLabel="Enable TS"
                    />
                    <ToggleActiveButton id={emp.id} isActive={emp.isActive} action={toggleEmployeeActive} />
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="flex flex-col gap-2 bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-medium">Allocation</span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        isOverAllocated ? "text-rose-600" : "text-gray-800"
                      }`}
                    >
                      {emp.totalAllocation}%
                      {isOverAllocated && <span className="text-[10px]">⚠️</span>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-medium">Hours (W27)</span>
                    <span className="font-bold text-gray-800">{emp.currentWeekHours} h</span>
                  </div>
                </div>

                {/* Bottom Row: Allocated Projects */}
                <div className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
                  {emp.projects.map((proj) => (
                    <Badge
                      key={proj}
                      variant="outline"
                      className="text-[9px] py-0.5 px-2 bg-gray-100/50 text-gray-500 border-gray-200/80 font-semibold"
                    >
                      {proj}
                    </Badge>
                  ))}
                  {emp.projects.length === 0 && (
                    <span className="text-[10px] text-gray-400 italic">No project allocations</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredEmployees.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground text-sm font-medium">
            No matching employee profiles found.
          </div>
        )}
      </div>
    </div>
  );
}
