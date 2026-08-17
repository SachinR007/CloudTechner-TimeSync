import { requireRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HistoryList } from "./history-list";
import { employeeOptionSelect } from "@/lib/safe-selects";

export default async function TimesheetHistoryPage() {
  await requireRole("TS_ADMIN", "HR_ADMIN");

  const [historyItems, totalCount, approvedCount, rejectedCount, pendingHeadersCount] = await Promise.all([
    prisma.approvalHistory.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: employeeOptionSelect },
        timesheetHeader: {
          include: {
            employee: { select: employeeOptionSelect },
            lines: {
              include: {
                task: {
                  include: {
                    project: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.approvalHistory.count({
      where: { action: { in: ["SUBMITTED", "RESUBMITTED"] } }
    }),
    prisma.approvalHistory.count({
      where: { action: "APPROVED" }
    }),
    prisma.approvalHistory.count({
      where: { action: "REJECTED" }
    }),
    prisma.timesheetHeader.count({
      where: { status: "SUBMITTED" }
    })
  ]);

  // Map database data into structured visual logs
  const mappedLogs = historyItems.map((item) => {
    // Collect projects referenced in this timesheet
    const projectsSet = new Set<string>();
    let totalHours = 0;
    for (const line of item.timesheetHeader.lines) {
      if (line.task.project.name) {
        projectsSet.add(line.task.project.name);
      }
      totalHours += Number(line.hours);
    }
    const projectsList = Array.from(projectsSet);

    return {
      id: item.id,
      action: item.action,
      actorName: item.actor.name,
      employeeName: item.timesheetHeader.employee.name,
      weekStart: item.timesheetHeader.weekStartDate.toISOString().slice(0, 10),
      createdAt: item.createdAt,
      comments: item.comments,
      totalHours,
      projects: projectsList,
    };
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Timesheet history</h1>
          <p className="text-muted-foreground text-sm">
            Audit every past timesheet with approvals, rejections, and resubmit chains.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-250 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
            <span>📅</span>
            <span>Last 30 days</span>
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-250 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
            <span>📤</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Modern Dashboard Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 border-gray-200/80 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Submissions</div>
            <div className="text-2xl font-extrabold mt-1 text-gray-900">{totalCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Last 30 days</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 border-gray-200/80 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Approved</div>
            <div className="text-2xl font-extrabold mt-1 text-emerald-800">
              {approvedCount}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0}% approval rate
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500 border-gray-200/80 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rejected</div>
            <div className="text-2xl font-extrabold mt-1 text-rose-800">{rejectedCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">
              {totalCount > 0 ? Math.round((rejectedCount / totalCount) * 100) : 0}% reject rate
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 border-gray-200/80 shadow-sm bg-white">
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending</div>
            <div className="text-2xl font-extrabold mt-1 text-amber-700">{pendingHeadersCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Awaiting review</div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive History List with Client Filtering & Search */}
      <HistoryList initialLogs={mappedLogs} />
    </div>
  );
}
