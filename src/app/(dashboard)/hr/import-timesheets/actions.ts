"use server";

import { requireRole } from "@/lib/auth-guards";
import { assertSafeExcelFile } from "@/lib/excel-security";
import { revalidatePath } from "next/cache";
import {
  buildPreviewReport,
  writeImport,
  fetchImportHistory,
  fetchAllEmployeesForExport,
  fetchExportYearRange,
  buildExportRows,
  type ImportPreviewResult,
  type ImportPreviewReport,
  type ParsedTimesheetRow,
  type ImportedRowDetail,
  type ImportRunSummary,
  type EmployeeOption,
  type ExportRow,
} from "./import-timesheet-logic";

export async function previewTimesheetImport(formData: FormData): Promise<ImportPreviewResult> {
  await requireRole("TS_ADMIN", "HR_ADMIN");

  const file = formData.get("file") as File;
  if (!file || file.size === 0) {
    throw new Error("No file uploaded or file is empty.");
  }
  assertSafeExcelFile(file);

  const buffer = await file.arrayBuffer();
  return buildPreviewReport(buffer);
}

export async function commitTimesheetImport(
  fileName: string,
  report: ImportPreviewReport,
  rows: ParsedTimesheetRow[]
): Promise<{ headersCreated: number; linesCreated: number; importedByName: string; rowsWithOutcome: ImportedRowDetail[] }> {
  const user = await requireRole("TS_ADMIN", "HR_ADMIN");

  const result = await writeImport(fileName, report, rows, user.id);

  revalidatePath("/hr/import-timesheets");
  revalidatePath("/employee");
  revalidatePath("/manager");
  revalidatePath("/admin/allocations");
  revalidatePath("/admin/history");

  return { ...result, importedByName: user.name ?? "Unknown" };
}

export async function getImportHistory(): Promise<ImportRunSummary[]> {
  await requireRole("TS_ADMIN", "HR_ADMIN");
  return fetchImportHistory();
}

export async function getEmployeesForExport(): Promise<EmployeeOption[]> {
  await requireRole("TS_ADMIN", "HR_ADMIN");
  return fetchAllEmployeesForExport();
}

export async function getExportYearRange(): Promise<{ minYear: number; maxYear: number }> {
  await requireRole("TS_ADMIN", "HR_ADMIN");
  return fetchExportYearRange();
}

export async function exportTimesheets(params: {
  employeeIds: string[];
  year: number;
  month: number | null;
}): Promise<ExportRow[]> {
  await requireRole("TS_ADMIN", "HR_ADMIN");
  return buildExportRows(params);
}
