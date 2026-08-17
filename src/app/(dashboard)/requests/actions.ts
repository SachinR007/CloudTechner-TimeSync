"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { parseISODateValue, validateBoundedText, validateRecordId, validateSafeDisplayText } from "@/lib/validation";
import { isValidAllocationPercentage } from "@/lib/allocation";
import { writeAuditLog } from "@/lib/audit";
import { assertRateLimit } from "@/lib/rate-limit";

export async function submitAllocationRequest(
  message: string
) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  assertRateLimit(`allocation-request:${user.id}`, {
    limit: 3,
    windowMs: 10 * 60 * 1000,
    label: "Allocation request",
  });
  const safeMessage = message.trim() ? validateSafeDisplayText(message, "Message", 1000) : null;

  const existingPending = await prisma.allocationRequest.findFirst({
    where: { employeeId: user.id, status: "PENDING" },
    select: { id: true, createdAt: true },
  });
  if (existingPending) {
    throw new Error("You already have a pending allocation request. Please wait for admin review before submitting another.");
  }

  // Create allocation request
  const request = await prisma.allocationRequest.create({
    data: {
      employeeId: user.id,
      projectId: null,
      allocationPercentage: 100,
      message: safeMessage,
      status: "PENDING",
    },
  });
  await writeAuditLog({
    actor: user,
    action: "ALLOCATION_REQUEST_SUBMITTED",
    entity: "AllocationRequest",
    entityId: request.id,
    summary: `${user.name ?? user.id} submitted an allocation request.`,
    metadata: { message: safeMessage },
  });

  revalidatePath("/requests");
}

export async function approveAllocationRequest(
  requestId: string,
  projectId: string,
  startDateStr: string,
  endDateStr: string | null,
  allocationPercentage: number
) {
  const user = await requireRole("TS_ADMIN", "HR_ADMIN");
  assertRateLimit(`allocation-approve:${user.id}`, {
    limit: 30,
    windowMs: 10 * 60 * 1000,
    label: "Allocation approval",
  });
  const safeRequestId = validateRecordId(requestId, "Allocation request");
  const safeProjectId = validateRecordId(projectId, "Project");
  const startDate = parseISODateValue(startDateStr, "Start date");
  const endDate = parseISODateValue(endDateStr, "End date");
  if (!startDate) throw new Error("Start date is required.");
  if (endDate && endDate < startDate) throw new Error("End date can't be before start date.");
  if (!isValidAllocationPercentage(allocationPercentage)) {
    throw new Error("Allocation must be between 5% and 100%, in 5% steps.");
  }

  const request = await prisma.allocationRequest.findUnique({
    where: { id: safeRequestId },
    include: {
      employee: { select: { name: true } },
    },
  });

  if (!request) {
    throw new Error("Request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("Request has already been processed.");
  }

  const approvedProject = await prisma.project.findUnique({
    where: { id: safeProjectId },
    select: { name: true },
  });
  if (!approvedProject) {
    throw new Error("Selected project not found.");
  }

  // Run in transaction to guarantee consistency
  await prisma.$transaction([
    // Update request status, and link the project/percentage determined by admin
    prisma.allocationRequest.update({
      where: { id: safeRequestId },
      data: { 
        status: "APPROVED",
        projectId: safeProjectId,
        allocationPercentage,
      },
    }),
    // Create project allocation
    prisma.projectAllocation.create({
      data: {
        projectId: safeProjectId,
        employeeId: request.employeeId,
        allocationPercentage,
        startDate,
        endDate,
        createdById: user.id,
      },
    }),
    // Create notification for employee
    prisma.notification.create({
      data: {
        employeeId: request.employeeId,
        message: `Allocation Approved: You have been allocated to the project "${approvedProject.name}" (${allocationPercentage}%) starting ${startDateStr}${endDateStr ? ` until ${endDateStr}` : ""}.`,
      },
    }),
  ]);
  await writeAuditLog({
    actor: user,
    action: "ALLOCATION_REQUEST_APPROVED",
    entity: "AllocationRequest",
    entityId: safeRequestId,
    summary: `${user.name ?? user.id} approved allocation request for ${request.employee.name}.`,
    metadata: {
      employeeId: request.employeeId,
      projectId: safeProjectId,
      allocationPercentage,
      startDate: startDateStr,
      endDate: endDateStr,
    },
  });

  revalidatePath("/requests");
  revalidatePath("/employee");
}

export async function rejectAllocationRequest(requestId: string, comment?: string) {
  const user = await requireRole("TS_ADMIN", "HR_ADMIN");
  assertRateLimit(`allocation-reject:${user.id}`, {
    limit: 30,
    windowMs: 10 * 60 * 1000,
    label: "Allocation rejection",
  });
  const safeRequestId = validateRecordId(requestId, "Allocation request");
  const safeComment = comment?.trim() ? validateBoundedText(comment, "Comment", 1000) : null;

  const request = await prisma.allocationRequest.findUnique({
    where: { id: safeRequestId },
    include: {
      project: { select: { name: true } },
    },
  });

  if (!request) {
    throw new Error("Request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("Request has already been processed.");
  }

  const projectName = request.project?.name ?? "allocation";

  await prisma.$transaction([
    prisma.allocationRequest.update({
      where: { id: safeRequestId },
      data: { status: "REJECTED" },
    }),
    prisma.notification.create({
      data: {
        employeeId: request.employeeId,
        message: `Allocation Rejected: Your request for "${projectName}" was declined.${safeComment ? ` Reason: ${safeComment}` : ""}`,
      },
    }),
  ]);
  await writeAuditLog({
    actor: user,
    action: "ALLOCATION_REQUEST_REJECTED",
    entity: "AllocationRequest",
    entityId: safeRequestId,
    summary: `${user.name ?? user.id} rejected allocation request ${safeRequestId}.`,
    metadata: { employeeId: request.employeeId, comment: safeComment },
  });

  revalidatePath("/requests");
}

export async function dismissNotification(notificationId: string) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");

  await prisma.notification.updateMany({
    where: { id: validateRecordId(notificationId, "Notification"), employeeId: user.id },
    data: { isRead: true },
  });

  revalidatePath("/employee");
  revalidatePath("/requests");
}

export async function dismissAllNotifications() {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");

  await prisma.notification.updateMany({
    where: { employeeId: user.id, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/employee");
  revalidatePath("/requests");
}
