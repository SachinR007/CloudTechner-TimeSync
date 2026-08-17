"use server";

import { requireRole } from "@/lib/auth-guards";
import { assertSafeExcelFile, assertSafeSheetRows, assertSafeWorkbook } from "@/lib/excel-security";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as XLSX from "@e965/xlsx";

export async function importHolidaysExcel(formData: FormData) {
  await requireRole("TS_ADMIN", "HR_ADMIN");

  const file = formData.get("file") as File;
  const holidayPlanId = formData.get("holidayPlanId") as string;
  if (!file || file.size === 0) {
    throw new Error("No file uploaded or file is empty.");
  }
  assertSafeExcelFile(file);
  if (!holidayPlanId) {
    throw new Error("No holiday plan selected.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  assertSafeWorkbook(workbook);

  // Find Holiday Details sheet
  const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("holiday"));
  if (!sheetName) {
    throw new Error("Could not find a sheet containing 'Holiday' in the workbook. Sheet names found: " + workbook.SheetNames.join(", "));
  }

  const sheet = workbook.Sheets[sheetName];
  assertSafeSheetRows(sheet);
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Clean rows
  const rows = rawRows.filter(r => r && r.length > 0 && r.some(cell => cell !== null && cell !== undefined && cell !== ""));
  if (rows.length < 2) {
    throw new Error("No data rows found in the sheet.");
  }

  // Scan first few rows for header containing 'Name' and 'Date'
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some(cell => typeof cell === "string" && (cell.toLowerCase() === "name" || cell.toLowerCase() === "date"))) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("Could not find column headers ('Name', 'Date') in the uploaded sheet.");
  }

  const headers = rows[headerRowIdx].map(h => String(h || "").trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  const dateIdx = headers.indexOf("date");
  const floaterIdx = headers.indexOf("is floater leave");
  const specialIdx = headers.indexOf("special holiday");

  if (nameIdx === -1 || dateIdx === -1) {
    throw new Error("The Excel sheet must contain 'Name' and 'Date' columns.");
  }

  const holidaysToUpsert: { name: string; date: Date; isFloaterLeave: boolean; specialHoliday: boolean }[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length <= Math.max(nameIdx, dateIdx)) continue;
    
    const name = String(row[nameIdx] || "").trim();
    const rawDate = row[dateIdx];
    if (!name || rawDate === null || rawDate === undefined || rawDate === "") continue;

    let parsedDate: Date;
    if (typeof rawDate === "number") {
      parsedDate = new Date((rawDate - 25569) * 86400 * 1000);
    } else {
      parsedDate = new Date(String(rawDate).trim());
    }

    if (isNaN(parsedDate.getTime())) {
      continue;
    }

    const utcDate = new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()));

    const isFloater = floaterIdx !== -1 ? String(row[floaterIdx] || "").trim().toLowerCase() === "yes" : false;
    const isSpecial = specialIdx !== -1 ? String(row[specialIdx] || "").trim().toLowerCase() === "yes" : false;

    holidaysToUpsert.push({
      name,
      date: utcDate,
      isFloaterLeave: isFloater,
      specialHoliday: isSpecial,
    });
  }

  if (holidaysToUpsert.length === 0) {
    throw new Error("No valid holiday records found in the sheet.");
  }

  let insertedCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const hol of holidaysToUpsert) {
      await tx.holiday.deleteMany({
        where: {
          holidayPlanId,
          date: hol.date,
        },
      });
      await tx.holiday.create({
        data: {
          name: hol.name,
          date: hol.date,
          isFloaterLeave: hol.isFloaterLeave,
          specialHoliday: hol.specialHoliday,
          holidayPlanId,
        },
      });
      insertedCount++;
    }
  });

  revalidatePath("/hr/holidays");
  revalidatePath("/employee");

  return { count: insertedCount };
}

export async function addHolidayManual(
  name: string,
  dateStr: string,
  isFloaterLeave: boolean,
  specialHoliday: boolean,
  holidayPlanId: string
) {
  await requireRole("TS_ADMIN", "HR_ADMIN");

  if (!holidayPlanId) {
    throw new Error("No holiday plan selected.");
  }

  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime())) {
    throw new Error("Invalid date provided.");
  }

  const utcDate = new Date(Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()));

  await prisma.holiday.deleteMany({
    where: {
      holidayPlanId,
      date: utcDate,
    },
  });

  await prisma.holiday.create({
    data: {
      name,
      date: utcDate,
      isFloaterLeave,
      specialHoliday,
      holidayPlanId,
    },
  });

  revalidatePath("/hr/holidays");
  revalidatePath("/employee");
}

export async function deleteHoliday(id: string) {
  await requireRole("TS_ADMIN", "HR_ADMIN");
  await prisma.holiday.delete({ where: { id } });
  revalidatePath("/hr/holidays");
  revalidatePath("/employee");
}

export async function createHolidayPlan(name: string) {
  await requireRole("TS_ADMIN", "HR_ADMIN");
  if (!name.trim()) throw new Error("Plan name cannot be empty.");
  
  const existing = await prisma.holidayPlan.findUnique({
    where: { name: name.trim() },
  });
  if (existing) throw new Error("A holiday plan with this name already exists.");

  const plan = await prisma.holidayPlan.create({
    data: { name: name.trim() },
  });
  
  revalidatePath("/hr/holidays");
  return plan;
}

export async function assignEmployeesToPlan(planId: string, employeeIds: string[]) {
  await requireRole("TS_ADMIN", "HR_ADMIN");

  // Update chosen employees' holidayPlanId to this plan
  await prisma.employee.updateMany({
    where: {
      id: { in: employeeIds },
    },
    data: {
      holidayPlanId: planId,
    },
  });

  revalidatePath("/hr/holidays");
  revalidatePath("/employee");
}
