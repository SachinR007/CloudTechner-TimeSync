"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import type { Prisma } from "@prisma/client";
import { validateRecordId, validateSafeDisplayText } from "@/lib/validation";

// Recompute the parent week's status from its per-project approval slices:
// REJECTED if any slice is rejected; APPROVED once every slice is approved;
// otherwise still SUBMITTED (partially approved).
async function rollupHeaderStatus(tx: Prisma.TransactionClient, timesheetHeaderId: string) {
  const slices = await tx.timesheetApproval.findMany({
    where: { timesheetHeaderId },
    select: { status: true, comments: true },
  });
  let status: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED";
  if (slices.some((s) => s.status === "REJECTED")) status = "REJECTED";
  else if (slices.length > 0 && slices.every((s) => s.status === "APPROVED")) status = "APPROVED";

  await tx.timesheetHeader.update({
    where: { id: timesheetHeaderId },
    data: {
      status,
      approvedAt: status === "APPROVED" ? new Date() : null,
      rejectionComments: status === "REJECTED" ? slices.find((s) => s.status === "REJECTED")?.comments ?? null : null,
    },
  });
}

// Approve one project's slice of a submitted week.
export async function approveProjectApproval(approvalId: string) {
  const manager = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  const safeApprovalId = validateRecordId(approvalId, "Approval");

  const approval = await prisma.timesheetApproval.findUniqueOrThrow({
    where: { id: safeApprovalId },
    include: {
      timesheetHeader: { select: { id: true, employeeId: true, isLate: true, lateApproved: true } },
    },
  });
  if (approval.approverId !== manager.id) throw new Error("You are not the assigned approver for this project.");
  if (approval.timesheetHeader.employeeId === manager.id) throw new Error("You can't approve your own timesheet.");
  if (approval.timesheetHeader.isLate && !approval.timesheetHeader.lateApproved) {
    throw new Error("This late submission must be approved by HR before manager review.");
  }
  if (approval.status !== "PENDING") throw new Error(`This project slice is already ${approval.status.toLowerCase()}.`);

  await prisma.$transaction(async (tx) => {
    await tx.timesheetApproval.update({
      where: { id: safeApprovalId },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await tx.approvalHistory.create({
      data: { timesheetHeaderId: approval.timesheetHeader.id, actorId: manager.id, action: "APPROVED", comments: "Project slice approved" },
    });
    await rollupHeaderStatus(tx, approval.timesheetHeader.id);
  });

  revalidatePath("/manager");
  revalidatePath("/employee");
  revalidatePath("/hr");
}

/** Approve a deliberately selected set of still-pending project slices atomically. */
export async function approveProjectApprovals(approvalIds: string[]) {
  const manager = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  if (!Array.isArray(approvalIds) || approvalIds.length === 0 || approvalIds.length > 100) {
    throw new Error("Select between 1 and 100 pending timesheets to approve.");
  }
  const ids = [...new Set(approvalIds.map((id) => validateRecordId(id, "Approval")))];
  const approvals = await prisma.timesheetApproval.findMany({
    where: { id: { in: ids } },
    include: { timesheetHeader: { select: { id: true, employeeId: true, isLate: true, lateApproved: true } } },
  });
  if (approvals.length !== ids.length) throw new Error("One or more selected approvals no longer exist.");
  for (const approval of approvals) {
    if (approval.approverId !== manager.id || approval.timesheetHeader.employeeId === manager.id ||
      (approval.timesheetHeader.isLate && !approval.timesheetHeader.lateApproved) || approval.status !== "PENDING") {
      throw new Error("One or more selected approvals are no longer eligible. Refresh and try again.");
    }
  }
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    for (const approval of approvals) {
      await tx.timesheetApproval.update({ where: { id: approval.id }, data: { status: "APPROVED", approvedAt: now } });
      await tx.approvalHistory.create({ data: { timesheetHeaderId: approval.timesheetHeader.id, actorId: manager.id, action: "APPROVED", comments: "Project slice approved in bulk" } });
      await rollupHeaderStatus(tx, approval.timesheetHeader.id);
    }
  });
  revalidatePath("/manager"); revalidatePath("/employee"); revalidatePath("/hr");
  return { approvedCount: approvals.length };
}

// Reject one project's slice (rejects the whole week back to the employee).
export async function rejectProjectApproval(approvalId: string, comments: string) {
  const manager = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  const safeApprovalId = validateRecordId(approvalId, "Approval");
  const safeComments = validateSafeDisplayText(comments, "Rejection comments", 1000);

  const approval = await prisma.timesheetApproval.findUniqueOrThrow({
    where: { id: safeApprovalId },
    include: {
      timesheetHeader: { select: { id: true, employeeId: true, isLate: true, lateApproved: true } },
    },
  });
  if (approval.approverId !== manager.id) throw new Error("You are not the assigned approver for this project.");
  if (approval.timesheetHeader.employeeId === manager.id) throw new Error("You can't reject your own timesheet.");
  if (approval.timesheetHeader.isLate && !approval.timesheetHeader.lateApproved) {
    throw new Error("This late submission must be approved by HR before manager review.");
  }
  if (approval.status !== "PENDING") throw new Error(`This project slice is already ${approval.status.toLowerCase()}.`);

  await prisma.$transaction(async (tx) => {
    await tx.timesheetApproval.update({
      where: { id: safeApprovalId },
      data: { status: "REJECTED", comments: safeComments },
    });
    await tx.approvalHistory.create({
      data: { timesheetHeaderId: approval.timesheetHeader.id, actorId: manager.id, action: "REJECTED", comments: safeComments },
    });
    await rollupHeaderStatus(tx, approval.timesheetHeader.id);
  });

  revalidatePath("/manager");
  revalidatePath("/employee");
  revalidatePath("/hr");
}

