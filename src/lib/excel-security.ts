import * as XLSX from "@e965/xlsx";

export const EXCEL_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const EXCEL_MAX_WORKSHEETS = 10;
export const EXCEL_MAX_ROWS = 25000;

export function assertSafeExcelFile(file: File) {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    throw new Error("Only .xlsx or .xls files are supported.");
  }
  if (file.size > EXCEL_MAX_FILE_SIZE_BYTES) {
    throw new Error("Excel file is too large. Please upload a file up to 8 MB.");
  }
}

export function assertSafeWorkbook(workbook: XLSX.WorkBook) {
  if (workbook.SheetNames.length === 0) {
    throw new Error("The Excel file does not contain any worksheets.");
  }
  if (workbook.SheetNames.length > EXCEL_MAX_WORKSHEETS) {
    throw new Error(`Excel file has too many worksheets. Maximum allowed is ${EXCEL_MAX_WORKSHEETS}.`);
  }
}

export function assertSafeSheetRows(sheet: XLSX.WorkSheet) {
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  if (rowCount > EXCEL_MAX_ROWS) {
    throw new Error(`Excel sheet has too many rows. Maximum allowed is ${EXCEL_MAX_ROWS}.`);
  }
}
