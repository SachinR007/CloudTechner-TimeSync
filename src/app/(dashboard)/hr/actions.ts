"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { parseISODateValue, validateRecordId, validateSafeDisplayText } from "@/lib/validation";
import { HR_ACCESS_ROLES } from "@/lib/roles";
import { formatWeekRange } from "@/lib/dates";

export async function approveLateSubmission(timesheetHeaderId: string) {
  const user = await requireRole(...HR_ACCESS_ROLES);
  const safeHeaderId = validateRecordId(timesheetHeaderId, "Timesheet");
  const actorLabel = user.role === "TS_ADMIN" ? "Timesheet Admin" : "HR Admin";

  await prisma.$transaction(async (tx) => {
    // 1. Update lateApproved to true
    const timesheet = await tx.timesheetHeader.update({
      where: { id: safeHeaderId },
      data: {
        lateApproved: true,
      },
    });

    const projectApprovals = await tx.timesheetApproval.findMany({
      where: { timesheetHeaderId: timesheet.id },
      select: { status: true },
    });
    const allProjectSlicesApproved =
      projectApprovals.length > 0 &&
      projectApprovals.every((approval) => approval.status === "APPROVED");

    if (allProjectSlicesApproved) {
      await tx.timesheetHeader.update({
        where: { id: timesheet.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });
    }

    // 2. Add history log
    await tx.approvalHistory.create({
      data: {
        timesheetHeaderId: timesheet.id,
        actorId: user.id,
        action: "LATE_APPROVED",
        comments: `Late submission approved by ${actorLabel} (${user.name})`,
      },
    });
  });

  revalidatePath("/hr");
  revalidatePath("/employee");
}

export async function approveLateSubmissions(timesheetHeaderIds: string[]) {
  const user = await requireRole(...HR_ACCESS_ROLES);
  if (!Array.isArray(timesheetHeaderIds) || timesheetHeaderIds.length === 0) {
    throw new Error("Select at least one late submission to approve.");
  }
  if (timesheetHeaderIds.length > 100) {
    throw new Error("Approve no more than 100 late submissions at a time.");
  }

  const safeHeaderIds = Array.from(
    new Set(
      timesheetHeaderIds.map((id) => {
        if (typeof id !== "string") throw new Error("Invalid timesheet selection.");
        return validateRecordId(id, "Timesheet");
      })
    )
  );
  const actorLabel = user.role === "TS_ADMIN" ? "Timesheet Admin" : "HR Admin";

  await prisma.$transaction(async (tx) => {
    const timesheets = await tx.timesheetHeader.findMany({
      where: { id: { in: safeHeaderIds } },
      select: { id: true, isLate: true, lateApproved: true, status: true },
    });
    if (timesheets.length !== safeHeaderIds.length) {
      throw new Error("One or more selected timesheets no longer exist.");
    }
    if (timesheets.some((timesheet) => !timesheet.isLate || timesheet.lateApproved || timesheet.status !== "SUBMITTED")) {
      throw new Error("One or more selected timesheets have already been processed. Refresh and try again.");
    }

    const projectApprovals = await tx.timesheetApproval.findMany({
      where: { timesheetHeaderId: { in: safeHeaderIds } },
      select: { timesheetHeaderId: true, status: true },
    });
    const statusesByHeader = new Map<string, string[]>();
    for (const approval of projectApprovals) {
      const statuses = statusesByHeader.get(approval.timesheetHeaderId) ?? [];
      statuses.push(approval.status);
      statusesByHeader.set(approval.timesheetHeaderId, statuses);
    }

    const approvedAt = new Date();
    for (const timesheet of timesheets) {
      const statuses = statusesByHeader.get(timesheet.id) ?? [];
      const allProjectSlicesApproved = statuses.length > 0 && statuses.every((status) => status === "APPROVED");
      await tx.timesheetHeader.update({
        where: { id: timesheet.id },
        data: { lateApproved: true, ...(allProjectSlicesApproved ? { status: "APPROVED", approvedAt } : {}) },
      });
    }

    await tx.approvalHistory.createMany({
      data: safeHeaderIds.map((timesheetHeaderId) => ({
        timesheetHeaderId,
        actorId: user.id,
        action: "LATE_APPROVED",
        comments: `Late submission approved by ${actorLabel} (${user.name})`,
      })),
    });
  });

  revalidatePath("/hr");
  revalidatePath("/employee");
}

export async function rejectLateSubmission(timesheetHeaderId: string, comments: string) {
  const user = await requireRole(...HR_ACCESS_ROLES);
  const safeHeaderId = validateRecordId(timesheetHeaderId, "Timesheet");
  const actorLabel = user.role === "TS_ADMIN" ? "Timesheet Admin" : "HR Admin";
  const safeComments = comments.trim()
    ? validateSafeDisplayText(comments, "Rejection comments", 1000)
    : `Late submission rejected by ${actorLabel}.`;

  await prisma.$transaction(async (tx) => {
    // 1. Update status to REJECTED and rejection comments
    const timesheet = await tx.timesheetHeader.update({
      where: { id: safeHeaderId },
      data: {
        status: "REJECTED",
        rejectionComments: safeComments,
      },
    });

    // 2. Add history log
    await tx.approvalHistory.create({
      data: {
        timesheetHeaderId: timesheet.id,
        actorId: user.id,
        action: "LATE_REJECTED",
        comments: safeComments,
      },
    });
  });

  revalidatePath("/hr");
  revalidatePath("/employee");
}

export async function sendTimesheetReminder(employeeId: string, weekStartISO: string) {
  return sendTimesheetReminders([employeeId], weekStartISO);
}

/** Notify selected active employees only if their prior-week submission is still missing. */
export async function sendTimesheetReminders(employeeIds: string[], weekStartISO: string) {
  const user = await requireRole(...HR_ACCESS_ROLES);
  if (!Array.isArray(employeeIds) || employeeIds.length === 0 || employeeIds.length > 100) throw new Error("Select between 1 and 100 employees.");
  const safeEmployeeIds = [...new Set(employeeIds.map((id) => validateRecordId(id, "Employee")))];
  const weekStartDate = parseISODateValue(weekStartISO, "Week start date");
  if (!weekStartDate) throw new Error("Week start date is required.");
  const employees = await prisma.employee.findMany({ where: { id: { in: safeEmployeeIds }, isActive: true }, select: { id: true, name: true, reportingManagerId: true, timesheets: { where: { weekStartDate }, select: { status: true } } } });
  if (employees.length !== safeEmployeeIds.length) throw new Error("One or more selected employees are no longer active.");
  const outstanding = employees.filter((employee) => !employee.timesheets.some((header) => header.status === "SUBMITTED" || header.status === "APPROVED"));
  const week = formatWeekRange(weekStartDate);
  const creates = [];
  for (const employee of outstanding) {
    const employeeMessage = `${user.role === "TS_ADMIN" ? "Timesheet Admin" : "HR"} asked you to complete your timesheet for ${week}.`;
    const managerMessage = `${employee.name} has not filled the timesheet for ${week}.`;
    const recipients = [employee.id, employee.reportingManagerId].filter((id): id is string => Boolean(id));
    const existing = await prisma.notification.findMany({ where: { employeeId: { in: recipients }, isRead: false, message: { in: [employeeMessage, managerMessage] } }, select: { employeeId: true, message: true } });
    const sent = new Set(existing.map((notification) => `${notification.employeeId}:${notification.message}`));
    if (!sent.has(`${employee.id}:${employeeMessage}`)) creates.push(prisma.notification.create({ data: { employeeId: employee.id, message: employeeMessage } }));
    if (employee.reportingManagerId && !sent.has(`${employee.reportingManagerId}:${managerMessage}`)) creates.push(prisma.notification.create({ data: { employeeId: employee.reportingManagerId, message: managerMessage, kind: "MISSED_TIMESHEET", subjectEmployeeId: employee.id } }));
  }
  await prisma.$transaction(creates);

  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/", "layout");
  return { notified: outstanding.length, skipped: employees.length - outstanding.length };
}
