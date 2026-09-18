"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { isValidAllocationPercentage } from "@/lib/allocation";
import { parseISODateValue, validateRecordId } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";
import { computeProjectHistory, type ProjectHistoryStint } from "@/lib/project-history";

function parseDate(value: FormDataEntryValue | null): Date | null {
  const str = String(value ?? "").trim();
  return parseISODateValue(str || null, "Date");
}

export type EmployeeTimesheetSummary = {
  id: string;
  weekStartDate: string;
  totalHours: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionComments: string | null;
};

export type EmployeeAllocationDetails = {
  employeeName: string;
  availablePeriods: string[];
  selectedPeriod: string | null;
  timesheets: EmployeeTimesheetSummary[];
  projectHistory: ProjectHistoryStint[];
};

function parseTimesheetPeriod(period: string | undefined) {
  if (!period) return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) throw new Error("Invalid timesheet month.");
  return { year: Number(match[1]), month: Number(match[2]) };
}

export async function getEmployeeAllocationDetails(
  id: string,
  period?: string
): Promise<EmployeeAllocationDetails> {
  await requireRole("TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");
  const requestedPeriod = parseTimesheetPeriod(period);

  const [employee, headers, projectHistory] = await Promise.all([
    prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { name: true },
    }),
    prisma.timesheetHeader.findMany({
      where: { employeeId },
      select: { weekStartDate: true },
      orderBy: { weekStartDate: "desc" },
    }),
    computeProjectHistory(employeeId),
  ]);

  const availablePeriods = Array.from(
    new Set(headers.map((header) => header.weekStartDate.toISOString().slice(0, 7)))
  );
  const selectedPeriod = requestedPeriod
    ? period!
    : availablePeriods[0] ?? null;

  let timesheets: EmployeeTimesheetSummary[] = [];
  if (selectedPeriod) {
    const selected = parseTimesheetPeriod(selectedPeriod)!;
    const start = new Date(Date.UTC(selected.year, selected.month - 1, 1));
    const end = new Date(Date.UTC(selected.year, selected.month, 1));
    const monthHeaders = await prisma.timesheetHeader.findMany({
      where: {
        employeeId,
        weekStartDate: { gte: start, lt: end },
      },
      select: {
        id: true,
        weekStartDate: true,
        totalHours: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        rejectionComments: true,
      },
      orderBy: { weekStartDate: "desc" },
    });
    timesheets = monthHeaders.map((header) => ({
      id: header.id,
      weekStartDate: header.weekStartDate.toISOString().slice(0, 10),
      totalHours: Number(header.totalHours ?? 0),
      status: header.status,
      submittedAt: header.submittedAt?.toISOString() ?? null,
      approvedAt: header.approvedAt?.toISOString() ?? null,
      rejectionComments: header.rejectionComments,
    }));
  }

  return { employeeName: employee.name, availablePeriods, selectedPeriod, timesheets, projectHistory };
}

export async function createAllocation(formData: FormData) {
  const admin = await requireRole("TS_ADMIN");

  const employeeId = validateRecordId(String(formData.get("employeeId") ?? ""), "Employee");
  const projectId = validateRecordId(String(formData.get("projectId") ?? ""), "Project");
  const percentage = Number(formData.get("percentage"));
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));

  if (!startDate) throw new Error("Start date is required");
  if (endDate && endDate < startDate) throw new Error("End date can't be before start date");
  if (!isValidAllocationPercentage(percentage)) {
    throw new Error("Allocation must be between 5% and 100%, in 5% steps");
  }

  // Allow overallocation:
  // const maxExisting = await getMaxOverlapPercentage(employeeId, startDate, endDate);
  // if (maxExisting + percentage > 100) {
  //   throw new Error(
  //     `This would push ${maxExisting + percentage}% allocation on overlapping dates (max is 100%). ` +
  //       `This employee is already allocated ${maxExisting}% during part of this range.`
  //   );
  // }

  const allocation = await prisma.projectAllocation.create({
    data: {
      employeeId,
      projectId,
      allocationPercentage: percentage,
      startDate,
      endDate,
      createdById: admin.id,
    },
  });
  await writeAuditLog({
    actor: admin,
    action: "ALLOCATION_CREATED",
    entity: "ProjectAllocation",
    entityId: allocation.id,
    summary: `${admin.name ?? admin.id} allocated employee ${employeeId} to project ${projectId}.`,
    metadata: { employeeId, projectId, percentage, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? null },
  });

  revalidatePath("/admin/allocations");
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function endAllocationToday(id: string) {
  const actor = await requireRole("TS_ADMIN");
  const allocation = await prisma.projectAllocation.findUnique({
    where: { id: validateRecordId(id, "Allocation") },
  });
  if (!allocation) throw new Error("Allocation not found");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  // Set to yesterday if yesterday >= startDate, otherwise set to startDate.
  const newEndDate = yesterday >= allocation.startDate ? yesterday : allocation.startDate;

  await prisma.projectAllocation.update({
    where: { id: allocation.id },
    data: { endDate: newEndDate },
  });
  await writeAuditLog({
    actor,
    action: "ALLOCATION_ENDED",
    entity: "ProjectAllocation",
    entityId: allocation.id,
    summary: `${actor.name ?? actor.id} ended allocation ${allocation.id}.`,
    metadata: { oldEndDate: allocation.endDate?.toISOString() ?? null, newEndDate: newEndDate.toISOString() },
  });
  revalidatePath("/admin/allocations");
  revalidatePath(`/admin/projects/${allocation.projectId}`);
}

export async function updateAllocation(
  id: string,
  percentageValue: number,
  startDateStr: string,
  endDateStr: string | null
) {
  const actor = await requireRole("TS_ADMIN");
  const allocationId = validateRecordId(id, "Allocation");
  const percentage = Number(percentageValue);

  if (!startDateStr) throw new Error("Start date is required");
  if (!isValidAllocationPercentage(percentage)) {
    throw new Error("Allocation must be between 5% and 100%, in 5% steps");
  }
  const startDate = parseISODateValue(startDateStr, "Start date");
  const endDate = parseISODateValue(endDateStr, "End date");
  if (!startDate) throw new Error("Start date is required");
  if (endDate && endDate < startDate) throw new Error("End date can't be before start date");

  const existing = await prisma.projectAllocation.findUniqueOrThrow({ where: { id: allocationId } });
  let updated;
  try {
    updated = await prisma.projectAllocation.update({
      where: { id: allocationId },
      data: { allocationPercentage: percentage, startDate, endDate },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      throw new Error("This employee already has an allocation to this project starting on that date.");
    }
    throw e;
  }
  await writeAuditLog({
    actor,
    action: "ALLOCATION_UPDATED",
    entity: "ProjectAllocation",
    entityId: allocationId,
    summary: `${actor.name ?? actor.id} updated allocation dates ${allocationId}.`,
    metadata: {
      oldPercentage: existing.allocationPercentage,
      newPercentage: percentage,
      oldStartDate: existing.startDate.toISOString(),
      oldEndDate: existing.endDate?.toISOString() ?? null,
      newStartDate: startDate.toISOString(),
      newEndDate: endDate?.toISOString() ?? null,
    },
  });

  revalidatePath("/admin/allocations");
  revalidatePath(`/admin/projects/${updated.projectId}`);
  revalidatePath("/hr/employees");
  revalidatePath("/employee");
}

export async function deleteAllocation(id: string) {
  const actor = await requireRole("TS_ADMIN");
  const allocation = await prisma.projectAllocation.delete({ where: { id: validateRecordId(id, "Allocation") } });
  await writeAuditLog({
    actor,
    action: "ALLOCATION_DELETED",
    entity: "ProjectAllocation",
    entityId: allocation.id,
    summary: `${actor.name ?? actor.id} deleted allocation ${allocation.id}.`,
    metadata: { employeeId: allocation.employeeId, projectId: allocation.projectId },
  });
  revalidatePath("/admin/allocations");
  revalidatePath(`/admin/projects/${allocation.projectId}`);
}

export async function createBulkAllocations(
  projectId: string,
  startDateStr: string,
  endDateStr: string,
  allocations: { employeeId: string; percentage: number }[]
) {
  const admin = await requireRole("TS_ADMIN");

  const safeProjectId = validateRecordId(projectId, "Project");
  if (!startDateStr) throw new Error("Start date is required");

  const startDate = parseISODateValue(startDateStr, "Start date");
  const endDate = parseISODateValue(endDateStr, "End date");
  if (!startDate) throw new Error("Start date is required");

  if (endDate && endDate < startDate) throw new Error("End date can't be before start date");

  await prisma.$transaction(
    allocations.map((a) => {
      const safeEmployeeId = validateRecordId(a.employeeId, "Employee");
      if (!isValidAllocationPercentage(a.percentage)) {
        throw new Error(`Allocation percentage must be between 5% and 100% (in 5% steps).`);
      }
      return prisma.projectAllocation.create({
        data: {
          employeeId: safeEmployeeId,
          projectId: safeProjectId,
          allocationPercentage: a.percentage,
          startDate,
          endDate,
          createdById: admin.id,
        },
      });
    })
  );
  await writeAuditLog({
    actor: admin,
    action: "BULK_ALLOCATIONS_CREATED",
    entity: "Project",
    entityId: safeProjectId,
    summary: `${admin.name ?? admin.id} created ${allocations.length} allocations for project ${safeProjectId}.`,
    metadata: { allocationCount: allocations.length, startDate: startDate.toISOString(), endDate: endDate?.toISOString() ?? null },
  });

  revalidatePath("/admin/allocations");
  revalidatePath(`/admin/projects/${safeProjectId}`);
}
