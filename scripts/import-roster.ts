// Generates plain SQL from two Keka exports -- does NOT connect to any database,
// so it works the same locally or against production, no live DB needed to run it.
//   - "Employee Mail ID and contact details.xlsx"  (id, name, email, phone)
//   - "Employee Project Details.xlsx"               (client/project rows, also the
//                                                     only source for job title and
//                                                     reporting-manager per employee)
//
// Generates INSERTs for Employee, Client, Project. Deliberately does NOT create
// ProjectAllocation rows (out of scope for this pass).
//
// Employees referenced in the project file but absent from the contact file are
// treated as former employees (isActive: false), with email reconstructed as
// firstname.lastname@cloudtechner.com -- a best-guess, not a verified address.
// Skipped (not generated) if that guess collides with a real employee's email.
//
// Every INSERT uses ON CONFLICT DO NOTHING, so this is safe to run against a
// database that already has some of this data (e.g. CT047/CT000) -- it just skips
// rows that already exist by id/code, nothing gets overwritten.
//
// Usage:
//   npx tsx scripts/import-roster.ts > scripts/import-roster.sql
// Then review scripts/import-roster.sql and run it with psql.

import xlsx from "@e965/xlsx";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const CONTACT_FILE = "Employee Mail ID and contact details.xlsx";
const PROJECT_FILE = "Employee Project Details.xlsx";

type ContactRow = {
  "Employee Number": string;
  "Full Name": string;
  "Work Email": string;
  "Mobile Phone"?: string;
};

type ProjectRow = {
  "Client Name": string;
  "Client Code": string;
  "Project Name": string;
  "Project Code": string;
  "Employee Number": string;
  "Employee Name": string;
  "Project Managers"?: string;
  "Job Title"?: string;
  "Reporting To"?: string;
};

function readSheet<T>(path: string): T[] {
  const wb = xlsx.readFile(path);
  return xlsx.utils.sheet_to_json<T>(wb.Sheets[wb.SheetNames[0]]);
}

function guessEmail(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return `${clean(first)}.${clean(last)}@cloudtechner.com`;
}

function sql(s: string | null): string {
  if (s === null) return "NULL";
  return `'${s.replace(/'/g, "''")}'`;
}

function main() {
  const contacts = readSheet<ContactRow>(CONTACT_FILE);
  const projectRows = readSheet<ProjectRow>(PROJECT_FILE).filter((r: ProjectRow) => r["Employee Number"]);

  const contactById = new Map(contacts.map((c) => [c["Employee Number"], c]));
  const nameToId = new Map(contacts.map((c) => [c["Full Name"], c["Employee Number"]]));

  const empMeta = new Map<string, { name: string; title?: string; reportingTo?: string }>();
  for (const r of projectRows) {
    empMeta.set(r["Employee Number"], {
      name: r["Employee Name"],
      title: r["Job Title"] || undefined,
      reportingTo: r["Reporting To"] && r["Reporting To"] !== "Not Available" ? r["Reporting To"] : undefined,
    });
  }
  for (const c of contacts) {
    if (!empMeta.has(c["Employee Number"])) {
      empMeta.set(c["Employee Number"], { name: c["Full Name"] });
    }
  }

  const allEmployeeIds = [...empMeta.keys()];
  const inactiveIds = allEmployeeIds.filter((id) => !contactById.has(id));

  const allRealEmails = new Set(contacts.map((c) => c["Work Email"].toLowerCase()));
  const emailCollisions = new Set<string>();
  for (const id of inactiveIds) {
    if (allRealEmails.has(guessEmail(empMeta.get(id)!.name).toLowerCase())) {
      emailCollisions.add(id);
    }
  }

  const clientsByCode = new Map<string, { name: string; code: string; id: string }>();
  for (const r of projectRows) {
    if (!clientsByCode.has(r["Client Code"])) {
      clientsByCode.set(r["Client Code"], { name: r["Client Name"], code: r["Client Code"], id: randomUUID() });
    }
  }

  const projectsByCode = new Map<
    string,
    { name: string; code: string; clientCode: string; managerName?: string; id: string }
  >();
  for (const r of projectRows) {
    if (!projectsByCode.has(r["Project Code"])) {
      projectsByCode.set(r["Project Code"], {
        name: r["Project Name"],
        code: r["Project Code"],
        clientCode: r["Client Code"],
        managerName: r["Project Managers"] || undefined,
        id: randomUUID(),
      });
    }
  }

  const unresolvedManagers = new Set<string>();
  function resolveManager(name?: string): string | null {
    if (!name) return null;
    const id = nameToId.get(name);
    if (!id) unresolvedManagers.add(name);
    return id ?? null;
  }

  // ---- report (to stderr, so stdout stays clean SQL you can pipe/redirect) ----
  const report = (s: string) => process.stderr.write(s + "\n");
  report("=== IMPORT REPORT ===");
  report(`Active employees (real contact info): ${allEmployeeIds.length - inactiveIds.length}`);
  report(`Inactive employees (left org, guessed email): ${inactiveIds.length}`);
  report(`Clients: ${clientsByCode.size}`);
  report(`Projects: ${projectsByCode.size}`);
  if (unresolvedManagers.size > 0) {
    report(`WARNING: unresolved manager names (left NULL): ${[...unresolvedManagers].join(", ")}`);
  }
  if (emailCollisions.size > 0) {
    report(`WARNING: guessed email collides with a real employee -- these are SKIPPED entirely:`);
    for (const id of emailCollisions) report(`  ${id} (${empMeta.get(id)!.name})`);
  }
  report("\nGenerating SQL to stdout...\n");

  // ---- SQL generation (to stdout) ----
  const out: string[] = [];
  out.push("BEGIN;\n");

  out.push("-- Employees (reportingManagerId set in a second pass below)");
  for (const id of allEmployeeIds) {
    if (emailCollisions.has(id)) continue;
    const meta = empMeta.get(id)!;
    const contact = contactById.get(id);
    const isActive = !!contact;
    const email = contact ? contact["Work Email"] : guessEmail(meta.name);
    const phone = contact?.["Mobile Phone"] ?? null;
    const passwordHash = bcrypt.hashSync(`Pass@${id}`, 10);
    out.push(
      `INSERT INTO "Employee" (id, name, email, phone, title, role, "passwordHash", "isActive", "createdAt", "updatedAt") ` +
        `VALUES (${sql(id)}, ${sql(meta.name)}, ${sql(email)}, ${sql(phone)}, ${sql(meta.title ?? null)}, 'EMPLOYEE', ${sql(passwordHash)}, ${isActive}, now(), now()) ` +
        `ON CONFLICT (id) DO NOTHING;`
    );
  }

  out.push("\n-- Clients");
  for (const c of clientsByCode.values()) {
    out.push(
      `INSERT INTO "Client" (id, name, code, "isActive", "createdAt") ` +
        `VALUES ('${c.id}', ${sql(c.name)}, ${sql(c.code)}, true, now()) ` +
        `ON CONFLICT (code) DO NOTHING;`
    );
  }

  out.push("\n-- Projects");
  for (const p of projectsByCode.values()) {
    const client = clientsByCode.get(p.clientCode);
    const managerId = resolveManager(p.managerName);
    out.push(
      `INSERT INTO "Project" (id, "clientId", name, code, status, "projectManagerId", "isActive", "createdAt") ` +
        `VALUES ('${p.id}', (SELECT id FROM "Client" WHERE code = ${sql(p.clientCode)}), ${sql(p.name)}, ${sql(p.code)}, 'IN_PROGRESS', ${managerId ? sql(managerId) : "NULL"}, true, now()) ` +
        `ON CONFLICT (code) DO NOTHING;`
    );
  }

  out.push("\n-- Reporting structure (second pass, now that all employees exist)");
  for (const id of allEmployeeIds) {
    if (emailCollisions.has(id)) continue;
    const meta = empMeta.get(id)!;
    const managerId = resolveManager(meta.reportingTo);
    if (!managerId || managerId === id) continue;
    out.push(`UPDATE "Employee" SET "reportingManagerId" = ${sql(managerId)} WHERE id = ${sql(id)};`);
  }

  out.push("\nCOMMIT;");

  console.log(out.join("\n"));
}

main();
