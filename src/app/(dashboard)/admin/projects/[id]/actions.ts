"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { formString, parseISODateValue, requireString, validateBoolean, validateRecordId } from "@/lib/validation";

export async function createTask(projectId: string, formData: FormData) {
  await requireRole("TS_ADMIN");
  const safeProjectId = validateRecordId(projectId, "Project");
  const name = requireString(formData, "name", "Task name", { max: 160 });

  const startDate = parseISODateValue(formString(formData, "startDate", { max: 10 }), "Start date");
  const endDate = parseISODateValue(formString(formData, "endDate", { max: 10 }), "End date");
  if (startDate && endDate && endDate < startDate) throw new Error("End date can't be before start date");

  await prisma.task.create({
    data: {
      projectId: safeProjectId,
      name,
      startDate,
      endDate,
    },
  });
  revalidatePath(`/admin/projects/${safeProjectId}`);
}

export async function updateTask(id: string, formData: FormData) {
  await requireRole("TS_ADMIN");
  const taskId = validateRecordId(id, "Task");
  const name = requireString(formData, "name", "Task name", { max: 160 });

  const startDate = parseISODateValue(formString(formData, "startDate", { max: 10 }), "Start date");
  const endDate = parseISODateValue(formString(formData, "endDate", { max: 10 }), "End date");
  if (startDate && endDate && endDate < startDate) throw new Error("End date can't be before start date");

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      name,
      startDate,
      endDate,
    },
  });
  revalidatePath(`/admin/projects/${task.projectId}`);
}

export async function toggleTaskActive(id: string, isActive: boolean) {
  await requireRole("TS_ADMIN");
  const task = await prisma.task.update({
    where: { id: validateRecordId(id, "Task") },
    data: { isActive: validateBoolean(isActive, "Task status") },
  });
  revalidatePath(`/admin/projects/${task.projectId}`);
}
