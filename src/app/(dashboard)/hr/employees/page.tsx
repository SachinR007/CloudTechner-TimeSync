import { prisma } from "@/lib/prisma";
import { nextEmployeeCode } from "@/lib/codes";
import { Card, CardContent } from "@/components/ui/card";
import { CreateEmployeeDialog } from "./create-employee-dialog";
import { requireRole } from "@/lib/auth-guards";
import { mondayOf } from "@/lib/dates";
import { EmployeeList } from "./employee-list";
import { employeeOptionSelect, employeeSafeSelect } from "@/lib/safe-selects";

export default async function EmployeesPage() {
  // Protect page for HR_ADMIN and TS_ADMIN
  await requireRole("HR_ADMIN", "TS_ADMIN");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const currentWeekMonday = mondayOf(new Date());

  const [employeesData, activeEmployees, suggestedId] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { id: "asc" },
      select: {
        ...employeeSafeSelect,
        allocations: {
          // Only count allocations on still-active projects toward an
          // employee's total % and project badges -- a deactivated project
          // shouldn't inflate their allocation (kept consistent with the
          // admin dashboard and /admin/allocations utilization calcs).
          where: {
            startDate: { lte: today },
            OR: [
              { endDate: null },
              { endDate: { gte: today } }
            ],
            project: { isActive: true }
          },
          include: {
            project: true
          }
        },
        timesheets: {
          where: {
            weekStartDate: currentWeekMonday
          },
          include: {
            lines: true
          }
        },
        reportingManager: { select: employeeOptionSelect },
        approverOverride: { select: employeeOptionSelect },
      },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { ...employeeOptionSelect, role: true },
      orderBy: { name: "asc" },
    }),
    nextEmployeeCode(),
  ]);

  // Map employee database fields to client props
  const mappedEmployees = employeesData.map((emp) => {
    const totalAllocation = emp.allocations.reduce((sum, alloc) => sum + alloc.allocationPercentage, 0);

    const currentWeekHours = emp.timesheets.reduce((sum, ts) => {
      return sum + ts.lines.reduce((s, line) => s + Number(line.hours), 0);
    }, 0);

    const projects = emp.allocations.map(a => a.project.name);

    return {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      title: emp.title,
      isActive: emp.isActive,
      reportingManager: emp.reportingManager ? { id: emp.reportingManager.id, name: emp.reportingManager.name } : null,
      reportingManagerId: emp.reportingManagerId,
      approverOverrideId: emp.approverOverrideId,
      totalAllocation,
      currentWeekHours,
      projects,
    };
  });

  // Calculate high level statistics matching the mockup
  const totalCount = employeesData.length;
  const activeCount = employeesData.filter(e => e.isActive).length;

  const activeEmps = employeesData.filter(e => e.isActive);
  const totalAllocSum = activeEmps.reduce((sum, emp) => {
    return sum + emp.allocations.reduce((s, a) => s + a.allocationPercentage, 0);
  }, 0);
  const avgUtilization = activeEmps.length > 0 ? Math.round(totalAllocSum / activeEmps.length) : 0;

  const overallocatedList = activeEmps.map(emp => {
    const total = emp.allocations.reduce((s, a) => s + a.allocationPercentage, 0);
    return { name: emp.name, total };
  }).filter(x => x.total > 100);

  const overallocatedCount = overallocatedList.length;
  const overallocatedSubtext = overallocatedCount > 0 
    ? `${overallocatedList[0].name} · ${overallocatedList[0].total}%`
    : "All within limits";

  // Logical benchmark: employees with 0 allocations are on bench/leave
  const onLeaveCount = activeEmps.filter(e => e.allocations.length === 0).length;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500">Manage employee records, roles, and project allocations.</p>
        </div>
        <div className="flex items-center gap-3">
          <CreateEmployeeDialog managers={activeEmployees} suggestedId={suggestedId} />
        </div>
      </div>

      {/* Four modern stats cards matching mockup */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Employees</div>
            <div className="text-2xl font-extrabold mt-1 text-gray-900">{totalCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Full-time staff</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active</div>
            <div className="text-2xl font-extrabold mt-1 text-emerald-800">{activeCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">{onLeaveCount} on leave/bench</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-600 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Utilization</div>
            <div className="text-2xl font-extrabold mt-1 text-gray-800">{avgUtilization}%</div>
            <div className="text-[11px] text-gray-500 mt-1">Above 80% target</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Over Allocated</div>
            <div className="text-2xl font-extrabold mt-1 text-rose-800">{overallocatedCount}</div>
            <div className="text-[11px] text-rose-500 mt-0.5 truncate">{overallocatedSubtext}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Employee list with Search & Filters */}
      <EmployeeList initialEmployees={mappedEmployees} allActiveEmployees={activeEmployees} />
    </div>
  );
}
