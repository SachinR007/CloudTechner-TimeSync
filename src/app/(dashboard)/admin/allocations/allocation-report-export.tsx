"use client";

import * as XLSX from "@e965/xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AllocationReportExportRow = {
  Employee: string;
  Client: string;
  Project: string;
  "Allocation %": number;
  "Working hours": number;
  "Missed timesheet reminders": number;
  "Start date": string;
  "End date": string;
  Status: string;
};

export function AllocationReportExport({ rows }: { rows: AllocationReportExportRow[] }) {
  function downloadReport() {
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 28 }, { wch: 28 }, { wch: 32 }, { wch: 14 }, { wch: 16 },
      { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Allocation report");
    XLSX.writeFile(workbook, "ct-orbit-allocation-report.xlsx");
  }

  return (
    <Button type="button" variant="outline" onClick={downloadReport} disabled={rows.length === 0}>
      <Download className="size-4" />
      Export Excel
    </Button>
  );
}
