"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { EditEmployeeDialog } from "./edit-employee-dialog";
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
  approverOverride: { id: string; name: string } | null;
  reportingManagerId: string | null;
  approverOverrideId: string | null;
  totalAllocation: number;
  currentWeekHours: number;
  projects: string[];
};

type EmployeeOption = { id: string; name: string; role: string };

interface EmployeeListProps {
  initialEmployees: EmployeeItem[];
  allActiveEmployees: EmployeeOption[];
}

const tabs = [
  { id: "ALL", label: "All" },
  { id: "ENGINEERING", label: "Engineering" },
  { id: "DESIGN", label: "Design" },
  { id: "PRODUCT", label: "Product" },
  { id: "ANALYTICS", label: "Analytics" },
  { id: "OPS", label: "Ops" },
] as const;

type EmployeeTab = (typeof tabs)[number]["id"];

function getCategory(title: string | null, role: string) {
  const normalizedTitle = (title || "").toLowerCase();
  const normalizedRole = role.toLowerCase();

  if (normalizedTitle.includes("engineer") || normalizedTitle.includes("developer") || normalizedTitle.includes("tech") || normalizedTitle.includes("code")) return "ENGINEERING";
  if (normalizedTitle.includes("design") || normalizedTitle.includes("ui") || normalizedTitle.includes("ux") || normalizedTitle.includes("creative")) return "DESIGN";
  if (normalizedTitle.includes("product") || normalizedTitle.includes("pm") || normalizedTitle.includes("project manager") || normalizedTitle.includes("scrum")) return "PRODUCT";
  if (normalizedTitle.includes("analyst") || normalizedTitle.includes("analytics") || normalizedTitle.includes("data") || normalizedTitle.includes("bi")) return "ANALYTICS";
  if (normalizedTitle.includes("hr") || normalizedTitle.includes("ops") || normalizedTitle.includes("operation") || normalizedTitle.includes("admin") || normalizedRole.includes("admin")) return "OPS";
  return "ENGINEERING";
}

function initialsFor(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

export function EmployeeList({ initialEmployees, allActiveEmployees }: EmployeeListProps) {
  const [selectedTab, setSelectedTab] = useState<EmployeeTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEmployees = initialEmployees.filter((employee) => {
    if (selectedTab !== "ALL" && getCategory(employee.title, employee.role) !== selectedTab) return false;

    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    const searchableValues = [
      employee.id,
      employee.name,
      employee.email,
      employee.phone || "",
      employee.role,
      employee.title || "",
      employee.reportingManager?.name || "",
      employee.approverOverride?.name || "",
      ...employee.projects,
    ];

    return searchableValues.some((value) => value.toLowerCase().includes(query));
  });

  const getTabCount = (tab: EmployeeTab) => {
    if (tab === "ALL") return initialEmployees.length;
    return initialEmployees.filter((employee) => getCategory(employee.title, employee.role) === tab).length;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${selectedTab === tab.id ? "bg-emerald-850 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {tab.label} ({getTabCount(tab.id)})
            </button>
          ))}
        </div>

        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search employees</span>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search employees..."
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs text-foreground placeholder-gray-400 transition-all focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Employee</TableHead>
                <TableHead>Role and title</TableHead>
                <TableHead>Approval chain</TableHead>
                <TableHead>Current projects</TableHead>
                <TableHead>Allocation</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((employee) => {
                const isOverAllocated = employee.totalAllocation > 100;

                return (
                  <TableRow key={employee.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-emerald-50 text-xs font-bold text-emerald-700">
                          {initialsFor(employee.name)}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/hr/employees/${employee.id}`} className="break-words font-semibold text-gray-900 underline-offset-2 hover:text-emerald-700 hover:underline">
                            {employee.name}
                          </Link>
                          <div className="break-all text-xs text-gray-500">{employee.email}</div>
                          <div className="text-xs text-gray-400">{employee.id}{employee.phone ? ` - ${employee.phone}` : ""}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium text-gray-800">{employee.role}</div>
                      <div className="max-w-[180px] break-words text-xs text-gray-500">{employee.title || "Staff"}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm">
                      <div>Reports to: {employee.reportingManager?.name || "-"}</div>
                      <div className="text-xs text-gray-500">Override: {employee.approverOverride?.name || "-"}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {employee.projects.length > 0 ? employee.projects.map((project) => (
                          <Badge key={project} variant="outline" className="max-w-full whitespace-normal break-words text-xs">
                            {project}
                          </Badge>
                        )) : <span className="text-xs italic text-gray-400">No project allocations</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={isOverAllocated ? "font-semibold text-rose-600" : "font-semibold text-gray-800"}>{employee.totalAllocation}%</span>
                    </TableCell>
                    <TableCell>{employee.currentWeekHours} h</TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge variant="outline" className={employee.canSubmitTimesheet ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-500"}>
                        {employee.canSubmitTimesheet ? "Timesheet enabled" : "Timesheet disabled"}
                      </Badge>
                      <div className="mt-1 text-xs text-gray-500">{employee.isActive ? "Active" : "Inactive"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[270px] flex-wrap justify-end gap-1">
                        <EditEmployeeDialog employee={employee} managers={allActiveEmployees} />
                        <ToggleActiveButton
                          id={employee.id}
                          isActive={employee.canSubmitTimesheet}
                          action={toggleEmployeeTimesheetAccess}
                          activeLabel="Disable TS"
                          inactiveLabel="Enable TS"
                        />
                        <ToggleActiveButton id={employee.id} isActive={employee.isActive} action={toggleEmployeeActive} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-sm font-medium text-muted-foreground">No matching employee profiles found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
