"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { parseISODateValue, validateBoundedText, validateRecordId } from "@/lib/validation";
import { isValidAllocationPercentage } from "@/lib/allocation";

export async function submitAllocationRequest(
  message: string
) {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");
  const safeMessage = message.trim() ? validateBoundedText(message, "Message", 1000) : null;

  // Create allocation request
  await prisma.allocationRequest.create({
    data: {
      employeeId: user.id,
      projectId: null,
      allocationPercentage: 100,
      message: safeMessage,
      status: "PENDING",
    },
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

  revalidatePath("/requests");
  revalidatePath("/employee");
}

export async function rejectAllocationRequest(requestId: string, comment?: string) {
  const user = await requireRole("TS_ADMIN", "HR_ADMIN");
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
