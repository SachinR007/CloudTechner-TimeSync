// Plain business logic for the bulk timesheet import, deliberately kept separate
// from the "use server" action wrapper in actions.ts -- Next.js intercepts every
// call to a "use server" export and routes it through its action-dispatch
// protocol regardless of caller, which makes those functions untestable outside
// a real browser. Keeping the actual logic here as plain functions means it can
// be exercised directly (e.g. from a script) without needing browser automation.

import { prisma } from "@/lib/prisma";
import { mondayOf, toISODate } from "@/lib/dates";
import { employeeOptionSelect } from "@/lib/safe-selects";
import { assertSafeSheetRows, assertSafeWorkbook } from "@/lib/excel-security";
import * as XLSX from "@e965/xlsx";

export type ParsedTimesheetRow = {
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  clientName: string;
  taskName: string;
  workDate: string; // ISO yyyy-mm-dd
  hours: number;
  notes: string | null;
  status: string; // raw "Status" cell value, e.g. "Approved" / "Waiting for Approval"
  reportingToName: string | null;
};

export type ImportPreviewReport = {
  totalDataRows: number;
  timeOffRowsSkipped: number;
  unknownEmployees: { employeeNumber: string; employeeName: string }[];
  unknownProjects: { projectCode: string; projectName: string }[];
  clientMismatches: { employeeNumber: string; projectCode: string; fileClientCode: string; actualClientCode: string }[];
  unresolvedManagerNames: string[];
  usableRows: number;
  weeksTotal: number;
  weeksNew: number;
  weeksAlreadyImported: number;
  weeksApproved: number;
  weeksSubmitted: number;
  mixedStatusWeeks: { employeeId: string; employeeName: string; weekStartDate: string }[];
  newTasks: number;
  newAllocations: number;
  linesNew: number;
};

export type ImportPreviewResult = {
  report: ImportPreviewReport;
  rows: ParsedTimesheetRow[];
};

export type ImportedRowDetail = ParsedTimesheetRow & {
  outcome: "imported" | "already existed (skipped)" | "employee/project no longer valid (skipped)";
};

function excelDateToISO(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return toISODate(d);
}

function findHeaderRowIndex(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i]?.some((cell) => String(cell ?? "").trim() === "Employee Number")) {
      return i;
    }
  }
  return -1;
}

export async function buildPreviewReport(buffer: ArrayBuffer): Promise<ImportPreviewResult> {
  const workbook = XLSX.read(buffer, { type: "array" });
  assertSafeWorkbook(workbook);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  assertSafeSheetRows(sheet);
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const headerRowIdx = findHeaderRowIndex(rawRows);
  if (headerRowIdx === -1) {
    throw new Error(
      "Could not find the 'Employee Number' column header in the uploaded sheet. Make sure this is a Keka timesheet entries export."
    );
  }
  const headers = rawRows[headerRowIdx].map((h) => String(h ?? "").trim());
  const dataRows = rawRows.slice(headerRowIdx + 1).map((r) => {
    const o: Record<string, any> = {};
    headers.forEach((h, i) => (o[h] = r[i]));
    return o;
  });

  // ── Reference data, fetched once ──
  const [employees, projects] = await Promise.all([
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.project.findMany({ select: { id: true, code: true, name: true, clientId: true, client: { select: { code: true, name: true } } } }),
  ]);
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const employeeByName = new Map(employees.map((e) => [e.name, e]));
  const projectByCode = new Map(projects.filter((p) => p.code).map((p) => [p.code as string, p]));

  const report: ImportPreviewReport = {
    totalDataRows: 0,
    timeOffRowsSkipped: 0,
    unknownEmployees: [],
    unknownProjects: [],
    clientMismatches: [],
    unresolvedManagerNames: [],
    usableRows: 0,
    weeksTotal: 0,
    weeksNew: 0,
    weeksAlreadyImported: 0,
    weeksApproved: 0,
    weeksSubmitted: 0,
    mixedStatusWeeks: [],
    newTasks: 0,
    newAllocations: 0,
    linesNew: 0,
  };

  const seenUnknownEmployees = new Set<string>();
  const seenUnknownProjects = new Set<string>();
  const seenClientMismatches = new Set<string>();
  const seenUnresolvedManagers = new Set<string>();

  const rows: ParsedTimesheetRow[] = [];

  for (const r of dataRows) {
    const employeeNumber = String(r["Employee Number"] ?? "").trim();
    if (!employeeNumber) continue; // trailing footer/blank rows
    report.totalDataRows++;

    const employee = employeeById.get(employeeNumber);
    if (!employee) {
      if (!seenUnknownEmployees.has(employeeNumber)) {
        seenUnknownEmployees.add(employeeNumber);
        report.unknownEmployees.push({
          employeeNumber,
          employeeName: String(r["Employee Name"] ?? ""),
        });
      }
      continue;
    }

    const projectCode = String(r["Project Code"] ?? "").trim();
    const project = projectByCode.get(projectCode);
    if (!project) {
      if (!seenUnknownProjects.has(projectCode)) {
        seenUnknownProjects.add(projectCode);
        report.unknownProjects.push({
          projectCode,
          projectName: String(r["Project Name"] ?? ""),
        });
      }
      continue;
    }

    const fileClientCode = String(r["Client Code"] ?? "").trim();
    const actualClientCode = project.client.code ?? "";
    if (fileClientCode && actualClientCode && fileClientCode !== actualClientCode) {
      const key = `${employeeNumber}|${projectCode}`;
      if (!seenClientMismatches.has(key)) {
        seenClientMismatches.add(key);
        report.clientMismatches.push({
          employeeNumber,
          projectCode,
          fileClientCode,
          actualClientCode,
        });
      }
      // still process the row -- we trust our own DB's project->client link over the file
    }

    const timeOffType = String(r["Time Off Type"] ?? "").trim();
    if (timeOffType) {
      report.timeOffRowsSkipped++;
      continue;
    }

    const rawDate = r["Date"];
    if (typeof rawDate !== "number") continue;
    const hours = Number(r["Total Hours"]);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const reportingToRaw = String(r["Reporting To"] ?? "").trim();
    const reportingToName = reportingToRaw && reportingToRaw !== "Not Available" ? reportingToRaw : null;
    if (reportingToName && !employeeByName.has(reportingToName) && !seenUnresolvedManagers.has(reportingToName)) {
      seenUnresolvedManagers.add(reportingToName);
      report.unresolvedManagerNames.push(reportingToName);
    }

    rows.push({
      employeeId: employee.id,
      employeeName: employee.name,
      projectId: project.id,
      projectName: project.name,
      clientName: project.client.name,
      taskName: String(r["Task"] ?? "").trim() || "Project Work",
      workDate: excelDateToISO(rawDate),
      hours,
      notes: String(r["Comments"] ?? "").trim() || null,
      status: String(r["Status"] ?? "").trim(),
      reportingToName,
    });
  }

  report.usableRows = rows.length;

  // ── Group into weeks per employee ──
  const weeks = new Map<
    string,
    { employeeId: string; weekStartDate: string; statuses: Set<string>; rows: ParsedTimesheetRow[] }
  >();
  for (const row of rows) {
    const weekStart = toISODate(mondayOf(new Date(`${row.workDate}T00:00:00.000Z`)));
    const key = `${row.employeeId}|${weekStart}`;
    if (!weeks.has(key)) {
      weeks.set(key, { employeeId: row.employeeId, weekStartDate: weekStart, statuses: new Set(), rows: [] });
    }
    const bucket = weeks.get(key)!;
    bucket.statuses.add(row.status);
    bucket.rows.push(row);
  }
  report.weeksTotal = weeks.size;

  // Broad `in`/`in` fetch (over-fetches slightly vs. exact pairs) rather than one
  // OR-clause per week -- a multi-year, many-employee file can have thousands of
  // weeks, and Postgres/Prisma OR arrays that large are a real risk, not a
  // hypothetical one.
  const weekEmployeeIds = [...new Set([...weeks.values()].map((w) => w.employeeId))];
  const weekStartDates = [...new Set([...weeks.values()].map((w) => w.weekStartDate))].map(
    (d) => new Date(`${d}T00:00:00.000Z`)
  );
  const existingHeaders = await prisma.timesheetHeader.findMany({
    where: { employeeId: { in: weekEmployeeIds }, weekStartDate: { in: weekStartDates } },
    select: { employeeId: true, weekStartDate: true },
  });
  const existingHeaderKeys = new Set(
    existingHeaders.map((h) => `${h.employeeId}|${toISODate(h.weekStartDate)}`)
  );

  for (const w of weeks.values()) {
    const key = `${w.employeeId}|${w.weekStartDate}`;
    if (existingHeaderKeys.has(key)) {
      report.weeksAlreadyImported++;
    } else {
      report.weeksNew++;
      report.linesNew += w.rows.length;
    }
    const isApproved = w.statuses.size === 1 && [...w.statuses][0] === "Approved";
    if (isApproved) report.weeksApproved++;
    else report.weeksSubmitted++;
    if (w.statuses.size > 1) {
      report.mixedStatusWeeks.push({
        employeeId: w.employeeId,
        employeeName: employeeById.get(w.employeeId)?.name ?? w.employeeId,
        weekStartDate: w.weekStartDate,
      });
    }
  }

  // ── New Tasks needed ──
  const distinctTaskPairs = new Map<string, { projectId: string; name: string }>();
  for (const row of rows) {
    distinctTaskPairs.set(`${row.projectId}|${row.taskName}`, { projectId: row.projectId, name: row.taskName });
  }
  const existingTasks = await prisma.task.findMany({
    where: { projectId: { in: [...new Set(rows.map((r) => r.projectId))] } },
    select: { projectId: true, name: true },
  });
  const existingTaskKeys = new Set(existingTasks.map((t) => `${t.projectId}|${t.name}`));
  report.newTasks = [...distinctTaskPairs.keys()].filter((k) => !existingTaskKeys.has(k)).length;

  // ── New ProjectAllocations needed ──
  const distinctAllocationPairs = new Set(rows.map((r) => `${r.employeeId}|${r.projectId}`));
  const existingAllocations = await prisma.projectAllocation.findMany({
    where: {
      employeeId: { in: [...new Set(rows.map((r) => r.employeeId))] },
      projectId: { in: [...new Set(rows.map((r) => r.projectId))] },
    },
    select: { employeeId: true, projectId: true },
  });
  const existingAllocationKeys = new Set(existingAllocations.map((a) => `${a.employeeId}|${a.projectId}`));
  report.newAllocations = [...distinctAllocationPairs].filter((k) => !existingAllocationKeys.has(k)).length;

  return { report, rows };
}

export async function writeImport(
  fileName: string,
  report: ImportPreviewReport,
  rows: ParsedTimesheetRow[],
  importedById: string
): Promise<{ headersCreated: number; linesCreated: number; rowsWithOutcome: ImportedRowDetail[] }> {
  if (rows.length === 0) {
    throw new Error("Nothing to import.");
  }

  // Re-validate referenced employees/projects still exist (defense in depth --
  // something could have changed between preview and commit).
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const [validEmployees, validProjects] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
  ]);
  const validEmployeeIds = new Set(validEmployees.map((e) => e.id));
  const validProjectIds = new Set(validProjects.map((p) => p.id));
  const usableRows = rows.filter((r) => validEmployeeIds.has(r.employeeId) && validProjectIds.has(r.projectId));

  // Separate, broader lookup for resolving "Reporting To" names to employee IDs --
  // an approver is very often NOT themselves one of the people whose timesheets
  // are in this batch, so this must not be scoped to `employeeIds` above (that
  // was a real bug caught during testing: approvers silently came out null
  // because the name lookup only covered the batch's own employees).
  const reportingToNames = [...new Set(usableRows.map((r) => r.reportingToName).filter((n): n is string => !!n))];
  const managerEmployees = await prisma.employee.findMany({
    where: { name: { in: reportingToNames } },
    select: { id: true, name: true },
  });
  const employeeByName = new Map(managerEmployees.map((e) => [e.name, e.id]));

  let headersCreated = 0;
  let linesCreated = 0;
  let preCommitExistingWeekKeys = new Set<string>();

  await prisma.$transaction(
    async (tx) => {
    // 1. Tasks -- no @@unique constraint on Task, so pre-query + filter instead of skipDuplicates.
    const distinctTaskPairs = new Map<string, { projectId: string; name: string }>();
    for (const row of usableRows) {
      distinctTaskPairs.set(`${row.projectId}|${row.taskName}`, { projectId: row.projectId, name: row.taskName });
    }
    const existingTasks = await tx.task.findMany({
      where: { projectId: { in: [...new Set(usableRows.map((r) => r.projectId))] } },
      select: { id: true, projectId: true, name: true },
    });
    const existingTaskKeys = new Set(existingTasks.map((t) => `${t.projectId}|${t.name}`));
    const tasksToCreate = [...distinctTaskPairs.values()].filter(
      (t) => !existingTaskKeys.has(`${t.projectId}|${t.name}`)
    );
    if (tasksToCreate.length > 0) {
      await tx.task.createMany({ data: tasksToCreate.map((t) => ({ projectId: t.projectId, name: t.name })) });
    }
    const allTasks = await tx.task.findMany({
      where: { projectId: { in: [...new Set(usableRows.map((r) => r.projectId))] } },
      select: { id: true, projectId: true, name: true },
    });
    const taskIdByKey = new Map(allTasks.map((t) => [`${t.projectId}|${t.name}`, t.id]));

    // 2. ProjectAllocations -- one per (employeeId, projectId) not already allocated,
    // startDate = earliest date seen for that pair in this file, open-ended, 100%.
    const pairEarliestDate = new Map<string, string>();
    for (const row of usableRows) {
      const key = `${row.employeeId}|${row.projectId}`;
      const existing = pairEarliestDate.get(key);
      if (!existing || row.workDate < existing) pairEarliestDate.set(key, row.workDate);
    }
    const existingAllocations = await tx.projectAllocation.findMany({
      where: {
        employeeId: { in: [...new Set(usableRows.map((r) => r.employeeId))] },
        projectId: { in: [...new Set(usableRows.map((r) => r.projectId))] },
      },
      select: { employeeId: true, projectId: true },
    });
    const existingAllocationKeys = new Set(existingAllocations.map((a) => `${a.employeeId}|${a.projectId}`));
    const allocationsToCreate = [...pairEarliestDate.entries()]
      .filter(([key]) => !existingAllocationKeys.has(key))
      .map(([key, earliestDate]) => {
        const [employeeId, projectId] = key.split("|");
        return {
          employeeId,
          projectId,
          startDate: new Date(`${earliestDate}T00:00:00.000Z`),
          allocationPercentage: 100,
        };
      });
    if (allocationsToCreate.length > 0) {
      await tx.projectAllocation.createMany({ data: allocationsToCreate });
    }

    // 3. TimesheetHeaders -- group rows into weeks, skip ones that already exist.
    const weeks = new Map<
      string,
      { employeeId: string; weekStartDate: string; statuses: Set<string>; rows: ParsedTimesheetRow[] }
    >();
    for (const row of usableRows) {
      const weekStart = toISODate(mondayOf(new Date(`${row.workDate}T00:00:00.000Z`)));
      const key = `${row.employeeId}|${weekStart}`;
      if (!weeks.has(key)) {
        weeks.set(key, { employeeId: row.employeeId, weekStartDate: weekStart, statuses: new Set(), rows: [] });
      }
      const bucket = weeks.get(key)!;
      bucket.statuses.add(row.status);
      bucket.rows.push(row);
    }

    // Snapshot which weeks already existed BEFORE this commit, so rows can be
    // annotated with a real outcome (imported vs already-existed) for the
    // downloadable report -- independent of whatever the passed-in `report`
    // claims, in case it's stale (e.g. from an older preview).
    const preCommitWeekEmployeeIds = [...new Set([...weeks.values()].map((w) => w.employeeId))];
    const preCommitWeekStartDates = [...new Set([...weeks.values()].map((w) => w.weekStartDate))].map(
      (d) => new Date(`${d}T00:00:00.000Z`)
    );
    const preCommitExistingHeaders = await tx.timesheetHeader.findMany({
      where: { employeeId: { in: preCommitWeekEmployeeIds }, weekStartDate: { in: preCommitWeekStartDates } },
      select: { employeeId: true, weekStartDate: true },
    });
    preCommitExistingWeekKeys = new Set(
      preCommitExistingHeaders.map((h) => `${h.employeeId}|${toISODate(h.weekStartDate)}`)
    );

    const headersToCreate = [...weeks.values()].map((w) => {
      const isApproved = w.statuses.size === 1 && [...w.statuses][0] === "Approved";
      const totalHours = w.rows.reduce((s, r) => s + r.hours, 0);
      const lastDate = [...w.rows].map((r) => r.workDate).sort().slice(-1)[0];
      const reportingToName = w.rows.find((r) => r.reportingToName)?.reportingToName ?? null;
      let approvedById = reportingToName ? employeeByName.get(reportingToName) ?? null : null;
      // Same rule the live submit action enforces: an approver can't be the
      // employee themselves. This importer bypasses that action, so re-check here.
      if (approvedById === w.employeeId) approvedById = null;
      return {
        employeeId: w.employeeId,
        weekStartDate: new Date(`${w.weekStartDate}T00:00:00.000Z`),
        status: (isApproved ? "APPROVED" : "SUBMITTED") as "APPROVED" | "SUBMITTED",
        approvedById,
        submittedAt: new Date(`${lastDate}T00:00:00.000Z`),
        approvedAt: isApproved ? new Date(`${lastDate}T00:00:00.000Z`) : null,
        totalHours,
      };
    });

    if (headersToCreate.length > 0) {
      const result = await tx.timesheetHeader.createMany({
        data: headersToCreate,
        skipDuplicates: true,
      });
      headersCreated = result.count;
    }

    // Re-query to map (employeeId, weekStartDate) -> headerId, since createMany
    // doesn't return generated IDs and some headers may have pre-existed already.
    const weekEmployeeIds = [...new Set([...weeks.values()].map((w) => w.employeeId))];
    const weekStartDates = [...new Set([...weeks.values()].map((w) => w.weekStartDate))].map(
      (d) => new Date(`${d}T00:00:00.000Z`)
    );
    const allRelevantHeaders = await tx.timesheetHeader.findMany({
      where: { employeeId: { in: weekEmployeeIds }, weekStartDate: { in: weekStartDates } },
      select: { id: true, employeeId: true, weekStartDate: true },
    });
    const headerIdByKey = new Map(
      allRelevantHeaders.map((h) => [`${h.employeeId}|${toISODate(h.weekStartDate)}`, h.id])
    );

    // 4. TimesheetLines. Uses the [timesheetHeaderId, taskId, workDate] unique
    // constraint + skipDuplicates -- safe to include rows for a pre-existing header
    // too (nothing gets overwritten, only genuinely missing lines get added).
    const linesToCreate: { timesheetHeaderId: string; taskId: string; workDate: Date; hours: number; notes: string | null }[] = [];
    for (const w of weeks.values()) {
      const headerId = headerIdByKey.get(`${w.employeeId}|${w.weekStartDate}`);
      if (!headerId) continue;
      for (const row of w.rows) {
        const taskId = taskIdByKey.get(`${row.projectId}|${row.taskName}`);
        if (!taskId) continue;
        linesToCreate.push({
          timesheetHeaderId: headerId,
          taskId,
          workDate: new Date(`${row.workDate}T00:00:00.000Z`),
          hours: row.hours,
          notes: row.notes,
        });
      }
    }
    if (linesToCreate.length > 0) {
      const result = await tx.timesheetLine.createMany({
        data: linesToCreate,
        skipDuplicates: true,
      });
      linesCreated = result.count;
    }
    },
    // Default is 5s (2s just to acquire the slot) -- too tight for a large,
    // multi-employee, multi-year import with many round trips to Postgres.
    { timeout: 60000, maxWait: 10000 }
  );

  // Re-derive per-row outcome for the persisted report -- a row's week was
  // either already there before this commit started (skipped) or genuinely
  // new (imported this run). Rows whose employee/project turned out invalid
  // at commit time (re-validated above) are marked separately.
  const validRowKeys = new Set(usableRows);
  const rowsWithOutcome: ImportedRowDetail[] = rows.map((row) => {
    if (!validRowKeys.has(row)) {
      return { ...row, outcome: "employee/project no longer valid (skipped)" };
    }
    const weekStart = toISODate(mondayOf(new Date(`${row.workDate}T00:00:00.000Z`)));
    const weekKey = `${row.employeeId}|${weekStart}`;
    return {
      ...row,
      outcome: preCommitExistingWeekKeys.has(weekKey) ? "already existed (skipped)" : "imported",
    };
  });

  await prisma.importRun.create({
    data: {
      fileName,
      importedById,
      totalDataRows: report.totalDataRows,
      usableRows: report.usableRows,
      weeksNew: report.weeksNew,
      weeksAlreadyImported: report.weeksAlreadyImported,
      newTasks: report.newTasks,
      newAllocations: report.newAllocations,
      linesNew: report.linesNew,
      headersCreated,
      linesCreated,
      unknownEmployeesCount: report.unknownEmployees.length,
      unknownProjectsCount: report.unknownProjects.length,
      clientMismatchesCount: report.clientMismatches.length,
      unresolvedManagersCount: report.unresolvedManagerNames.length,
      timeOffRowsSkipped: report.timeOffRowsSkipped,
      mixedStatusWeeksCount: report.mixedStatusWeeks.length,
      reportDetailsJson: JSON.stringify({ report, rows: rowsWithOutcome }),
    },
  });

  return { headersCreated, linesCreated, rowsWithOutcome };
}

export type ImportRunSummary = {
  id: string;
  fileName: string;
  importedByName: string;
  importedAt: string;
  headersCreated: number;
  linesCreated: number;
  totalDataRows: number;
  unknownEmployeesCount: number;
  unknownProjectsCount: number;
  clientMismatchesCount: number;
  unresolvedManagersCount: number;
  timeOffRowsSkipped: number;
  mixedStatusWeeksCount: number;
  reportDetailsJson: string;
};

export async function fetchImportHistory(): Promise<ImportRunSummary[]> {
  const runs = await prisma.importRun.findMany({
    orderBy: { importedAt: "desc" },
    include: { importedBy: { select: { name: true } } },
    take: 50,
  });

  return runs.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    importedByName: r.importedBy.name,
    importedAt: r.importedAt.toISOString(),
    headersCreated: r.headersCreated,
    linesCreated: r.linesCreated,
    totalDataRows: r.totalDataRows,
    unknownEmployeesCount: r.unknownEmployeesCount,
    unknownProjectsCount: r.unknownProjectsCount,
    clientMismatchesCount: r.clientMismatchesCount,
    unresolvedManagersCount: r.unresolvedManagersCount,
    timeOffRowsSkipped: r.timeOffRowsSkipped,
    mixedStatusWeeksCount: r.mixedStatusWeeksCount,
    reportDetailsJson: r.reportDetailsJson,
  }));
}

export type EmployeeOption = { id: string; name: string };

export async function fetchAllEmployeesForExport(): Promise<EmployeeOption[]> {
  const employees = await prisma.employee.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return employees;
}

// Range of years the Export tab's Year picker should offer: starting from
// whichever year the earliest timesheet data actually begins in, through the
// current year (not the latest data's year) -- so this year stays selectable
// even before any of its data has been imported yet.
export async function fetchExportYearRange(): Promise<{ minYear: number; maxYear: number }> {
  const currentYear = new Date().getFullYear();
  const earliest = await prisma.timesheetLine.findFirst({
    orderBy: { workDate: "asc" },
    select: { workDate: true },
  });
  const minYear = earliest ? earliest.workDate.getUTCFullYear() : currentYear;
  return {
    minYear: Math.min(minYear, currentYear),
    maxYear: currentYear,
  };
}

export type ExportRow = {
  employeeId: string;
  employeeName: string;
  clientName: string;
  projectName: string;
  taskName: string;
  workDate: string;
  hours: number;
  notes: string | null;
  weekStartDate: string;
  timesheetStatus: string;
  approvedByName: string | null;
};

// Read-only -- exports existing TimesheetLine data for the given employees
// (empty array = all employees) and month/year (month = null means the whole
// year). Never writes anything.
export async function buildExportRows(params: {
  employeeIds: string[];
  year: number;
  month: number | null; // 1-12, or null for the whole year
}): Promise<ExportRow[]> {
  const { employeeIds, year, month } = params;

  const startDate =
    month !== null ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
  const endDate =
    month !== null ? new Date(Date.UTC(year, month, 0)) : new Date(Date.UTC(year, 11, 31));

  const lines = await prisma.timesheetLine.findMany({
    where: {
      workDate: { gte: startDate, lte: endDate },
      timesheetHeader: employeeIds.length > 0 ? { employeeId: { in: employeeIds } } : undefined,
    },
    include: {
      task: { include: { project: { include: { client: true } } } },
      timesheetHeader: {
        include: {
          employee: { select: employeeOptionSelect },
          approvedBy: { select: employeeOptionSelect },
        },
      },
    },
    orderBy: [{ workDate: "asc" }],
  });

  return lines
    .map((l) => ({
      employeeId: l.timesheetHeader.employeeId,
      employeeName: l.timesheetHeader.employee.name,
      clientName: l.task.project.client.name,
      projectName: l.task.project.name,
      taskName: l.task.name,
      workDate: toISODate(l.workDate),
      hours: Number(l.hours),
      notes: l.notes,
      weekStartDate: toISODate(l.timesheetHeader.weekStartDate),
      timesheetStatus: l.timesheetHeader.status,
      approvedByName: l.timesheetHeader.approvedBy?.name ?? null,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.workDate.localeCompare(b.workDate));
}
