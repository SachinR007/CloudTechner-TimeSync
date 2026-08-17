"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { addDays, mondayOf, toISODate } from "@/lib/dates";
import { isSelfManagedInternalApproval, resolveProjectApprover } from "@/lib/approval";
import { parseISODateValue, validateRecordId, validateSafeDisplayText } from "@/lib/validation";

function parseLines(formData: FormData) {
  const lines: { taskId: string; workDate: string; hours: number; notes: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("hours__")) continue;
    const [, taskId, workDate] = key.split("__");
    const safeTaskId = validateRecordId(taskId ?? "", "Task");
    const safeWorkDate = parseISODateValue(workDate, "Work date");
    if (!safeWorkDate) throw new Error("Work date is required.");
    const hours = Number(value);
    if (Number.isFinite(hours) && hours > 0) {
      if (hours > 24 || !Number.isInteger(hours * 4)) {
        throw new Error("Hours must be between 0.25 and 24, in 0.25 hour increments.");
      }
      const notes = String(formData.get(`notes__${taskId}__${workDate}`) ?? "").trim();
      if (notes.length > 1000) throw new Error("Timesheet notes are too long.");
      lines.push({ taskId: safeTaskId, workDate: toISODate(safeWorkDate), hours, notes: notes ? validateSafeDisplayText(notes, "Timesheet notes", 1000) : "" });
    }
  }
  return lines;
}

async function upsertTimesheet(
  employeeId: string,
  weekStartISO: string,
  formData: FormData,
  targetStatus: "DRAFT" | "SUBMITTED"
) {
  const parsedWeekStart = parseISODateValue(weekStartISO, "Week start date");
  if (!parsedWeekStart) throw new Error("Week start date is required.");
  const weekStartDate = mondayOf(parsedWeekStart);
  const lines = parseLines(formData);

  // Fetch active project allocations for the employee in the relevant timeframe.
  // project.isActive is enforced here too (not just when building the grid in
  // employee/page.tsx) so a deactivated project's tasks are rejected server-side,
  // not just hidden from the UI.
  const allocations = await prisma.projectAllocation.findMany({
    where: {
      employeeId,
      startDate: { lte: addDays(weekStartDate, 6) },
      OR: [{ endDate: null }, { endDate: { gte: weekStartDate } }],
      project: { isActive: true },
    },
    include: {
      project: {
        include: {
          tasks: true,
        },
      },
    },
  });

  // Validate future dates & project allocations
  const todayStr = toISODate(new Date());
  for (const line of lines) {
    if (line.workDate > todayStr) {
      throw new Error(`You cannot log hours for future dates (attempted to log for ${line.workDate}).`);
    }

    const alloc = allocations.find((a) =>
      a.project.tasks.some((t) => t.id === line.taskId)
    );
    if (!alloc) {
      throw new Error(`No active project allocation found for the task.`);
    }

    const startISO = toISODate(alloc.startDate);
    const endISO = alloc.endDate ? toISODate(alloc.endDate) : null;
    if (line.workDate < startISO || (endISO && line.workDate > endISO)) {
      throw new Error(`You cannot log hours for this task outside your project allocation period (${startISO} to ${endISO || "open-ended"}).`);
    }
  }

  const existing = await prisma.timesheetHeader.findUnique({
    where: { employeeId_weekStartDate: { employeeId, weekStartDate } },
  });

  if (existing && !["DRAFT", "REJECTED"].includes(existing.status)) {
    throw new Error(
      `This timesheet is already ${existing.status.toLowerCase()} and can't be edited.`
    );
  }

  let approvedById: string | null = existing?.approvedById ?? null;
  let projectApprovals: { projectId: string; approverId: string; status: "PENDING" | "APPROVED" }[] = [];

  if (targetStatus === "SUBMITTED") {
    // ── Enforce 40 Hour Submission Rule & Friday Timing Check ──
    const dbUser = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
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
        date: { gte: weekStartDate, lte: addDays(weekStartDate, 6) },
        holidayPlanId: { in: planIds },
      },
    });

    const leaves = await prisma.leave.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: addDays(weekStartDate, 6) },
        endDate: { gte: weekStartDate },
      },
    });

    const holidayDates = new Set(holidays.map((h) => toISODate(h.date)));
    const leaveDates = new Set<string>();
    for (const l of leaves) {
      const start = new Date(Math.max(l.startDate.getTime(), weekStartDate.getTime()));
      const end = new Date(Math.min(l.endDate.getTime(), addDays(weekStartDate, 6).getTime()));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDates.add(toISODate(d));
      }
    }

    let automaticHours = 0;
    for (let i = 0; i < 5; i++) {
      const dateStr = toISODate(addDays(weekStartDate, i));
      const hasLoggedHours = lines.some((l) => l.workDate === dateStr);
      if (!hasLoggedHours && (leaveDates.has(dateStr) || holidayDates.has(dateStr))) {
        automaticHours += 8;
      }
    }

    const loggedHours = lines.reduce((s, l) => s + l.hours, 0);
    const totalEffectiveHours = loggedHours + automaticHours;

    if (totalEffectiveHours < 40) {
      throw new Error(`You must log a total of at least 40 hours (including leaves and holidays) to submit this timesheet. Current total: ${totalEffectiveHours} hours.`);
    }

    const fridayOfTimesheetWeek = addDays(weekStartDate, 4);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today.getTime() < fridayOfTimesheetWeek.getTime()) {
      throw new Error("You can only submit this timesheet starting from Friday of this timesheet week. Please save it as a draft for now.");
    }

    // Fetch comments criteria + project/approver info for the tasks being submitted
    const taskIdsForValidation = lines.map((l) => l.taskId);
    const tasksWithCriteria = await prisma.task.findMany({
      where: { id: { in: taskIdsForValidation } },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            commentsCriteria: true,
            projectManagerId: true,
            client: { select: { clientManagerId: true } },
          },
        },
      },
    });

    const criteriaMap = new Map(
      tasksWithCriteria.map((t) => [t.id, t.project.commentsCriteria])
    );
    // task -> its project (for splitting the week's approval per project)
    const taskProject = new Map(tasksWithCriteria.map((t) => [t.id, t.project]));

    // Validate notes against the criteria
    for (const line of lines) {
      const criteria = criteriaMap.get(line.taskId) ?? "COMPULSORY";

      // Under the combined option (less/greater than 8 hours), if hours is exactly 8, comments are not allowed/required.
      if ((criteria === "LESS_THAN_8_HOURS" || criteria === "MORE_THAN_8_HOURS") && line.hours === 8) {
        line.notes = "";
      }

      let requiresComment = false;
      if (criteria === "COMPULSORY") {
        requiresComment = true;
      } else if (criteria === "LESS_THAN_8_HOURS" || criteria === "MORE_THAN_8_HOURS") {
        requiresComment = line.hours !== 8;
      }

      if (requiresComment && !line.notes) {
        throw new Error(`A comment/notes description is required for the day you logged ${line.hours} hours based on the project's criteria.`);
      }
    }

    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { approverOverrideId: true, reportingManagerId: true },
    });

    // Per-project approval: split the week by project and resolve an approver for
    // each, so each project's hours + comments go to that project's own approver
    // (see src/lib/approval.ts). Every distinct project must resolve to a valid
    // approver or the whole submission is blocked.
    const distinctProjects = new Map<string, { name: string; approverId: string; status: "PENDING" | "APPROVED" }>();
    for (const line of lines) {
      const proj = taskProject.get(line.taskId);
      if (!proj) continue;
      if (distinctProjects.has(proj.id)) continue;
      const approverId = resolveProjectApprover({
        employeeId,
        approverOverrideId: employee.approverOverrideId,
        reportingManagerId: employee.reportingManagerId,
        projectManagerId: proj.projectManagerId,
        clientManagerId: proj.client?.clientManagerId ?? null,
      });
      if (!approverId) {
        if (isSelfManagedInternalApproval({ employeeId, projectName: proj.name, projectManagerId: proj.projectManagerId })) {
          distinctProjects.set(proj.id, { name: proj.name, approverId: employeeId, status: "APPROVED" });
          continue;
        }
        throw new Error(`No approver is configured for project "${proj.name}". Contact Timesheet Admin.`);
      }
      distinctProjects.set(proj.id, { name: proj.name, approverId, status: "PENDING" });
    }

    if (distinctProjects.size === 0) {
      throw new Error("No approver is configured for this timesheet. Contact Timesheet Admin.");
    }

    projectApprovals = [...distinctProjects.entries()].map(([projectId, v]) => ({
      projectId,
      approverId: v.approverId,
      status: v.status,
    }));
    // With per-project approval the single header-level approver is no longer the
    // source of truth; the per-project TimesheetApproval rows are.
    approvedById = null;
  }

  const currentWeekMonday = mondayOf(new Date());
  const diffTime = currentWeekMonday.getTime() - weekStartDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const isOverdue = diffDays > 14;

  const totalHours = lines.reduce((s, l) => s + l.hours, 0);
  const autoApprovedSubmission =
    targetStatus === "SUBMITTED" &&
    projectApprovals.length > 0 &&
    projectApprovals.every((pa) => pa.status === "APPROVED");
  const headerStatus = autoApprovedSubmission && !isOverdue ? "APPROVED" : targetStatus;

  await prisma.$transaction(async (tx) => {
    const header = await tx.timesheetHeader.upsert({
      where: { employeeId_weekStartDate: { employeeId, weekStartDate } },
      create: {
        employeeId,
        weekStartDate,
        status: headerStatus,
        rejectionComments: null,
        totalHours,
        isLate: targetStatus === "SUBMITTED" ? isOverdue : false,
        lateApproved: false,
        approvedById: targetStatus === "SUBMITTED" ? approvedById : null,
        submittedAt: targetStatus === "SUBMITTED" ? new Date() : null,
        approvedAt: headerStatus === "APPROVED" ? new Date() : null,
      },
      update: {
        status: headerStatus,
        rejectionComments: targetStatus === "SUBMITTED" ? null : undefined,
        totalHours,
        isLate: targetStatus === "SUBMITTED" ? isOverdue : undefined,
        lateApproved: targetStatus === "SUBMITTED" && isOverdue ? false : undefined,
        approvedById: targetStatus === "SUBMITTED" ? approvedById : undefined,
        submittedAt: targetStatus === "SUBMITTED" ? new Date() : undefined,
        approvedAt: targetStatus === "SUBMITTED" ? (headerStatus === "APPROVED" ? new Date() : null) : undefined,
      },
    });

    await tx.timesheetLine.deleteMany({ where: { timesheetHeaderId: header.id } });
    if (lines.length > 0) {
      await tx.timesheetLine.createMany({
        data: lines.map((l) => ({
          timesheetHeaderId: header.id,
          taskId: l.taskId,
          workDate: new Date(`${l.workDate}T00:00:00.000Z`),
          hours: l.hours,
          notes: l.notes || null,
        })),
      });
    }

    // Per-project approval rows. Rebuilt on every submit/resubmit (a resubmit
    // after rejection resets all slices back to PENDING). Drafts clear them.
    await tx.timesheetApproval.deleteMany({ where: { timesheetHeaderId: header.id } });
    if (targetStatus === "SUBMITTED" && projectApprovals.length > 0) {
      await tx.timesheetApproval.createMany({
        data: projectApprovals.map((pa) => ({
          timesheetHeaderId: header.id,
          projectId: pa.projectId,
          approverId: pa.approverId,
          status: pa.status,
          approvedAt: pa.status === "APPROVED" ? new Date() : null,
        })),
      });
    }

    if (targetStatus === "SUBMITTED") {
      await tx.approvalHistory.create({
        data: {
          timesheetHeaderId: header.id,
          actorId: employeeId,
          action: isOverdue 
            ? "SUBMITTED_LATE" 
            : (autoApprovedSubmission ? "APPROVED" : (existing?.status === "REJECTED" ? "RESUBMITTED" : "SUBMITTED")),
          comments: isOverdue 
            ? "Late submission requested (Pending HR approval)" 
            : (autoApprovedSubmission ? "Self-managed internal project auto-approved" : (existing?.status === "REJECTED" ? "Resubmitted timesheet" : "Submitted timesheet")),
        },
      });
    } else if (targetStatus === "DRAFT") {
      await tx.approvalHistory.create({
        data: {
          timesheetHeaderId: header.id,
          actorId: employeeId,
          action: "SAVED_DRAFT",
          comments: "Draft saved",
        },
      });
    }
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
}

export async function saveDraft(weekStartISO: string, formData: FormData) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  await upsertTimesheet(user.id, weekStartISO, formData, "DRAFT");
}

export async function submitTimesheet(weekStartISO: string, formData: FormData) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  await upsertTimesheet(user.id, weekStartISO, formData, "SUBMITTED");
}

export async function withdrawTimesheet(weekStartISO: string) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  const parsedWeekStart = parseISODateValue(weekStartISO, "Week start date");
  if (!parsedWeekStart) throw new Error("Week start date is required.");
  const weekStartDate = mondayOf(parsedWeekStart);

  const existing = await prisma.timesheetHeader.findUnique({
    where: { employeeId_weekStartDate: { employeeId: user.id, weekStartDate } },
  });

  if (!existing || existing.status !== "SUBMITTED") {
    throw new Error("Only submitted timesheets can be withdrawn.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.timesheetHeader.update({
      where: { id: existing.id },
      data: { status: "DRAFT" },
    });

    await tx.approvalHistory.create({
      data: {
        timesheetHeaderId: existing.id,
        actorId: user.id,
        action: "WITHDRAWN",
        comments: "Withdrawn by employee",
      },
    });
  });

  revalidatePath("/employee");
}

export async function dismissNotification(notificationId: string) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");

  await prisma.notification.update({
    where: { id: validateRecordId(notificationId, "Notification"), employeeId: user.id },
    data: { isRead: true },
  });

  revalidatePath("/employee");
  revalidatePath("/manager");
}



