import { requireRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { toISODate, weekDates } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReviewLine } from "./review-dialog";
import { ApprovalFilters } from "./approval-filters";
import { GroupedApprovalsTable, type ApprovalRowData } from "./grouped-approvals-table";
import type { Prisma } from "@prisma/client";
import { employeeOptionSelect } from "@/lib/safe-selects";

export default async function ManagerDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }>;
}) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  const { sort, startDate, endDate, search } = await searchParams;

  // Pending approvals are now per-project slices assigned to this approver.
  const headerWhere: Prisma.TimesheetHeaderWhereInput = {
    employee: {
      isActive: true,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    OR: [{ isLate: false }, { isLate: true, lateApproved: true }],
  };

  if (startDate || endDate) {
    headerWhere.weekStartDate = {};
    if (startDate) headerWhere.weekStartDate.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) headerWhere.weekStartDate.lte = new Date(`${endDate}T00:00:00.000Z`);
  }

  let orderByClause: Prisma.TimesheetApprovalOrderByWithRelationInput = { timesheetHeader: { submittedAt: "desc" } };
  if (sort === "asc") orderByClause = { timesheetHeader: { submittedAt: "asc" } };
  else if (sort === "week_desc") orderByClause = { timesheetHeader: { weekStartDate: "desc" } };
  else if (sort === "week_asc") orderByClause = { timesheetHeader: { weekStartDate: "asc" } };

  const [pending, recentDecisions] = await Promise.all([
    prisma.timesheetApproval.findMany({
      where: { approverId: user.id, status: "PENDING", timesheetHeader: headerWhere },
      include: {
        project: { select: { id: true, name: true } },
        timesheetHeader: {
          include: {
            employee: { select: employeeOptionSelect },
            lines: { include: { task: { include: { project: { include: { client: true } } } } } },
            approvalHistory: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: orderByClause,
    }),
    prisma.timesheetApproval.findMany({
      where: { approverId: user.id, status: { in: ["APPROVED", "REJECTED"] } },
      include: { project: { select: { name: true } }, timesheetHeader: { include: { employee: { select: employeeOptionSelect } } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const approvalsData: ApprovalRowData[] = pending.map((approval) => {
    const t = approval.timesheetHeader;
    const dates = weekDates(t.weekStartDate).map(toISODate);
    const projectLines = t.lines.filter((l) => l.task.project.id === approval.projectId);
    const byTask = new Map<string, ReviewLine>();
    for (const line of projectLines) {
      const key = line.taskId;
      if (!byTask.has(key)) {
        byTask.set(key, {
          taskId: line.taskId,
          taskName: line.task.name,
          projectName: line.task.project.name,
          clientName: line.task.project.client.name,
          hoursByDate: {},
          notesByDate: {},
        });
      }
      byTask.get(key)!.hoursByDate[toISODate(line.workDate)] = Number(line.hours);
      byTask.get(key)!.notesByDate[toISODate(line.workDate)] = line.notes ?? "";
    }
    const projectHours = projectLines.reduce((s, l) => s + Number(l.hours), 0);

    return {
      approvalId: approval.id,
      employeeId: t.employee.id,
      employeeName: t.employee.name,
      projectId: approval.projectId,
      projectName: approval.project.name,
      weekStartDate: toISODate(t.weekStartDate),
      projectHours,
      dates,
      lines: Array.from(byTask.values()).sort((a, b) => a.taskName.localeCompare(b.taskName)),
      submitComments: t.approvalHistory[0]?.comments ?? "",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Team Approvals</h1>
        <p className="text-muted-foreground">Welcome, {user.name}. Click on an employee name to expand their pending timesheet approvals.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
          <CardTitle className="text-base font-bold text-gray-800">Pending review ({pending.length})</CardTitle>
          <ApprovalFilters />
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <GroupedApprovalsTable approvals={approvalsData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent decisions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentDecisions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.timesheetHeader.employee.name}</TableCell>
                  <TableCell>{d.project.name}</TableCell>
                  <TableCell>{toISODate(d.timesheetHeader.weekStartDate)}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === "APPROVED" ? "default" : "destructive"}>
                      {d.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {recentDecisions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No decisions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
