import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { allocationStatusFor } from "@/lib/allocation";
import { employeeOptionSelect, employeeSafeSelect } from "@/lib/safe-selects";
import { allocationOverlapsRange, normalizeReportDate } from "@/lib/management-reporting";
import { CurrentUtilizationChart, type UtilizationBucket } from "@/components/admin/current-utilization-chart";
import { EmployeeAllocationSummaryTable, type EmployeeAllocationSummary } from "./employee-allocation-summary";
import { AllocationReportExport, type AllocationReportExportRow } from "./allocation-report-export";
import { UtilizationReportFilters } from "./utilization-report-filters";

type ReportSearchParams = { employeeId?: string; clientId?: string; projectId?: string; startDate?: string; endDate?: string };

export default async function AllocationsPage({ searchParams }: { searchParams: Promise<ReportSearchParams> }) {
  const params = await searchParams;
  const startDate = normalizeReportDate(params.startDate);
  const endDate = normalizeReportDate(params.endDate);
  const [allocations, employees, clients, projects, timesheets, missedNotifications] = await Promise.all([
    prisma.projectAllocation.findMany({ include: { employee: { select: employeeSafeSelect }, project: { include: { client: { select: { id: true, name: true } } } } } }),
    prisma.employee.findMany({ where: { isActive: true }, select: employeeOptionSelect, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
    prisma.timesheetHeader.findMany({
      where: { employee: { isActive: true }, ...(startDate ? { weekStartDate: { gte: new Date(`${startDate}T00:00:00.000Z`) } } : {}), ...(endDate ? { weekStartDate: { lte: new Date(`${endDate}T00:00:00.000Z`) } } : {}) },
      select: { employeeId: true, totalHours: true },
    }),
    prisma.notification.findMany({
      where: { kind: "MISSED_TIMESHEET", subjectEmployeeId: { not: null }, ...(startDate ? { createdAt: { gte: new Date(`${startDate}T00:00:00.000Z`) } } : {}), ...(endDate ? { createdAt: { lte: new Date(`${endDate}T23:59:59.999Z`) } } : {}) },
      select: { subjectEmployeeId: true },
    }),
  ]);

  const employeeId = employees.some((employee) => employee.id === params.employeeId) ? params.employeeId : undefined;
  const clientId = clients.some((client) => client.id === params.clientId) ? params.clientId : undefined;
  const projectId = projects.some((project) => project.id === params.projectId) ? params.projectId : undefined;
  const filteredAllocations = allocations.filter((allocation) =>
    (!employeeId || allocation.employeeId === employeeId) && (!clientId || allocation.project.client.id === clientId) && (!projectId || allocation.projectId === projectId) && allocationOverlapsRange(allocation.startDate, allocation.endDate, startDate, endDate)
  );

  const hoursByEmployee = new Map<string, number>();
  for (const timesheet of timesheets) hoursByEmployee.set(timesheet.employeeId, (hoursByEmployee.get(timesheet.employeeId) ?? 0) + Number(timesheet.totalHours ?? 0));
  const missedByEmployee = new Map<string, number>();
  for (const notification of missedNotifications) if (notification.subjectEmployeeId) missedByEmployee.set(notification.subjectEmployeeId, (missedByEmployee.get(notification.subjectEmployeeId) ?? 0) + 1);

  const selectedEmployees = employeeId ? employees.filter((employee) => employee.id === employeeId) : employees;
  const utilizationByEmployee = new Map(selectedEmployees.map((employee) => [employee.id, { id: employee.id, name: employee.name, percentage: 0 }]));
  for (const allocation of filteredAllocations) {
    if (allocationStatusFor(allocation.startDate, allocation.endDate, allocation.employee.isActive, allocation.project.isActive) !== "Active") continue;
    const employee = utilizationByEmployee.get(allocation.employee.id);
    if (employee) employee.percentage += allocation.allocationPercentage;
  }
  const bucketsByPercentage = new Map<number, { id: string; name: string }[]>();
  for (const employee of utilizationByEmployee.values()) {
    const bucket = bucketsByPercentage.get(employee.percentage) ?? [];
    bucket.push({ id: employee.id, name: employee.name });
    bucketsByPercentage.set(employee.percentage, bucket);
  }
  const utilizationBuckets: UtilizationBucket[] = Array.from(bucketsByPercentage.entries()).map(([percentage, bucketEmployees]) => ({ percentage, employees: bucketEmployees.sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => b.percentage - a.percentage);

  const summariesByEmployee = new Map<string, EmployeeAllocationSummary>();
  for (const employee of selectedEmployees) summariesByEmployee.set(employee.id, { id: employee.id, name: employee.name, currentAllocations: [], previousAllocations: [], utilization: 0, workingHours: hoursByEmployee.get(employee.id) ?? 0, missedTimesheets: missedByEmployee.get(employee.id) ?? 0 });
  for (const allocation of filteredAllocations) {
    const summary = summariesByEmployee.get(allocation.employee.id);
    if (!summary) continue;
    const allocationRow = { id: allocation.id, projectName: allocation.project.name, clientName: allocation.project.client.name, percentage: allocation.allocationPercentage, startDate: allocation.startDate.toISOString(), endDate: allocation.endDate?.toISOString() ?? null };
    if (allocationStatusFor(allocation.startDate, allocation.endDate, allocation.employee.isActive, allocation.project.isActive) === "Active") { summary.currentAllocations.push(allocationRow); summary.utilization += allocation.allocationPercentage; } else summary.previousAllocations.push(allocationRow);
  }
  const employeeSummaries = Array.from(summariesByEmployee.values()).map((employee) => ({ ...employee, currentAllocations: employee.currentAllocations.sort((a, b) => a.projectName.localeCompare(b.projectName)), previousAllocations: employee.previousAllocations.sort((a, b) => b.startDate.localeCompare(a.startDate)) })).sort((a, b) => b.utilization - a.utilization || a.name.localeCompare(b.name));
  const exportRows: AllocationReportExportRow[] = filteredAllocations.map((allocation) => ({ Employee: allocation.employee.name, Client: allocation.project.client.name, Project: allocation.project.name, "Allocation %": allocation.allocationPercentage, "Working hours": hoursByEmployee.get(allocation.employeeId) ?? 0, "Missed timesheet reminders": missedByEmployee.get(allocation.employeeId) ?? 0, "Start date": allocation.startDate.toISOString().slice(0, 10), "End date": allocation.endDate?.toISOString().slice(0, 10) ?? "Open", Status: allocationStatusFor(allocation.startDate, allocation.endDate, allocation.employee.isActive, allocation.project.isActive) })).sort((a, b) => a.Employee.localeCompare(b.Employee) || a.Project.localeCompare(b.Project));

  return <div className="flex flex-col gap-6"><Card><CardHeader className="flex flex-row items-center justify-between gap-4"><div><CardTitle>Utilization report</CardTitle><p className="mt-1 text-sm text-muted-foreground">Read-only reporting for allocation, working hours, and missed-timesheet reminders. Manage teams from Projects.</p></div><AllocationReportExport rows={exportRows} /></CardHeader></Card><UtilizationReportFilters employees={employees} clients={clients} projects={projects} values={{ employeeId, clientId, projectId, startDate, endDate }} /><p className="text-xs text-muted-foreground">Payroll penalization is not calculated by CT Orbit. This report shows the underlying allocation and timesheet evidence only.</p><CurrentUtilizationChart buckets={utilizationBuckets} /><EmployeeAllocationSummaryTable employees={employeeSummaries} /></div>;
}
