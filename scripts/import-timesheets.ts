// Generates plain SQL from a Keka "Employees Timesheet Entries Report" export.
// Does NOT connect to any database -- reads the file, computes everything,
// prints SQL to stdout. Same safe pattern as scripts/import-roster.ts.
//
// Assumes the referenced Employee and Project already exist (run
// import-roster.sql first). Creates exactly one Task per distinct
// (Project, Task name) pair found in the file, then one TimesheetHeader per
// employee per week, with TimesheetLine rows for each day worked.
//
// Weeks where every entry shares "Approved" -> TimesheetHeader.status = APPROVED
// Weeks where every entry shares "Waiting for Approval" -> status = SUBMITTED
// A week with genuinely mixed statuses (none seen in the current file, but
// handled defensively) is treated as SUBMITTED (the more conservative state)
// and flagged in the report.
//
// approvedById / the submit approver is resolved from "Reporting To".
//
// Usage:
//   npx tsx scripts/import-timesheets.ts > scripts/import-timesheets.sql

import xlsx from "@e965/xlsx";
import { randomUUID } from "node:crypto";

const FILE = "Employees Timesheet Entries Report - CLOUDTECHNER SERVICES PRIVATE LIMITED (1).xlsx";

type Row = {
  "Employee Number": string;
  "Employee Name": string;
  "Reporting To"?: string;
  "Project Code": string;
  "Task": string;
  "Date": number; // excel serial date
  "Status": string;
  "Total Hours": number;
  "Comments"?: string;
};

function readRows(): Row[] {
  const wb = xlsx.readFile(FILE);
  const raw = xlsx.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const headers = raw[2] as string[];
  return raw.slice(3).map((r: any[]) => {
    const o: any = {};
    headers.forEach((h, i) => (o[h] = r[i]));
    return o as Row;
  }).filter((r: Row) => r["Employee Number"]);
}

function excelDateToISO(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function sql(s: string | null): string {
  if (s === null) return "NULL";
  return `'${s.replace(/'/g, "''")}'`;
}

function main() {
  const rows = readRows();

  const report = (s: string) => process.stderr.write(s + "\n");
  report("=== IMPORT REPORT ===");
  report(`Total entries: ${rows.length}`);
  report(`Employees referenced: ${[...new Set(rows.map((r) => r["Employee Number"]))].join(", ")}`);
  report(`Projects referenced: ${[...new Set(rows.map((r) => r["Project Code"]))].join(", ")}`);

  // Tasks: one per (projectCode, taskName)
  const tasksByKey = new Map<string, { projectCode: string; name: string; id: string }>();
  for (const r of rows) {
    const key = `${r["Project Code"]}::${r["Task"]}`;
    if (!tasksByKey.has(key)) {
      tasksByKey.set(key, { projectCode: r["Project Code"], name: r["Task"], id: randomUUID() });
    }
  }
  report(`Distinct tasks to create: ${tasksByKey.size}`);

  // Group entries by employee+week
  type WeekBucket = {
    employeeId: string;
    weekStart: string;
    reportingTo?: string;
    statuses: Set<string>;
    entries: { date: string; hours: number; notes: string | null; taskKey: string }[];
  };
  const weeks = new Map<string, WeekBucket>();
  for (const r of rows) {
    const dateISO = excelDateToISO(r["Date"]);
    const weekStart = mondayOf(dateISO);
    const key = `${r["Employee Number"]}::${weekStart}`;
    if (!weeks.has(key)) {
      weeks.set(key, {
        employeeId: r["Employee Number"],
        weekStart,
        reportingTo: r["Reporting To"],
        statuses: new Set(),
        entries: [],
      });
    }
    const bucket = weeks.get(key)!;
    bucket.statuses.add(r["Status"]);
    bucket.entries.push({
      date: dateISO,
      hours: Number(r["Total Hours"]) || 0,
      notes: r["Comments"] ?? null,
      taskKey: `${r["Project Code"]}::${r["Task"]}`,
    });
  }

  const mixedWeeks = [...weeks.values()].filter((w) => w.statuses.size > 1);
  if (mixedWeeks.length > 0) {
    report(`WARNING: ${mixedWeeks.length} week(s) have mixed statuses -- treated as SUBMITTED:`);
    for (const w of mixedWeeks) report(`  ${w.employeeId} week of ${w.weekStart}: ${[...w.statuses].join(", ")}`);
  }
  report(`Total weeks (TimesheetHeader rows): ${weeks.size}`);
  report("\nGenerating SQL to stdout...\n");

  // ---- known name -> id resolution (hardcoded from the employees we already imported) ----
  // Extend this map if more reporting-to names appear in future timesheet imports.
  const nameToId: Record<string, string> = {
    "Mohinder Kumar": "CT004",
    "Siba Prasad Pulugurty": "CT002",
    "Prabhakar Chappidi": "CT001",
    "Rohit Gaur": "CT011",
    "Bhavya Chauhan": "CT047",
    "Anil Kumar K": "CT057",
    "Richa Mishra": "CT049",
  };
  const unresolved = new Set<string>();
  function resolveManager(name?: string): string | null {
    if (!name) return null;
    const id = nameToId[name];
    if (!id) unresolved.add(name);
    return id ?? null;
  }

  const out: string[] = [];
  out.push("BEGIN;\n");

  out.push("-- Tasks");
  for (const t of tasksByKey.values()) {
    out.push(
      `INSERT INTO "Task" (id, "projectId", name, "isDefaultTemplate", "isActive") ` +
        `VALUES ('${t.id}', (SELECT id FROM "Project" WHERE code = ${sql(t.projectCode)}), ${sql(t.name)}, false, true) ` +
        `ON CONFLICT DO NOTHING;`
    );
  }

  out.push("\n-- Timesheet headers + lines");
  for (const w of weeks.values()) {
    const headerId = randomUUID();
    const isApproved = !mixedWeeks.includes(w) && [...w.statuses][0] === "Approved";
    const status = isApproved ? "APPROVED" : "SUBMITTED";
    const totalHours = w.entries.reduce((s, e) => s + e.hours, 0);
    const lastDate = [...w.entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].date;
    const approverId = resolveManager(w.reportingTo);

    out.push(
      `INSERT INTO "TimesheetHeader" (id, "employeeId", "weekStartDate", status, "approvedById", "submittedAt", "approvedAt", "totalHours", "isLate", "lateApproved", "createdAt", "updatedAt") ` +
        `VALUES ('${headerId}', ${sql(w.employeeId)}, ${sql(w.weekStart)}::date, '${status}', ${approverId ? sql(approverId) : "NULL"}, ${sql(lastDate)}::date, ${isApproved ? `${sql(lastDate)}::date` : "NULL"}, ${totalHours}, false, false, now(), now()) ` +
        `ON CONFLICT ("employeeId", "weekStartDate") DO NOTHING;`
    );
    for (const e of w.entries) {
      const t = tasksByKey.get(e.taskKey)!;
      out.push(
        `INSERT INTO "TimesheetLine" (id, "timesheetHeaderId", "taskId", "workDate", hours, notes) ` +
          `VALUES ('${randomUUID()}', '${headerId}', (SELECT id FROM "Task" WHERE "projectId" = (SELECT id FROM "Project" WHERE code = ${sql(t.projectCode)}) AND name = ${sql(t.name)} LIMIT 1), ${sql(e.date)}::date, ${e.hours}, ${sql(e.notes)}) ` +
          `ON CONFLICT ("timesheetHeaderId", "taskId", "workDate") DO NOTHING;`
      );
    }
  }

  out.push("\nCOMMIT;");

  if (unresolved.size > 0) {
    report(`WARNING: unresolved "Reporting To" names (approvedById left NULL): ${[...unresolved].join(", ")}`);
  }

  console.log(out.join("\n"));
}

main();
