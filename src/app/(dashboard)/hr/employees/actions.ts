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
} from "@/lib/validation";

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
  await requireRole("HR_ADMIN", "TS_ADMIN");

  const id = validateRecordId(requireString(formData, "id", "Employee ID", { max: 32 }), "Employee ID");

  // Check if ID is already in use
  const existingId = await prisma.employee.findUnique({ where: { id } });
  if (existingId) throw new Error(`Employee ID ${id} is already in use`);

  const name = requireString(formData, "name", "Employee name", { max: 160 });

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
    },
  });

  revalidatePath("/hr/employees");
}

export async function toggleEmployeeActive(id: string, isActive: boolean) {
  await requireRole("HR_ADMIN", "TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");
  const active = validateBoolean(isActive, "Employee status");

  // Prevent HR admin from deactivating themselves
  const sessionUser = await requireRole("HR_ADMIN", "TS_ADMIN");
  if (sessionUser.id === employeeId && !active) {
    throw new Error("You cannot deactivate your own profile.");
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { isActive: active },
  });

  revalidatePath("/hr/employees");
}

// Project history for the HR Employees dialog -- computed from actual timesheet
// entries (contiguous stints), same source as the employee's own Project History
// tab. See src/lib/project-history.ts.
export type ProjectHistoryEntry = ProjectHistoryStint;

export async function getEmployeeProjectHistory(employeeId: string): Promise<ProjectHistoryEntry[]> {
  await requireRole("HR_ADMIN", "TS_ADMIN");
  return computeProjectHistory(validateRecordId(employeeId, "Employee"));
}

export async function updateEmployee(id: string, formData: FormData) {
  await requireRole("HR_ADMIN", "TS_ADMIN");
  const employeeId = validateRecordId(id, "Employee");

  const name = requireString(formData, "name", "Employee name", { max: 160 });

  const role = validateEnum(formString(formData, "role"), EMPLOYEE_ROLE_VALUES, "EMPLOYEE", "Employee role") as EmployeeRole;

  const phone = formString(formData, "phone", { max: 32 });
  const title = formString(formData, "title", { max: 120 });

  const reportingManagerId = optionalRecordId(formString(formData, "reportingManagerId"), "Reporting manager");
  if (!reportingManagerId || reportingManagerId === "none") {
    throw new Error("Reporting Manager is required");
  }

  const approverOverrideId = optionalRecordId(formString(formData, "approverOverrideId"), "Approver override");
  const password = formString(formData, "password", { max: 128 });

  const updateData: any = {
    name,
    role,
    phone,
    title,
    reportingManagerId,
    approverOverrideId,
  };

  if (password && password.trim() !== "") {
    validatePassword(password.trim());
    updateData.passwordHash = await bcrypt.hash(password.trim(), 10);
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: updateData,
  });

  revalidatePath("/hr/employees");
}
