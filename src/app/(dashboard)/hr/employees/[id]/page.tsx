import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { validateRecordId } from "@/lib/validation";
import { computeProjectHistory } from "@/lib/project-history";
import { EmployeeDetailsTabs } from "./employee-details-tabs";

function parsePeriod(period: string | undefined) {
  if (!period) return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return match ? { value: period, year: Number(match[1]), month: Number(match[2]) } : null;
}

export default async function EmployeeDetailsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  await requireRole("HR_ADMIN", "TS_ADMIN");
  const { id } = await params;
  const { period } = await searchParams;
  let employeeId: string;
  try { employeeId = validateRecordId(id, "Employee"); } catch { notFound(); }

  const [employee, headerDates, projectHistory] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, email: true, title: true, role: true } }),
    prisma.timesheetHeader.findMany({ where: { employeeId }, select: { weekStartDate: true }, orderBy: { weekStartDate: "desc" } }),
    computeProjectHistory(employeeId),
  ]);
  if (!employee) notFound();

  const periods = Array.from(new Set(headerDates.map((header) => header.weekStartDate.toISOString().slice(0, 7))));
  const requested = parsePeriod(period);
  const selectedPeriod = requested && periods.includes(requested.value) ? requested.value : periods[0] ?? null;
  const selected = parsePeriod(selectedPeriod ?? undefined);
  const timesheets = selected ? await prisma.timesheetHeader.findMany({
    where: { employeeId, weekStartDate: { gte: new Date(Date.UTC(selected.year, selected.month - 1, 1)), lt: new Date(Date.UTC(selected.year, selected.month, 1)) } },
    select: { id: true, weekStartDate: true, totalHours: true, status: true, submittedAt: true, approvedAt: true, rejectionComments: true },
    orderBy: { weekStartDate: "desc" },
  }) : [];

  return <div className="mx-auto flex max-w-6xl flex-col gap-6"><div><Link href="/hr/employees" className="text-sm font-medium text-emerald-700 hover:underline">← All employees</Link><h1 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900">{employee.name}</h1><p className="text-sm text-muted-foreground">{employee.email} · {employee.role}{employee.title ? ` · ${employee.title}` : ""}</p></div><EmployeeDetailsTabs employeeId={employee.id} periods={periods} selectedPeriod={selectedPeriod} timesheets={timesheets.map((timesheet) => ({ id: timesheet.id, weekStartDate: timesheet.weekStartDate.toISOString().slice(0, 10), totalHours: Number(timesheet.totalHours ?? 0), status: timesheet.status, submittedAt: timesheet.submittedAt?.toISOString() ?? null, approvedAt: timesheet.approvedAt?.toISOString() ?? null, rejectionComments: timesheet.rejectionComments }))} projectHistory={projectHistory} /></div>;
}
