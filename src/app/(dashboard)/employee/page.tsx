

import Link from "next/link";
import { requireRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { addDays, mondayOf, toISODate, weekDates } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TimesheetGrid } from "./timesheet-grid";
import { withdrawTimesheet } from "./actions";
import { WeekDatePicker } from "@/components/week-date-picker";
import { EmployeeTabs } from "./employee-tabs";
import { allocationStatusFor } from "@/lib/allocation";
import { computeProjectHistory } from "@/lib/project-history";
import { isSelfManagedInternalApproval, resolveProjectApprover } from "@/lib/approval";
import { employeeOptionSelect } from "@/lib/safe-selects";

const STATUS_VARIANT = {
  DRAFT: "secondary",
  SUBMITTED: "default",
  APPROVED: "default",
  REJECTED: "destructive",
} as const;

export default async function EmployeeDashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  const { week } = await searchParams;

  const weekStart = mondayOf(week ? new Date(`${week}T00:00:00.000Z`) : new Date());
  const weekStartISO = toISODate(weekStart);
  const dates = weekDates(weekStart).map(toISODate);
  const prevWeek = toISODate(addDays(weekStart, -7));
  const nextWeek = toISODate(addDays(weekStart, 7));

  const weekEnd = addDays(weekStart, 6);
  const allocations = await prisma.projectAllocation.findMany({
    where: {
      employeeId: user.id,
      startDate: { lte: weekEnd },
      OR: [{ endDate: null }, { endDate: { gte: weekStart } }],
      project: {
        isActive: true,
        status: { in: ["IN_PROGRESS", "NOT_STARTED"] },
        OR: [
          { endDate: null },
          { endDate: { gte: weekStart } },
        ],
      },
    },
    include: {
      project: {
        include: {
          client: { select: { id: true, name: true } },
          tasks: {
            where: {
              isActive: true,
              OR: [
                { startDate: null },
                { startDate: { lte: weekEnd } },
              ],
              AND: [
                {
                  OR: [
                    { endDate: null },
                    { endDate: { gte: weekStart } },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  });

  const taskMap = new Map<
    string,
    {
      id: string;
      name: string;
      projectName: string;
      clientName: string;
      allocationStartDate: string;
      allocationEndDate: string | null;
      commentsCriteria: string;
    }
  >();
  for (const a of allocations) {
    for (const t of a.project.tasks) {
      taskMap.set(t.id, {
        id: t.id,
        name: t.name,
        projectName: a.project.name,
        clientName: a.project.client.name,
        allocationStartDate: toISODate(a.startDate),
        allocationEndDate: a.endDate ? toISODate(a.endDate) : null,
        commentsCriteria: a.project.commentsCriteria,
      });
    }
  }
  const header = await prisma.timesheetHeader.findUnique({
    where: { employeeId_weekStartDate: { employeeId: user.id, weekStartDate: weekStart } },
    include: {
      lines: true,
      approvedBy: { select: employeeOptionSelect },
      approvalHistory: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Ensure historical/imported timesheets with saved lines render even if the project is no longer in active allocations for that week
  if (header?.lines.length) {
    const lineTaskIds = header.lines.map((l) => l.taskId);
    const missingTaskIds = lineTaskIds.filter((id) => !taskMap.has(id));
    if (missingTaskIds.length > 0) {
      const extraTasks = await prisma.task.findMany({
        where: { id: { in: missingTaskIds } },
        include: {
          project: {
            include: {
              client: { select: { id: true, name: true } },
            },
          },
        },
      });
      for (const t of extraTasks) {
        taskMap.set(t.id, {
          id: t.id,
          name: t.name,
          projectName: t.project.name,
          clientName: t.project.client.name,
          allocationStartDate: "",
          allocationEndDate: null,
          commentsCriteria: t.project.commentsCriteria,
        });
      }
    }
  }

  const tasks = Array.from(taskMap.values()).sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.projectName.localeCompare(b.projectName) ||
      a.name.localeCompare(b.name)
  );

  const initialHours: Record<string, number> = {};
  const initialNotes: Record<string, string> = {};
  for (const line of header?.lines ?? []) {
    initialHours[`${line.taskId}__${toISODate(line.workDate)}`] = Number(line.hours);
    initialNotes[`${line.taskId}__${toISODate(line.workDate)}`] = line.notes ?? "";
  }

  const editable = !header || header.status === "DRAFT" || header.status === "REJECTED";

  const recentTimesheets = await prisma.timesheetHeader.findMany({
    where: { employeeId: user.id },
    orderBy: { weekStartDate: "desc" },
    take: 8,
  });

  const loggedThisWeek = header ? Number(header.totalHours || 0) : 0;

  const pendingApprovalCount = await prisma.timesheetHeader.count({
    where: { employeeId: user.id, status: "SUBMITTED" },
  });

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const approvedMTDHeaders = await prisma.timesheetHeader.findMany({
    where: {
      employeeId: user.id,
      status: "APPROVED",
      weekStartDate: { gte: firstDayOfMonth },
    },
    select: { totalHours: true },
  });
  const approvedMTD = approvedMTDHeaders.reduce((sum, h) => sum + Number(h.totalHours || 0), 0);

  // Working days count
  let workingDays = 0;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) workingDays++;
  }
  const capacityHours = Math.max(workingDays * 8, 8);
  const utilization = Math.round((approvedMTD / capacityHours) * 100);

  // Working days of the current timesheet week (Mon to Fri)
  const workingDaysOfWeek: Date[] = [];
  for (let i = 0; i < 5; i++) {
    workingDaysOfWeek.push(addDays(weekStart, i));
  }

  const allocDetails = allocations.map((a) => {
    let activeWorkingDays = 0;
    const startVal = new Date(a.startDate).getTime();
    const endVal = a.endDate ? new Date(a.endDate).getTime() : null;

    for (const wd of workingDaysOfWeek) {
      const t = wd.getTime();
      const isActive = t >= startVal && (endVal === null || t <= endVal);
      if (isActive) {
        activeWorkingDays++;
      }
    }

    const percentage = Math.round((activeWorkingDays / 5) * a.allocationPercentage);
    const hours = Math.round((activeWorkingDays / 5) * (a.allocationPercentage / 100) * 40);

    return {
      projectName: a.project.name,
      percentage,
      hours,
    };
  });
  const totalAllocatedPercentage = allocDetails.reduce((sum, a) => sum + a.percentage, 0);
  const unallocatedPercentage = Math.max(100 - totalAllocatedPercentage, 0);
  const unallocatedHours = Math.round((unallocatedPercentage / 100) * 40);

  // ── Fetch Holiday Data ──

  // 3. Fetch holidays in this week (default plan + employee's assigned plan)
  const dbUser = await prisma.employee.findUniqueOrThrow({
    where: { id: user.id },
    select: { holidayPlanId: true },
  });

  const defaultPlan = await prisma.holidayPlan.findFirst({
    where: { isDefault: true },
  });

  const planIds = [defaultPlan?.id].filter(Boolean) as string[];
  if (dbUser.holidayPlanId) {
    planIds.push(dbUser.holidayPlanId);
  }

  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: weekStart,
        lte: weekEnd,
      },
      holidayPlanId: {
        in: planIds,
      },
    },
  });

  // Build holiday dates map
  const holidayDates: Record<string, string> = {};
  for (const hol of holidays) {
    const dateStr = toISODate(hol.date);
    const hasWork = header?.lines.some(
      (line) => toISODate(line.workDate) === dateStr && Number(line.hours) > 0
    );
    if (!hasWork) {
      holidayDates[dateStr] = hol.name;
    }
  }

  // Fetch approved leaves in this week
  const leaves = await prisma.leave.findMany({
    where: {
      employeeId: user.id,
      status: "APPROVED",
      startDate: { lte: weekEnd },
      endDate: { gte: weekStart },
    },
  });

  const leaveDates: Record<string, string> = {};
  for (const l of leaves) {
    const start = new Date(Math.max(l.startDate.getTime(), weekStart.getTime()));
    const end = new Date(Math.min(l.endDate.getTime(), weekEnd.getTime()));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      leaveDates[toISODate(d)] = l.leaveType;
    }
  }

  // 5. Fetch all holidays list (default + assigned plan)
  const holidaysListRaw = await prisma.holiday.findMany({
    where: {
      holidayPlanId: {
        in: planIds,
      },
    },
    orderBy: { date: "asc" },
  });
  const holidaysList = holidaysListRaw.map((h) => ({
    id: h.id,
    name: h.name,
    date: toISODate(h.date),
    isFloaterLeave: h.isFloaterLeave,
    specialHoliday: h.specialHoliday,
  }));

  const serializedRecentTimesheets = recentTimesheets.map((t) => ({
    id: t.id,
    weekStartDate: toISODate(t.weekStartDate),
    totalHours: t.totalHours?.toString() ?? "0",
    status: t.status,
  }));

  // Render components for slot passing
  const headerBadge = header && (
    <Badge 
      variant={
        header.status === "SUBMITTED" && header.isLate && !header.lateApproved
          ? "destructive"
          : STATUS_VARIANT[header.status]
      } 
      className="font-semibold px-2.5 py-0.5"
    >
      {header.status === "SUBMITTED" && header.isLate && !header.lateApproved
        ? "LATE SUBMISSION PENDING"
        : header.status}
    </Badge>
  );

  const withdrawForm = header?.status === "SUBMITTED" && (
    <form action={async () => {
      "use server";
      await withdrawTimesheet(weekStartISO);
    }}>
      <Button type="submit" variant="outline" size="sm" className="text-amber-700 border-amber-200 hover:bg-amber-50">
        Withdraw
      </Button>
    </form>
  );

  const weekDatePicker = <WeekDatePicker currentWeekISO={weekStartISO} />;

  const prevWeekBtn = (
    <Button
      render={<Link href={`/employee?week=${prevWeek}`} />}
      variant="outline"
      size="sm"
      className="hover:bg-gray-50 border-gray-200"
    >
      ← Prev
    </Button>
  );

  const nextWeekBtn = (
    <Button
      render={<Link href={`/employee?week=${nextWeek}`} />}
      variant="outline"
      size="sm"
      className="hover:bg-gray-50 border-gray-200"
    >
      Next →
    </Button>
  );

  const feedbackAlert = header?.status === "REJECTED" && header.rejectionComments && (
    <Card className="border-red-200 bg-red-50/50">
      <CardContent className="pt-4 text-sm text-red-900">
        <span className="font-semibold">Rejection Feedback: </span>
        {header.rejectionComments}
      </CardContent>
    </Card>
  );

  // Get employee details for manager name
  const empDetails = await prisma.employee.findUnique({
    where: { id: user.id },
    select: {
      isActive: true,
      approverOverrideId: true,
      reportingManagerId: true,
      reportingManager: { select: { name: true } },
      approverOverride: { select: { name: true } },
    },
  });

  // Approval is per project now, so the "your approver" hint lists the resolved
  // approver(s) across the projects this employee is currently allocated to.
  const currentAllocProjects = await prisma.project.findMany({
    where: {
      isActive: true,
      allocations: {
        some: {
          employeeId: user.id,
          startDate: { lte: weekEnd },
          OR: [{ endDate: null }, { endDate: { gte: weekStart } }],
        },
      },
    },
    select: { name: true, projectManagerId: true, client: { select: { clientManagerId: true } } },
  });
  const approverIds = new Set<string>();
  const approverLabels = new Set<string>();
  for (const p of currentAllocProjects) {
    const a = resolveProjectApprover({
      employeeId: user.id,
      approverOverrideId: empDetails?.approverOverrideId ?? null,
      reportingManagerId: empDetails?.reportingManagerId ?? null,
      projectManagerId: p.projectManagerId,
      clientManagerId: p.client?.clientManagerId ?? null,
    });
    if (a) approverIds.add(a);
    else if (isSelfManagedInternalApproval({ employeeId: user.id, projectName: p.name, projectManagerId: p.projectManagerId })) {
      approverLabels.add("Self-managed internal project");
    }
  }
  const approverEmps = approverIds.size > 0
    ? await prisma.employee.findMany({ where: { id: { in: [...approverIds] } }, select: { name: true } })
    : [];
  for (const approver of approverEmps) approverLabels.add(approver.name);
  const approverName = approverEmps.length > 0
    ? [...approverLabels].join(", ")
    : (approverLabels.size > 0 ? [...approverLabels].join(", ") : "No approver configured");

  // Project History is derived from actual timesheet entries (contiguous stints),
  // not from ProjectAllocation rows -- those had unreliable historical dates from
  // the bulk import. See src/lib/project-history.ts.
  const historyAllocations = await computeProjectHistory(user.id);

  const notifications = await prisma.notification.findMany({
    where: { employeeId: user.id, isRead: false },
    orderBy: { createdAt: "desc" },
  });

  const serializedNotifications = notifications.map((n) => ({
    id: n.id,
    message: n.message,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">My Timesheet</h1>
        <p className="text-muted-foreground text-sm">
          Week of {weekStartISO} – {dates[6]}
        </p>
      </div>

      <EmployeeTabs
        weekStartISO={weekStartISO}
        dates={dates}
        tasks={tasks}
        initialHours={initialHours}
        initialNotes={initialNotes}
        editable={editable}
        loggedThisWeek={loggedThisWeek}
        pendingApprovalCount={pendingApprovalCount}
        approvedMTD={approvedMTD}
        utilization={utilization}
        allocDetails={allocDetails}
        totalAllocatedPercentage={totalAllocatedPercentage}
        unallocatedPercentage={unallocatedPercentage}
        unallocatedHours={unallocatedHours}
        recentTimesheets={serializedRecentTimesheets}
        headerBadge={headerBadge}
        withdrawForm={withdrawForm}
        weekDatePicker={weekDatePicker}
        prevWeekBtn={prevWeekBtn}
        nextWeekBtn={nextWeekBtn}
        feedbackAlert={feedbackAlert}
        holidaysList={holidaysList}
        holidayDates={holidayDates}
        leaveDates={leaveDates}
        approverName={approverName}
        historyAllocations={historyAllocations}
        notifications={serializedNotifications}
      />
    </div>
  );
}
