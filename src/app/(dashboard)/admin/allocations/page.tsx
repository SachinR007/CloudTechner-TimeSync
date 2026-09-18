import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { allocationStatusFor, todayUTC } from "@/lib/allocation";
import { employeeOptionSelect, employeeSafeSelect } from "@/lib/safe-selects";
import { CurrentUtilizationChart, type UtilizationBucket } from "@/components/admin/current-utilization-chart";
import { EmployeeAllocationSummaryTable, type EmployeeAllocationSummary } from "./employee-allocation-summary";
import { AllocationReportExport, type AllocationReportExportRow } from "./allocation-report-export";

export default async function AllocationsPage() {
  const today = todayUTC();
  const [allocations, employees, activeAllocations] = await Promise.all([
    prisma.projectAllocation.findMany({
      include: {
        employee: { select: employeeSafeSelect },
        project: { include: { client: { select: { name: true } } } },
      },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: employeeOptionSelect,
      orderBy: { name: "asc" },
    }),
    prisma.projectAllocation.findMany({
      where: {
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gt: today } }],
        project: { isActive: true },
        employee: { isActive: true },
      },
      select: {
        allocationPercentage: true,
        employee: { select: employeeOptionSelect },
      },
    }),
  ]);

  const utilizationByEmployee = new Map(
    employees.map((employee) => [employee.id, { id: employee.id, name: employee.name, percentage: 0 }])
  );
  for (const allocation of activeAllocations) {
    const employee = utilizationByEmployee.get(allocation.employee.id);
    if (employee) employee.percentage += allocation.allocationPercentage;
  }
  const bucketsByPercentage = new Map<number, { id: string; name: string }[]>();
  for (const employee of utilizationByEmployee.values()) {
    const bucket = bucketsByPercentage.get(employee.percentage) ?? [];
    bucket.push({ id: employee.id, name: employee.name });
    bucketsByPercentage.set(employee.percentage, bucket);
  }
  const utilizationBuckets: UtilizationBucket[] = Array.from(bucketsByPercentage.entries())
    .map(([percentage, bucketEmployees]) => ({
      percentage,
      employees: bucketEmployees.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const summariesByEmployee = new Map<string, EmployeeAllocationSummary>();
  for (const allocation of allocations) {
    const summary = summariesByEmployee.get(allocation.employee.id) ?? {
      id: allocation.employee.id,
      name: allocation.employee.name,
      currentAllocations: [],
      previousAllocations: [],
      utilization: 0,
    };
    const allocationRow = {
      id: allocation.id,
      projectName: allocation.project.name,
      clientName: allocation.project.client.name,
      percentage: allocation.allocationPercentage,
      startDate: allocation.startDate.toISOString(),
      endDate: allocation.endDate?.toISOString() ?? null,
    };
    if (allocationStatusFor(allocation.startDate, allocation.endDate, allocation.employee.isActive, allocation.project.isActive) === "Active") {
      summary.currentAllocations.push(allocationRow);
      summary.utilization += allocation.allocationPercentage;
    } else {
      summary.previousAllocations.push(allocationRow);
    }
    summariesByEmployee.set(allocation.employee.id, summary);
  }
  for (const employee of employees) {
    if (!summariesByEmployee.has(employee.id)) {
      summariesByEmployee.set(employee.id, {
        id: employee.id,
        name: employee.name,
        currentAllocations: [],
        previousAllocations: [],
        utilization: 0,
      });
    }
  }
  const employeeSummaries = Array.from(summariesByEmployee.values())
    .map((employee) => ({
      ...employee,
      currentAllocations: employee.currentAllocations.sort((a, b) => a.projectName.localeCompare(b.projectName)),
      previousAllocations: employee.previousAllocations.sort((a, b) => b.startDate.localeCompare(a.startDate)),
    }))
    .sort((a, b) => b.utilization - a.utilization || a.name.localeCompare(b.name));

  const exportRows: AllocationReportExportRow[] = allocations
    .map((allocation) => ({
      Employee: allocation.employee.name,
      Client: allocation.project.client.name,
      Project: allocation.project.name,
      "Allocation %": allocation.allocationPercentage,
      "Start date": allocation.startDate.toISOString().slice(0, 10),
      "End date": allocation.endDate?.toISOString().slice(0, 10) ?? "Open",
      Status: allocationStatusFor(
        allocation.startDate,
        allocation.endDate,
        allocation.employee.isActive,
        allocation.project.isActive
      ),
    }))
    .sort((a, b) => a.Employee.localeCompare(b.Employee) || a.Project.localeCompare(b.Project));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Utilization report</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Review current utilization and allocation history. Manage project teams from Projects.</p>
          </div>
          <AllocationReportExport rows={exportRows} />
        </CardHeader>
      </Card>
      <CurrentUtilizationChart buckets={utilizationBuckets} />
      <EmployeeAllocationSummaryTable employees={employeeSummaries} />
    </div>
  );
}
