"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, Download, FileDown } from "lucide-react";
import * as XLSX from "@e965/xlsx";
import { previewTimesheetImport, commitTimesheetImport, exportTimesheets } from "./actions";
import {
  type ImportPreviewResult,
  type ImportPreviewReport,
  type ImportRunSummary,
  type ParsedTimesheetRow,
  type ImportedRowDetail,
  type EmployeeOption,
  type ExportRow,
} from "./import-timesheet-logic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function downloadExportRows(rows: ExportRow[], label: string) {
  const wb = XLSX.utils.book_new();
  const dataRows = rows.map((r) => ({
    "Employee ID": r.employeeId,
    "Employee Name": r.employeeName,
    "Client": r.clientName,
    "Project": r.projectName,
    "Task": r.taskName,
    "Date": r.workDate,
    "Hours": r.hours,
    "Week Starting": r.weekStartDate,
    "Timesheet Status": r.timesheetStatus,
    "Approved By": r.approvedByName ?? "",
    "Comments": r.notes ?? "",
  }));
  const s = XLSX.utils.json_to_sheet(dataRows.length > 0 ? dataRows : [{ "No data": "No entries found for the selected filters" }]);
  XLSX.utils.book_append_sheet(wb, s, "Timesheet Export");
  XLSX.writeFile(wb, `timesheet_export_${label}.xlsx`);
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warn" | "good" }) {
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-0.5 ${
        tone === "warn"
          ? "border-amber-200 bg-amber-50/50"
          : tone === "good"
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-gray-200 bg-gray-50/50"
      }`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function ProgressBar({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full w-1/3 rounded-full bg-emerald-500 animate-[progress-slide_1.2s_ease-in-out_infinite]" />
      </div>
      <style>{`
        @keyframes progress-slide {
          0% { margin-left: -33%; }
          100% { margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

// Builds a multi-sheet results workbook from a report, downloaded client-side --
// same house pattern as the "download template" button in hr/holidays.
// `rows` is the actual row-level data that was parsed from the source file --
// pass plain ParsedTimesheetRow[] for a pre-commit preview download (no
// per-row outcome yet), or ImportedRowDetail[] for a post-commit/history
// download (each row tagged with what actually happened to it).
function downloadResultsReport(
  report: ImportPreviewReport,
  rows: (ParsedTimesheetRow | ImportedRowDetail)[],
  sourceFileName: string
) {
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Import Results Summary"],
    ["Source file", sourceFileName],
    [],
    ["Rows in file", report.totalDataRows],
    ["Usable rows", report.usableRows],
    ["New timesheets", report.weeksNew],
    ["Already imported (skipped)", report.weeksAlreadyImported],
    ["New daily entries", report.linesNew],
    ["New tasks", report.newTasks],
    ["New allocations", report.newAllocations],
    ["Approved weeks", report.weeksApproved],
    ["Submitted weeks", report.weeksSubmitted],
    ["Time-off rows skipped", report.timeOffRowsSkipped],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // The actual row-level data that was parsed/pushed -- mirrors the source
  // file's own columns (employee, project, task, date, hours, etc), plus an
  // Outcome column when this is a post-commit/history download.
  if (rows.length > 0) {
    const dataRows = rows.map((r) => ({
      "Employee ID": r.employeeId,
      "Employee Name": r.employeeName,
      "Client": r.clientName,
      "Project": r.projectName,
      "Task": r.taskName,
      "Date": r.workDate,
      "Hours": r.hours,
      "Status": r.status,
      "Comments": r.notes ?? "",
      "Reporting To": r.reportingToName ?? "",
      ...("outcome" in r ? { Outcome: r.outcome } : {}),
    }));
    const s = XLSX.utils.json_to_sheet(dataRows);
    XLSX.utils.book_append_sheet(wb, s, "Imported Data");
  }

  if (report.unknownEmployees.length > 0) {
    const s = XLSX.utils.json_to_sheet(report.unknownEmployees);
    XLSX.utils.book_append_sheet(wb, s, "Unknown Employees");
  }
  if (report.unknownProjects.length > 0) {
    const s = XLSX.utils.json_to_sheet(report.unknownProjects);
    XLSX.utils.book_append_sheet(wb, s, "Unknown Projects");
  }
  if (report.clientMismatches.length > 0) {
    const s = XLSX.utils.json_to_sheet(report.clientMismatches);
    XLSX.utils.book_append_sheet(wb, s, "Client Mismatches");
  }
  if (report.mixedStatusWeeks.length > 0) {
    const s = XLSX.utils.json_to_sheet(report.mixedStatusWeeks);
    XLSX.utils.book_append_sheet(wb, s, "Mixed Status Weeks");
  }
  if (report.unresolvedManagerNames.length > 0) {
    const s = XLSX.utils.json_to_sheet(report.unresolvedManagerNames.map((name) => ({ name })));
    XLSX.utils.book_append_sheet(wb, s, "Unresolved Managers");
  }

  const safeName = sourceFileName.replace(/\.xlsx?$/i, "");
  XLSX.writeFile(wb, `${safeName}_import_results.xlsx`);
}

export function ImportTimesheetsClient({
  initialHistory,
  employees,
  yearRange,
}: {
  initialHistory: ImportRunSummary[];
  employees: EmployeeOption[];
  yearRange: { minYear: number; maxYear: number };
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRunSummary[]>(initialHistory);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  // Export tab state -- year options come from the actual span of years that
  // have timesheet data, not an arbitrary window around "today".
  const exportYearOptions = Array.from(
    { length: yearRange.maxYear - yearRange.minYear + 1 },
    (_, i) => yearRange.minYear + i
  );
  const [exportEmployeeIds, setExportEmployeeIds] = useState<string[]>([]);
  const [exportYear, setExportYear] = useState<number>(yearRange.maxYear);
  const [exportMonth, setExportMonth] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  function toggleExportEmployee(empId: string) {
    setExportEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  }

  function handleExport() {
    setExportError(null);
    setExportSuccess(null);
    setIsExporting(true);
    startTransition(async () => {
      try {
        const rows = await exportTimesheets({
          employeeIds: exportEmployeeIds,
          year: exportYear,
          month: exportMonth === "all" ? null : Number(exportMonth),
        });
        const monthLabel = exportMonth === "all" ? "full_year" : MONTH_NAMES[Number(exportMonth) - 1];
        const empLabel = exportEmployeeIds.length === 0 ? "all_employees" : `${exportEmployeeIds.length}_employees`;
        downloadExportRows(rows, `${exportYear}_${monthLabel}_${empLabel}`);
        setExportSuccess(`Exported ${rows.length} timesheet entr${rows.length === 1 ? "y" : "ies"}.`);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Failed to export timesheets");
      } finally {
        setIsExporting(false);
      }
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccessMessage(null);
    setPreview(null);
    setFileName(file.name);
    setProgressLabel("Parsing and validating file…");

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        const result = await previewTimesheetImport(formData);
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        setProgressLabel(null);
      }
    });
    // allow re-selecting the same file later
    e.target.value = "";
  }

  function handleConfirm() {
    if (!preview) return;
    setError(null);
    setProgressLabel("Writing to the database…");
    startTransition(async () => {
      try {
        const result = await commitTimesheetImport(fileName, preview.report, preview.rows);
        setSuccessMessage(
          `Import complete: ${result.headersCreated} new timesheet(s), ${result.linesCreated} new line(s) created.`
        );
        setHistory((prev) => [
          {
            // Only used as a temporary React key until the next page load
            // replaces this with the real DB row -- crypto.randomUUID() is
            // unavailable over plain HTTP (non-secure-context), which this
            // VM currently serves on, so avoid depending on it here.
            id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fileName,
            importedByName: result.importedByName,
            importedAt: new Date().toISOString(),
            headersCreated: result.headersCreated,
            linesCreated: result.linesCreated,
            totalDataRows: preview.report.totalDataRows,
            unknownEmployeesCount: preview.report.unknownEmployees.length,
            unknownProjectsCount: preview.report.unknownProjects.length,
            clientMismatchesCount: preview.report.clientMismatches.length,
            unresolvedManagersCount: preview.report.unresolvedManagerNames.length,
            timeOffRowsSkipped: preview.report.timeOffRowsSkipped,
            mixedStatusWeeksCount: preview.report.mixedStatusWeeks.length,
            reportDetailsJson: JSON.stringify({ report: preview.report, rows: result.rowsWithOutcome }),
          },
          ...prev,
        ]);
        setPreview(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to commit import");
      } finally {
        setProgressLabel(null);
      }
    });
  }

  const report = preview?.report;
  const hasNewWork = report && (report.weeksNew > 0 || report.newTasks > 0 || report.newAllocations > 0);
  const hasIssues =
    report &&
    (report.unknownEmployees.length > 0 ||
      report.unknownProjects.length > 0 ||
      report.clientMismatches.length > 0 ||
      report.mixedStatusWeeks.length > 0 ||
      report.unresolvedManagerNames.length > 0);

  return (
    <Tabs defaultValue="import">
      <TabsList>
        <TabsTrigger value="import">Import</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
        <TabsTrigger value="history">History ({history.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="import">
        <div className="flex flex-col gap-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Upload</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  id="timesheet-import-input"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isPending}
                />
                <Label
                  htmlFor="timesheet-import-input"
                  className={`inline-flex items-center justify-center rounded-md bg-white border border-gray-250 text-gray-700 hover:bg-gray-50 text-sm font-semibold px-4 h-9 cursor-pointer transition-colors ${
                    isPending ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-700" />
                  Choose Excel file
                </Label>
                <span className="text-xs text-muted-foreground">
                  Keka "Employees Timesheet Entries" export (.xlsx)
                </span>
              </div>
              {progressLabel && <ProgressBar label={progressLabel} />}
            </CardContent>
          </Card>

          {error && (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="pt-4 text-sm text-red-900">{error}</CardContent>
            </Card>
          )}

          {successMessage && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 text-sm text-emerald-900">{successMessage}</CardContent>
            </Card>
          )}

          {report && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">2. Review before importing</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadResultsReport(report, preview.rows, fileName)}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download report
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Rows in file" value={report.totalDataRows} />
                  <StatCard label="Usable rows" value={report.usableRows} />
                  <StatCard label="New timesheets" value={report.weeksNew} tone="good" />
                  <StatCard label="New daily entries" value={report.linesNew} tone="good" />
                  <StatCard label="Already imported (skipped)" value={report.weeksAlreadyImported} />
                  <StatCard label="New tasks" value={report.newTasks} tone="good" />
                  <StatCard label="New allocations" value={report.newAllocations} tone="good" />
                  <StatCard label="Approved weeks" value={report.weeksApproved} />
                  <StatCard label="Submitted weeks" value={report.weeksSubmitted} />
                  <StatCard label="Time-off rows skipped" value={report.timeOffRowsSkipped} />
                </div>

                {hasIssues && (
                  <div className="text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    This file had some issues, listed below — the affected rows were skipped, everything
                    else imported normally. Download the report above for the full detail.
                  </div>
                )}

                {report.unknownEmployees.length > 0 && (
                  <FlaggedTable
                    title={`Unknown employees (${report.unknownEmployees.length}) — rows skipped`}
                    rows={report.unknownEmployees}
                    columns={["employeeNumber", "employeeName"]}
                  />
                )}
                {report.unknownProjects.length > 0 && (
                  <FlaggedTable
                    title={`Unknown projects (${report.unknownProjects.length}) — rows skipped`}
                    rows={report.unknownProjects}
                    columns={["projectCode", "projectName"]}
                  />
                )}
                {report.clientMismatches.length > 0 && (
                  <FlaggedTable
                    title={`Client code mismatches (${report.clientMismatches.length}) — using our records, not the file`}
                    rows={report.clientMismatches}
                    columns={["employeeNumber", "projectCode", "fileClientCode", "actualClientCode"]}
                  />
                )}
                {report.mixedStatusWeeks.length > 0 && (
                  <FlaggedTable
                    title={`Mixed-status weeks (${report.mixedStatusWeeks.length}) — imported as SUBMITTED`}
                    rows={report.mixedStatusWeeks}
                    columns={["employeeName", "weekStartDate"]}
                  />
                )}
                {report.unresolvedManagerNames.length > 0 && (
                  <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <span className="font-semibold">Unresolved "Reporting To" names (approver left blank): </span>
                    {report.unresolvedManagerNames.join(", ")}
                  </div>
                )}

                {progressLabel && <ProgressBar label={progressLabel} />}

                <div className="flex justify-end">
                  <Button onClick={handleConfirm} disabled={isPending || !hasNewWork}>
                    {isPending ? "Importing…" : hasNewWork ? "Confirm Import" : "Nothing new to import"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </TabsContent>

      <TabsContent value="export">
        <div className="flex flex-col gap-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export timesheet data</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label className="font-semibold">Employees</Label>
                <div className="flex items-center gap-3 mb-1">
                  <button
                    type="button"
                    onClick={() => setExportEmployeeIds([])}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                      exportEmployeeIds.length === 0
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "border-gray-250 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    All Employees
                  </button>
                  {exportEmployeeIds.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {exportEmployeeIds.length} selected
                    </span>
                  )}
                </div>
                <div className="border rounded-lg p-3 max-h-56 overflow-y-auto flex flex-col gap-1 bg-gray-50/50">
                  {employees.map((emp) => {
                    const isSelected = exportEmployeeIds.includes(emp.id);
                    return (
                      <div key={emp.id} className="flex items-center gap-2 py-0.5">
                        <input
                          type="checkbox"
                          id={`export-emp-${emp.id}`}
                          checked={isSelected}
                          onChange={() => toggleExportEmployee(emp.id)}
                          className="h-4 w-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                        />
                        <label
                          htmlFor={`export-emp-${emp.id}`}
                          className="text-xs text-gray-700 font-medium cursor-pointer"
                        >
                          {emp.name}
                        </label>
                      </div>
                    );
                  })}
                  {employees.length === 0 && (
                    <span className="text-xs text-muted-foreground">No employees found.</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Leave nothing checked to export all employees.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="flex flex-col gap-2">
                  <Label className="font-semibold">Year</Label>
                  <Select value={String(exportYear)} onValueChange={(v) => v && setExportYear(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {exportYearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="font-semibold">Month</Label>
                  <Select value={exportMonth} onValueChange={(v) => v && setExportMonth(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Whole Year</SelectItem>
                      {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={name} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {exportError && (
                <div className="text-sm text-red-900 bg-red-50/50 border border-red-200 rounded-lg px-3 py-2">
                  {exportError}
                </div>
              )}
              {exportSuccess && (
                <div className="text-sm text-emerald-900 bg-emerald-50/50 border border-emerald-200 rounded-lg px-3 py-2">
                  {exportSuccess}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleExport} disabled={isExporting} className="gap-1.5">
                  <FileDown className="h-4 w-4" />
                  {isExporting ? "Exporting…" : "Export to Excel"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="history">
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Past imports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-center">New timesheets</TableHead>
                  <TableHead className="text-center">New lines</TableHead>
                  <TableHead className="text-center">Issues</TableHead>
                  <TableHead className="text-right">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((run) => {
                  const issueCount =
                    run.unknownEmployeesCount +
                    run.unknownProjectsCount +
                    run.clientMismatchesCount +
                    run.unresolvedManagersCount +
                    run.mixedStatusWeeksCount;
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">{run.fileName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(run.importedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">{run.importedByName}</TableCell>
                      <TableCell className="text-center">{run.headersCreated}</TableCell>
                      <TableCell className="text-center">{run.linesCreated}</TableCell>
                      <TableCell className="text-center">
                        {issueCount > 0 ? (
                          <span className="text-amber-700 font-medium">{issueCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const parsed = JSON.parse(run.reportDetailsJson) as {
                              report: ImportPreviewReport;
                              rows: ImportedRowDetail[];
                            };
                            downloadResultsReport(parsed.report, parsed.rows, run.fileName);
                          }}
                          className="gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No imports yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function FlaggedTable<T extends Record<string, string | number>>({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: T[];
  columns: (keyof T)[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={String(c)} className="text-xs">
                  {String(c)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={String(c)} className="text-xs">
                    {row[c]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
