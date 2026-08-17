"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { parseISODateValue, validateBoundedText, validateRecordId } from "@/lib/validation";

export async function approveLateSubmission(timesheetHeaderId: string) {
  const user = await requireRole("HR_ADMIN");
  const safeHeaderId = validateRecordId(timesheetHeaderId, "Timesheet");

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
        comments: `Late submission approved by HR Admin (${user.name})`,
      },
    });
  });

  revalidatePath("/hr");
  revalidatePath("/employee");
}

export async function rejectLateSubmission(timesheetHeaderId: string, comments: string) {
  const user = await requireRole("HR_ADMIN");
  const safeHeaderId = validateRecordId(timesheetHeaderId, "Timesheet");
  const safeComments = comments.trim()
    ? validateBoundedText(comments, "Rejection comments", 1000)
    : "Late submission rejected by HR Admin.";

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
  const user = await requireRole("HR_ADMIN");
  const safeEmployeeId = validateRecordId(employeeId, "Employee");
  const weekStartDate = parseISODateValue(weekStartISO, "Week start date");
  if (!weekStartDate) throw new Error("Week start date is required.");

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: safeEmployeeId },
    select: { name: true, reportingManagerId: true },
  });

  // 1. Notify employee
  await prisma.notification.create({
    data: {
      employeeId: safeEmployeeId,
      message: `HR asked to fill the timesheet for ${weekStartDate.toISOString().slice(0, 10)}.`,
    },
  });

  // 2. Notify reporting manager
  if (employee.reportingManagerId) {
    await prisma.notification.create({
      data: {
        employeeId: employee.reportingManagerId,
        message: `${employee.name} did not fill the timesheet of previous week.`,
      },
    });
  }

  revalidatePath("/hr");
  revalidatePath("/employee");
}
