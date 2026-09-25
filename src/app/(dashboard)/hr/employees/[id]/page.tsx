import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { validateRecordId } from "@/lib/validation";
import { computeProjectHistory } from "@/lib/project-history";
import { mondayOf, mondaysInMonth, toISODate } from "@/lib/dates";
import { EmployeeDetailsTabs } from "./employee-details-tabs";

function parsePeriod(period: string | undefined) { const match = period && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period); return match ? { value: period!, year: Number(match[1]), month: Number(match[2]) } : null; }
export default async function EmployeeDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string }> }) {
  await requireRole("HR_ADMIN", "TS_ADMIN"); const { id } = await params; const { period } = await searchParams; let employeeId: string; try { employeeId = validateRecordId(id, "Employee"); } catch { notFound(); }
  const [employee, headerDates, projectHistory, allocations] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, email: true, title: true, role: true } }),
    prisma.timesheetHeader.findMany({ where: { employeeId }, select: { weekStartDate: true }, orderBy: { weekStartDate: "desc" } }), computeProjectHistory(employeeId),
    prisma.projectAllocation.findMany({ where: { employeeId, project: { isActive: true } }, select: { startDate: true, endDate: true } }),
  ]); if (!employee) notFound();
  const allocationPeriods = allocations.flatMap((allocation) => { const months: string[] = []; const cursor = new Date(Date.UTC(allocation.startDate.getUTCFullYear(), allocation.startDate.getUTCMonth(), 1)); const end = allocation.endDate && allocation.endDate < new Date() ? allocation.endDate : new Date(); while (cursor <= end && months.length < 120) { months.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); } return months; });
  const periods = [...new Set([...headerDates.map((header) => header.weekStartDate.toISOString().slice(0, 7)), ...allocationPeriods])].sort().reverse();
  const requested = parsePeriod(period); const selectedPeriod = requested && periods.includes(requested.value) ? requested.value : periods[0] ?? null; const selected = parsePeriod(selectedPeriod ?? undefined);
  const timesheets = selected ? await prisma.timesheetHeader.findMany({ where: { employeeId, weekStartDate: { gte: new Date(Date.UTC(selected.year, selected.month - 1, 1)), lt: new Date(Date.UTC(selected.year, selected.month, 1)) } }, select: { id: true, weekStartDate: true, totalHours: true, status: true, submittedAt: true, approvedAt: true, rejectionComments: true }, orderBy: { weekStartDate: "desc" } }) : [];
  const existing = new Set(timesheets.map((timesheet) => toISODate(timesheet.weekStartDate)));
  const pending = selected ? mondaysInMonth(new Date(Date.UTC(selected.year, selected.month - 1, 1))).filter((week) => { const date = new Date(`${week}T00:00:00.000Z`); return date < mondayOf(new Date()) && !existing.has(week) && allocations.some((allocation) => allocation.startDate <= date && (!allocation.endDate || allocation.endDate >= date)); }) : [];
  const serialised = [...timesheets.map((timesheet) => ({ id: timesheet.id, weekStartDate: toISODate(timesheet.weekStartDate), totalHours: Number(timesheet.totalHours ?? 0), status: timesheet.status, submittedAt: timesheet.submittedAt?.toISOString() ?? null, approvedAt: timesheet.approvedAt?.toISOString() ?? null, rejectionComments: timesheet.rejectionComments })), ...pending.map((week) => ({ id: `pending-${week}`, weekStartDate: week, totalHours: 0, status: "PENDING" as const, submittedAt: null, approvedAt: null, rejectionComments: null }))].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
  return <div className="mx-auto flex max-w-6xl flex-col gap-6"><div><Link href="/hr/employees" className="text-sm font-medium text-emerald-700 hover:underline">← All employees</Link><h1 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900">{employee.name}</h1><p className="text-sm text-muted-foreground">{employee.email} · {employee.role}{employee.title ? ` · ${employee.title}` : ""}</p></div><EmployeeDetailsTabs employeeId={employee.id} periods={periods} selectedPeriod={selectedPeriod} timesheets={serialised} projectHistory={projectHistory} /></div>;
}
