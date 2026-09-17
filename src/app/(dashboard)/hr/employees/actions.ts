"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import bcrypt from "bcryptjs";
import { EmployeeRole } from "@prisma/client";
import { computeProjectHistory, type ProjectHistoryStint } from "@/lib/project-history";
import {
  formString,
  optionalRecordId,
  requireString,
  validateBoolean,
  validateEmail,
  validateEnum,
  validateRecordId,
  validateSafeDisplayText,
} from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";

const MIN_PASSWORD_LENGTH = 8;
const EMPLOYEE_ROLE_VALUES = ["EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN"] as const;

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must contain at least one letter and one number.");
  }
}

export async function createEmployee(formData: FormData) {
  const actor = await requireRole("HR_ADMIN", "TS_ADMIN");

  const id = validateRecordId(requireString(formData, "id", "Employee ID", { max: 32 }), "Employee ID");

  // Check if ID is already in use
  const existingId = await prisma.employee.findUnique({ where: { id } });
  if (existingId) throw new Error(`Employee ID ${id} is already in use`);

  const name = validateSafeDisplayText(requireString(formData, "name", "Employee name", { max: 160 }), "Employee name", 160);

  const email = validateEmail(requireString(formData, "email", "Employee email", { max: 254 }));

  // Check if email is already in use
  const existingEmail = await prisma.employee.findUnique({ where: { email } });
  if (existingEmail) throw new Error(`Email ${email} is already in use`);

  const role = validateEnum(formString(formData, "role"), EMPLOYEE_ROLE_VALUES, "EMPLOYEE", "Employee role") as EmployeeRole;

  const phone = formString(formData, "phone", { max: 32 });
  const title = formString(formData, "title", { max: 120 });
  const reportingManagerId = optionalRecordId(formString(formData, "reportingManagerId"), "Reporting manager");
  if (!reportingManagerId || reportingManagerId === "none") {
    throw new Error("Reporting Manager is required");
  }
  const approverOverrideId = optionalRecordId(formString(formData, "approverOverrideId"), "Approver override");
  const canSubmitTimesheet = formData.get("canSubmitTimesheet") === "on";
  const password = formString(formData, "password", { max: 128 });
  if (!password) throw new Error("Login password is required.");
  validatePassword(password);

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.employee.create({
    data: {
      id,
      name,
      email,
      phone,
      title,
      role,
      reportingManagerId,
      approverOverrideId,
      passwordHash,
      isActive: true,
      canSubmitTimesheet,
    },
  });
  await writeAuditLog({
    actor,
    action: "EMPLOYEE_CREATED",
    entity: "Employee",
    entityId: id,
    summary: `${actor.name ?? actor.id} created employee ${name}.`,
    metadata: { email, role, reportingManagerId, approverOverrideId, canSubmitTimesheet },
  });

  revalidatePath("/hr/employees");
}

export async function toggleEmployeeActive(id: string, isActive: boolean) {
  const actor = await requireRole("HR_ADMIN", "TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");
  const active = validateBoolean(isActive, "Employee status");

  // Prevent HR admin from deactivating themselves
  if (actor.id === employeeId && !active) {
    throw new Error("You cannot deactivate your own profile.");
  }

  const existing = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { name: true, isActive: true, role: true },
  });

  await prisma.employee.update({
    where: { id: employeeId },
    data: { isActive: active },
  });
  await writeAuditLog({
    actor,
    action: active ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED",
    entity: "Employee",
    entityId: employeeId,
    summary: `${actor.name ?? actor.id} changed ${existing.name} active status from ${existing.isActive} to ${active}.`,
    metadata: { oldIsActive: existing.isActive, newIsActive: active, role: existing.role },
  });

  revalidatePath("/hr/employees");
}

export async function toggleEmployeeTimesheetAccess(id: string, canSubmitTimesheet: boolean) {
  const actor = await requireRole("HR_ADMIN", "TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");
  const access = validateBoolean(canSubmitTimesheet, "Timesheet access");

  const existing = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { name: true, role: true, canSubmitTimesheet: true },
  });

  await prisma.employee.update({
    where: { id: employeeId },
    data: { canSubmitTimesheet: access },
  });

  await writeAuditLog({
    actor,
    action: access ? "TIMESHEET_ACCESS_ENABLED" : "TIMESHEET_ACCESS_DISABLED",
    entity: "Employee",
    entityId: employeeId,
    summary: `${actor.name ?? actor.id} changed ${existing.name} timesheet access from ${existing.canSubmitTimesheet} to ${access}.`,
    metadata: { oldCanSubmitTimesheet: existing.canSubmitTimesheet, newCanSubmitTimesheet: access, role: existing.role },
  });

  revalidatePath("/hr/employees");
  revalidatePath("/employee");
}

// Project history for the HR Employees dialog -- computed from actual timesheet
// entries (contiguous stints), same source as the employee's own Project History
// tab. See src/lib/project-history.ts.
export type ProjectHistoryEntry = ProjectHistoryStint;

export async function getEmployeeProjectHistory(employeeId: string): Promise<ProjectHistoryEntry[]> {
  await requireRole("HR_ADMIN", "TS_ADMIN");
  return computeProjectHistory(validateRecordId(employeeId, "Employee"));
}

export type EmployeeTimesheetSubmission = {
  id: string;
  weekStartDate: string;
  totalHours: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionComments: string | null;
};

export type EmployeeHistoryDetails = {
  employeeName: string;
  availablePeriods: string[];
  selectedPeriod: string | null;
  timesheets: EmployeeTimesheetSubmission[];
  projectHistory: ProjectHistoryEntry[];
};

function parseTimesheetPeriod(period: string | undefined) {
  if (!period) return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) throw new Error("Invalid timesheet month.");
  return { year: Number(match[1]), month: Number(match[2]) };
}

export async function getEmployeeHistoryDetails(
  id: string,
  period?: string
): Promise<EmployeeHistoryDetails> {
  await requireRole("HR_ADMIN", "TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");
  const requestedPeriod = parseTimesheetPeriod(period);

  const [employee, headers, projectHistory] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { name: true } }),
    prisma.timesheetHeader.findMany({
      where: { employeeId },
      select: { weekStartDate: true },
      orderBy: { weekStartDate: "desc" },
    }),
    computeProjectHistory(employeeId),
  ]);

  const availablePeriods = Array.from(new Set(headers.map((header) => header.weekStartDate.toISOString().slice(0, 7))));
  const selectedPeriod = requestedPeriod ? period! : availablePeriods[0] ?? null;

  let timesheets: EmployeeTimesheetSubmission[] = [];
  if (selectedPeriod) {
    const selected = parseTimesheetPeriod(selectedPeriod)!;
    const start = new Date(Date.UTC(selected.year, selected.month - 1, 1));
    const end = new Date(Date.UTC(selected.year, selected.month, 1));
    const monthHeaders = await prisma.timesheetHeader.findMany({
      where: { employeeId, weekStartDate: { gte: start, lt: end } },
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

export async function updateEmployee(id: string, formData: FormData) {
  const actor = await requireRole("HR_ADMIN", "TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");
  const existing = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: {
      name: true,
      role: true,
      phone: true,
      title: true,
      reportingManagerId: true,
      approverOverrideId: true,
      isActive: true,
      canSubmitTimesheet: true,
    },
  });

  const name = validateSafeDisplayText(requireString(formData, "name", "Employee name", { max: 160 }), "Employee name", 160);

  const role = validateEnum(formString(formData, "role"), EMPLOYEE_ROLE_VALUES, "EMPLOYEE", "Employee role") as EmployeeRole;

  const phone = formString(formData, "phone", { max: 32 });
  const title = formString(formData, "title", { max: 120 });

  const reportingManagerId = optionalRecordId(formString(formData, "reportingManagerId"), "Reporting manager");
  if (!reportingManagerId || reportingManagerId === "none") {
    throw new Error("Reporting Manager is required");
  }

  const approverOverrideId = optionalRecordId(formString(formData, "approverOverrideId"), "Approver override");
  const canSubmitTimesheet = formData.get("canSubmitTimesheet") === "on";
  const password = formString(formData, "password", { max: 128 });

  const updateData: any = {
    name,
    role,
    phone,
    title,
    reportingManagerId,
    approverOverrideId,
    canSubmitTimesheet,
  };

  if (password && password.trim() !== "") {
    validatePassword(password.trim());
    updateData.passwordHash = await bcrypt.hash(password.trim(), 10);
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: updateData,
  });
  await writeAuditLog({
    actor,
    action: "EMPLOYEE_UPDATED",
    entity: "Employee",
    entityId: employeeId,
    summary: `${actor.name ?? actor.id} updated employee ${existing.name}.`,
    metadata: {
      old: existing,
      new: {
        name,
        role,
        phone,
        title,
        reportingManagerId,
        approverOverrideId,
        canSubmitTimesheet,
        passwordChanged: Boolean(password && password.trim() !== ""),
      },
    },
  });

  revalidatePath("/hr/employees");
}
