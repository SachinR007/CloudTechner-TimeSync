import Link from "next/link";
import { requireRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mondayOf, toISODate, addDays } from "@/lib/dates";
import { employeeOptionSelect } from "@/lib/safe-selects";

export default async function AdminDashboard() {
  const user = await requireRole("TS_ADMIN");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1. Fetch count of active employees and clients
  const [employeeCount, clientCount] = await Promise.all([
    prisma.employee.count({ where: { isActive: true } }),
    prisma.client.count({ where: { isActive: true } }),
  ]);

  // 2. Fetch current week's timesheet statuses
  const currentWeekMonday = mondayOf(new Date());
  const currentWeekHeaders = await prisma.timesheetHeader.findMany({
    where: { weekStartDate: currentWeekMonday },
  });

  const submittedCount = currentWeekHeaders.filter(h => h.status === "SUBMITTED" || h.status === "APPROVED").length;
  const draftCount = currentWeekHeaders.filter(h => h.status === "DRAFT").length;
  const notStartedCount = Math.max(employeeCount - (submittedCount + draftCount), 0);

  // 3. Fetch past 4 weeks submission timeline data
  const timelineWeeks = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = addDays(currentWeekMonday, -i * 7);
    const weekEnd = addDays(weekStart, 6);
    
    // Format label, e.g. "Week 27 · 06-12 Jul"
    // To get week number:
    const tempDate = new Date(weekStart);
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
    const weekNum = Math.round(((tempDate.getTime() - new Date(tempDate.getFullYear(), 0, 4).getTime()) / 86400000) / 7) + 1;
    
    const startStr = weekStart.toLocaleString("en-US", { day: "2-digit", month: "short" });
    const endStr = weekEnd.toLocaleString("en-US", { day: "2-digit", month: "short" });
    
    const weekHeaders = await prisma.timesheetHeader.findMany({
      where: { weekStartDate: weekStart },
    });
    
    const submittedOrApproved = weekHeaders.filter(h => h.status === "SUBMITTED" || h.status === "APPROVED").length;
    
    timelineWeeks.push({
      label: `Week ${weekNum}`,
      dateRange: `${startStr} - ${endStr}`,
      submitted: submittedOrApproved,
      total: employeeCount,
      isCurrent: i === 0,
    });
  }

  // 4. Fetch active projects (clients and allocations)
  const activeProjects = await prisma.project.findMany({
    where: { isActive: true },
    include: {
      client: true,
      allocations: {
        where: {
          startDate: { lte: today },
          OR: [
            { endDate: null },
            { endDate: { gte: today } },
          ],
        },
      },
    },
    take: 5,
  });

  // 5. Fetch overallocation data. Only allocations on active projects for
  // active employees count toward utilization -- a deactivated project (or a
  // former employee) shouldn't inflate anyone's total. Kept consistent with
  // the utilization calc on /admin/allocations.
  const activeAllocations = await prisma.projectAllocation.findMany({
    where: {
      startDate: { lte: today },
      OR: [
        { endDate: null },
        { endDate: { gt: today } },
      ],
      project: { isActive: true },
      employee: { isActive: true },
    },
    include: {
      employee: { select: employeeOptionSelect },
      project: true,
    },
  });

  const empAllocMap = new Map<string, { name: string; total: number; details: string[] }>();
  for (const a of activeAllocations) {
    const prev = empAllocMap.get(a.employeeId) || { name: a.employee.name, total: 0, details: [] };
    prev.total += a.allocationPercentage;
    prev.details.push(`${a.project.name} (${a.allocationPercentage}%)`);
    empAllocMap.set(a.employeeId, prev);
  }

  const overallocated = Array.from(empAllocMap.entries())
    .map(([id, info]) => ({ id, ...info }))
    .filter((emp) => emp.total > 100);

  // Sum up all projects
  const totalActiveProjects = await prisma.project.count({ where: { isActive: true } });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Admin dashboard</h1>
          <p className="text-sm text-gray-500">
            Company-wide timesheet status and project allocation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/projects"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-800 hover:bg-emerald-850 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            + New project
          </Link>
        </div>
      </div>

      {/* Four modern stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Employees</div>
            <div className="text-2xl font-extrabold mt-1 text-gray-900">{employeeCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">{clientCount} active clients</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Submitted W{currentWeekHeaders.length > 0 ? "27" : "27"}
            </div>
            <div className="text-2xl font-extrabold mt-1 text-emerald-800">{submittedCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">
              {employeeCount > 0 ? Math.round((submittedCount / employeeCount) * 100) : 0}% of team
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Draft Only</div>
            <div className="text-2xl font-extrabold mt-1 text-amber-700">{draftCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Not submitted yet</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500 border-gray-250/70 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Not Started</div>
            <div className="text-2xl font-extrabold mt-1 text-rose-800">{notStartedCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Needs a nudge</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Submission Timeline and Active Projects */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left Column: Submission timeline */}
        <Card className="lg:col-span-3 border border-gray-200/80 shadow-sm bg-white">
          <CardHeader className="border-b border-gray-100 bg-gray-50/40 py-4 px-5">
            <CardTitle className="text-sm font-bold text-gray-800">
              Submission timeline · Last 4 weeks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 flex flex-col gap-5">
            {timelineWeeks.map((week, idx) => {
              const percentage = week.total > 0 ? Math.round((week.submitted / week.total) * 100) : 0;
              const barColor = week.isCurrent ? "bg-blue-600" : "bg-emerald-700";

              return (
                <div key={idx} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{week.label}</span>
                      <span className="text-gray-400 font-medium">· {week.dateRange}</span>
                      {week.isCurrent && (
                        <span className="rounded bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 text-[9px] font-bold uppercase select-none">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-950">{week.submitted}/{week.total}</span>
                      <span className="text-gray-400 font-medium">{percentage}%</span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right Column: Active projects */}
        <Card className="lg:col-span-2 border border-gray-200/80 shadow-sm bg-white">
          <CardHeader className="border-b border-gray-100 bg-gray-50/40 py-4 px-5 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-gray-800">Active projects</CardTitle>
            <span className="rounded-full bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 text-[10px] font-bold select-none">
              {totalActiveProjects} Active
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-gray-50/30 border-b border-gray-100 font-bold text-gray-500 select-none">
                  <th className="py-3 px-5">PROJECT</th>
                  <th className="py-3 px-5">CLIENT</th>
                  <th className="py-3 px-5 text-right">TEAM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeProjects.map((proj) => (
                  <tr key={proj.id} className="hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 px-5 font-bold text-gray-800">{proj.name}</td>
                    <td className="py-3 px-5 text-gray-500 font-medium">{proj.client.name}</td>
                    <td className="py-3 px-5 text-right font-semibold text-gray-700">
                      {proj.allocations.length}
                    </td>
                  </tr>
                ))}
                {activeProjects.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground font-medium">
                      No active projects found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Area: Employee Allocation and Overallocation Alerts */}
      <Card className="border border-gray-200/80 shadow-sm bg-white">
        <CardHeader className="border-b border-gray-100 bg-gray-50/40 py-4 px-5">
          <CardTitle className="text-sm font-bold text-gray-800">
            Employee allocation · Current Allocations
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4">
            {overallocated.length > 0 && (
              <div className="rounded-xl border border-amber-250 bg-amber-50/40 p-4">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
                  ⚠️ Overallocation Alerts (Must not exceed 100%)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {overallocated.map((emp) => (
                    <div key={emp.id} className="bg-white border border-amber-200 rounded-lg p-3 shadow-xs">
                      <div className="flex justify-between items-center font-bold text-xs">
                        <span className="text-gray-800">{emp.name}</span>
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {emp.total}%
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 font-medium">
                        Allocated: {emp.details.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from(empAllocMap.entries()).map(([id, emp]) => {
                const isOver = emp.total > 100;
                return (
                  <div key={id} className="border border-gray-150 rounded-xl p-3.5 hover:bg-gray-50/30 transition-colors">
                    <div className="flex justify-between items-center font-bold text-xs">
                      <span className="text-gray-800">{emp.name}</span>
                      <span className={`px-2 py-0.5 rounded border ${
                        isOver
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : "bg-emerald-50 text-emerald-800 border-emerald-250"
                      }`}>
                        {emp.total}%
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1.5 font-medium leading-relaxed">
                      {emp.details.length > 0 ? emp.details.join(", ") : "No active projects"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
