"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import type { BillingModel, ProjectStatus, CommentsCriteria } from "@prisma/client";
import {
  formString,
  optionalRecordId,
  parseDecimalFromForm,
  parseISODateFromForm,
  requireString,
  validateBoolean,
  validateEnum,
  validateRecordId,
} from "@/lib/validation";

const DEFAULT_TASK_TEMPLATE = ["Project work", "Project work - WFH", "Project work - Client", "Training"];

const PROJECT_STATUS_VALUES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];
const BILLING_MODEL_VALUES = ["TIME_AND_MATERIAL", "FIXED_FEE", "RETAINER", "NON_BILLABLE"];
const COMMENTS_CRITERIA_VALUES = ["NOT_REQUIRED", "COMPULSORY", "LESS_THAN_8_HOURS", "MORE_THAN_8_HOURS"];

export async function createProject(formData: FormData) {
  await requireRole("TS_ADMIN");

  const clientId = validateRecordId(requireString(formData, "clientId", "Client"), "Client");
  const name = requireString(formData, "name", "Project name", { max: 160 });
  const code = formString(formData, "code", { max: 32 });

  if (code) {
    const existing = await prisma.project.findUnique({ where: { code } });
    if (existing) throw new Error(`Project code ${code} is already in use`);
  }

  const status = validateEnum(formString(formData, "status"), PROJECT_STATUS_VALUES, "IN_PROGRESS", "Project status") as ProjectStatus;

  const billingModel = validateEnum(
    formString(formData, "billingModel"),
    BILLING_MODEL_VALUES,
    "TIME_AND_MATERIAL",
    "Billing model"
  ) as BillingModel;

  const commentsCriteria = validateEnum(
    formString(formData, "commentsCriteria"),
    COMMENTS_CRITERIA_VALUES,
    "COMPULSORY",
    "Comments criteria"
  ) as CommentsCriteria;

  const startDate = parseISODateFromForm(formData, "startDate", "Start date");
  const endDate = parseISODateFromForm(formData, "endDate", "End date");
  if (startDate && endDate && endDate < startDate) {
    throw new Error("End date can't be before start date");
  }

  await prisma.project.create({
    data: {
      clientId,
      name,
      code,
      status,
      projectManagerId: optionalRecordId(formString(formData, "projectManagerId"), "Project manager"),
      description: formString(formData, "description", { max: 2000 }),
      startDate,
      endDate,
      costBudget: parseDecimalFromForm(formData, "costBudget", "Cost budget", { min: 0 }),
      hoursBudget: parseDecimalFromForm(formData, "hoursBudget", "Hours budget", { min: 0 }),
      billingModel,
      commentsCriteria,
      linkExpenses: formData.get("linkExpenses") === "on",
      tasks: {
        create: DEFAULT_TASK_TEMPLATE.map((taskName) => ({
          name: taskName,
          isDefaultTemplate: true,
          startDate,
          endDate,
        })),
      },
    },
  });

  revalidatePath("/admin/projects");
}

export async function toggleProjectActive(id: string, isActive: boolean) {
  await requireRole("TS_ADMIN");
  await prisma.project.update({ where: { id: validateRecordId(id, "Project") }, data: { isActive: validateBoolean(isActive, "Project status") } });
  revalidatePath("/admin/projects");
}

export async function updateProject(id: string, formData: FormData) {
  const admin = await requireRole("TS_ADMIN");

  const projectId = validateRecordId(id, "Project");
  const name = requireString(formData, "name", "Project name", { max: 160 });

  const status = validateEnum(formString(formData, "status"), PROJECT_STATUS_VALUES, "IN_PROGRESS", "Project status") as ProjectStatus;

  const billingModel = validateEnum(
    formString(formData, "billingModel"),
    BILLING_MODEL_VALUES,
    "TIME_AND_MATERIAL",
    "Billing model"
  ) as BillingModel;

  const commentsCriteria = validateEnum(
    formString(formData, "commentsCriteria"),
    COMMENTS_CRITERIA_VALUES,
    "COMPULSORY",
    "Comments criteria"
  ) as CommentsCriteria;

  const startDate = parseISODateFromForm(formData, "startDate", "Start date");
  const endDate = parseISODateFromForm(formData, "endDate", "End date");
  if (startDate && endDate && endDate < startDate) {
    throw new Error("End date can't be before start date");
  }

  const existingProject = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  let descriptionAppend = "";
  if (endDate) {
    const oldEndStr = existingProject.endDate ? existingProject.endDate.toISOString().slice(0, 10) : "Open";
    const newEndStr = endDate.toISOString().slice(0, 10);
    if (oldEndStr !== newEndStr) {
      const timestamp = new Date().toLocaleString("en-US");
      descriptionAppend = `\n[Log: End date extended from ${oldEndStr} to ${newEndStr} by ${admin.name} on ${timestamp}]`;

      // Extend default allocations matching old end date
      await prisma.projectAllocation.updateMany({
        where: {
          projectId: id,
          endDate: existingProject.endDate,
        },
        data: {
          endDate: endDate,
        },
      });

      // Extend default tasks
      await prisma.task.updateMany({
        where: {
          projectId: id,
          isDefaultTemplate: true,
        },
        data: {
          endDate: endDate,
        },
      });
    }
  }

  const currentDesc = formString(formData, "description", { max: 2000 }) ?? "";
  const finalDesc = currentDesc + descriptionAppend;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      status,
      projectManagerId: optionalRecordId(formString(formData, "projectManagerId"), "Project manager"),
      description: finalDesc || null,
      startDate,
      endDate,
      costBudget: parseDecimalFromForm(formData, "costBudget", "Cost budget", { min: 0 }),
      hoursBudget: parseDecimalFromForm(formData, "hoursBudget", "Hours budget", { min: 0 }),
      billingModel,
      commentsCriteria,
      linkExpenses: formData.get("linkExpenses") === "on",
    },
  });

  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${projectId}`);
}
