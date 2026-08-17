import Link from "next/link";
import { requireRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { addDays, mondayOf, mondaysInMonth, toISODate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LateSubmissionsCard } from "./late-submissions-card";
import { NotifyButton } from "./notify-button";
import { employeeSafeSelect } from "@/lib/safe-selects";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "NOT_STARTED";

const STATUS_CONFIG: Record<
  Status,
  { label: string; borderClass: string; textClass: string; badgeVariant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  NOT_STARTED: {
    label: "Not Started",
    borderClass: "border-l-4 border-l-gray-400 border-gray-100",
    textClass: "text-gray-500",
    badgeVariant: "outline",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  DRAFT: {
    label: "Draft",
    borderClass: "border-l-4 border-l-blue-500 border-gray-100",
    textClass: "text-blue-600",
    badgeVariant: "secondary",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    ),
  },
  SUBMITTED: {
    label: "Submitted",
    borderClass: "border-l-4 border-l-amber-500 border-gray-100",
    textClass: "text-amber-600",
    badgeVariant: "default",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-amber-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  APPROVED: {
    label: "Approved",
    borderClass: "border-l-4 border-l-emerald-600 border-gray-100",
    textClass: "text-emerald-700",
    badgeVariant: "default",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-emerald-600">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
      </svg>
    ),
  },
  REJECTED: {
    label: "Rejected",
    borderClass: "border-l-4 border-l-red-500 border-gray-100",
    textClass: "text-red-600",
    badgeVariant: "destructive",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
};

export default async function HrDashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireRole("HR_ADMIN");
  const { week } = await searchParams;

  const weekStart = mondayOf(week ? new Date(`${week}T00:00:00.000Z`) : new Date());
  const weekStartISO = toISODate(weekStart);
  const prevWeek = toISODate(addDays(weekStart, -7));
  const nextWeek = toISODate(addDays(weekStart, 7));

  const prevWeekStart = addDays(weekStart, -7);

  const [loggers, weekHeaders, prevWeekHeaders, lateSubmissions] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, role: { in: ["EMPLOYEE", "PROJECT_MANAGER"] } },
      select: employeeSafeSelect,
      orderBy: { name: "asc" },
    }),
    prisma.timesheetHeader.findMany({
      where: { weekStartDate: weekStart },
    }),
    prisma.timesheetHeader.findMany({
      where: { weekStartDate: prevWeekStart },
    }),
    prisma.timesheetHeader.findMany({
      where: {
        isLate: true,
        lateApproved: false,
        status: "SUBMITTED",
      },
      include: {
        employee: { select: employeeSafeSelect },
      },
      orderBy: {
        submittedAt: "desc",
      },
    }),
  ]);
  const headerByEmployee = new Map(weekHeaders.map((h) => [h.employeeId, h]));
  const prevHeaderByEmployee = new Map(prevWeekHeaders.map((h) => [h.employeeId, h]));

  const serializedLateSubmissions = lateSubmissions.map((item) => ({
    id: item.id,
    weekStartDate: item.weekStartDate.toISOString(),
    totalHours: item.totalHours ? Number(item.totalHours) : null,
    submittedAt: item.submittedAt ? item.submittedAt.toISOString() : null,
    employee: {
      id: item.employee.id,
      name: item.employee.name,
      email: item.employee.email,
    },
  }));



  const rows = loggers.map((e) => {
    const header = headerByEmployee.get(e.id);
    const prevHeader = prevHeaderByEmployee.get(e.id);
    const prevStatus = prevHeader?.status ?? "NOT_STARTED";
    const prevWeekSubmitted = prevStatus === "SUBMITTED" || prevStatus === "APPROVED";
    return {
      employee: e,
      status: (header?.status ?? "NOT_STARTED") as Status,
      totalHours: header?.totalHours?.toString() ?? "—",
      prevWeekSubmitted,
      prevWeekISO: toISODate(prevWeekStart),
    };
  });

  const summary: Record<Status, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    NOT_STARTED: 0,
  };
  for (const row of rows) summary[row.status]++;

  // Monthly rollup
  const monthMondays = mondaysInMonth(weekStart);
  const monthStart = new Date(`${monthMondays[0]}T00:00:00.000Z`);
  const monthEndExclusive = addDays(
    new Date(`${monthMondays[monthMondays.length - 1]}T00:00:00.000Z`),
    7
  );
  const monthHeaders = await prisma.timesheetHeader.findMany({
    where: { weekStartDate: { gte: monthStart, lt: monthEndExclusive } },
    select: { weekStartDate: true, status: true },
  });
  const monthRows = monthMondays.map((monday) => {
    const counts: Record<Status, number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
      NOT_STARTED: 0,
    };
    for (const h of monthHeaders) {
      if (toISODate(h.weekStartDate) === monday) counts[h.status as Status]++;
    }
    const accountedFor = counts.DRAFT + counts.SUBMITTED + counts.APPROVED + counts.REJECTED;
    counts.NOT_STARTED = Math.max(loggers.length - accountedFor, 0);
    return { monday, counts };
  });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Title & Introduction */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Timesheet Overview</h1>
        <p className="text-base text-gray-500">
          Monitor employee timesheet statuses, review submission rates, and analyze monthly totals.
        </p>
      </div>

      {/* Modern Status Count Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-5">
        {(["NOT_STARTED", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as Status[]).map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <Card key={status} className={`shadow-sm bg-white hover:shadow-md transition-all duration-200 ${config.borderClass}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold tracking-wider uppercase text-gray-400">
                  {config.label}
                </CardTitle>
                <div className="rounded-full bg-gray-50 p-1">{config.icon}</div>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="text-3xl font-bold text-gray-800">{summary[status]}</div>
                <p className="text-[10px] text-gray-400 mt-0.5">Active employees</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <LateSubmissionsCard items={serializedLateSubmissions} />



      {/* Main Weekly Timesheet Status Table */}
      <Card className="border border-gray-200/60 shadow-sm overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <div>
            <CardTitle className="text-lg font-bold text-gray-800">Weekly Tracker</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Viewing submissions for week starting {weekStartISO}</p>
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
            <Link href={`/hr?week=${prevWeek}`} passHref>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </Button>
            </Link>
            <span className="text-xs font-semibold px-2 text-gray-600 select-none">
              Week of {weekStartISO.slice(5)}
            </span>
            <Link href={`/hr?week=${nextWeek}`} passHref>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/45">
               <TableRow className="border-b border-gray-100 hover:bg-transparent">
                 <TableHead className="w-[35%] pl-6 font-semibold text-gray-500">Employee</TableHead>
                 <TableHead className="w-[20%] font-semibold text-gray-500">System Role</TableHead>
                 <TableHead className="w-[15%] font-semibold text-gray-500 text-center">Total Hours</TableHead>
                 <TableHead className="w-[15%] font-semibold text-gray-500 text-center">Status</TableHead>
                 <TableHead className="w-[15%] pr-6 font-semibold text-gray-500 text-right">Action</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {rows.map((row) => {
                 const config = STATUS_CONFIG[row.status];
                 const initials = row.employee.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                 return (
                   <TableRow key={row.employee.id} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                     <TableCell className="pl-6 py-3.5">
                       <div className="flex items-center gap-3">
                         <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700">
                           {initials}
                         </div>
                         <div className="flex flex-col">
                           <span className="font-semibold text-gray-800">{row.employee.name}</span>
                           <span className="text-[10px] text-gray-400">{row.employee.id}</span>
                         </div>
                       </div>
                     </TableCell>
                     <TableCell className="py-3.5">
                       <span className="text-sm text-gray-600 font-medium">
                         {row.employee.role === "PROJECT_MANAGER" ? "Project Manager" : "Employee"}
                       </span>
                     </TableCell>
                     <TableCell className="py-3.5 text-center font-bold text-gray-700">
                       {row.totalHours}
                     </TableCell>
                     <TableCell className="py-3.5 text-center">
                       <Badge variant={config.badgeVariant} className="px-2.5 py-0.5 rounded-full font-semibold text-xs shadow-sm">
                         {config.label}
                       </Badge>
                     </TableCell>
                     <TableCell className="pr-6 py-3.5 text-right">
                       {!row.prevWeekSubmitted && (
                         <div className="flex justify-end">
                           <NotifyButton employeeId={row.employee.id} weekStartISO={row.prevWeekISO} />
                         </div>
                       )}
                     </TableCell>
                   </TableRow>
                 );
               })}
               {rows.length === 0 && (
                 <TableRow>
                   <TableCell colSpan={5} className="text-center py-8 text-sm text-gray-400 font-medium">
                     No active employees registered.
                   </TableCell>
                 </TableRow>
               )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Overview Section */}
      <Card className="border border-gray-200/60 shadow-sm overflow-hidden bg-white">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <CardTitle className="text-lg font-bold text-gray-800">
            Monthly Rollup — {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </CardTitle>
          <p className="text-xs text-gray-400 mt-0.5">Overview of weekly submission statuses throughout this month</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/45">
              <TableRow className="border-b border-gray-100 hover:bg-transparent">
                <TableHead className="pl-6 font-semibold text-gray-500">Week Start</TableHead>
                <TableHead className="font-semibold text-gray-500 text-center">Not Started</TableHead>
                <TableHead className="font-semibold text-gray-500 text-center">Draft</TableHead>
                <TableHead className="font-semibold text-gray-500 text-center">Submitted</TableHead>
                <TableHead className="font-semibold text-gray-500 text-center">Approved</TableHead>
                <TableHead className="font-semibold text-gray-500 text-center pr-6 text-right">Rejected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthRows.map((row) => (
                <TableRow key={row.monday} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                  <TableCell className="pl-6 py-3.5 font-bold">
                    <Link href={`/hr?week=${row.monday}`} className="text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      {row.monday}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center font-semibold text-gray-500">{row.counts.NOT_STARTED}</TableCell>
                  <TableCell className="text-center font-semibold text-blue-500">{row.counts.DRAFT}</TableCell>
                  <TableCell className="text-center font-semibold text-amber-500">{row.counts.SUBMITTED}</TableCell>
                  <TableCell className="text-center font-semibold text-emerald-600">{row.counts.APPROVED}</TableCell>
                  <TableCell className="text-center font-semibold text-red-500 pr-6 text-right">{row.counts.REJECTED}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
