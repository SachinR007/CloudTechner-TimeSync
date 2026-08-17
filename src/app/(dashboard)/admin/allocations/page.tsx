import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortHeader } from "@/components/sort-header";
import { CreateAllocationDialog } from "./create-allocation-dialog";
import { AllocationRowActions } from "./allocation-row-actions";
import { allocationStatusFor, type AllocationStatusLabel } from "@/lib/allocation";
import { employeeOptionSelect, employeeSafeSelect } from "@/lib/safe-selects";

const SORT_KEYS = ["employee", "project", "percentage", "start", "end", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const STATUS_META: Record<AllocationStatusLabel, { variant: "default" | "secondary" | "outline"; rank: number }> = {
  Active: { variant: "default", rank: 0 },
  Upcoming: { variant: "secondary", rank: 1 },
  Ended: { variant: "outline", rank: 2 },
  "Project Inactive": { variant: "outline", rank: 3 },
  "Employee Inactive": { variant: "outline", rank: 4 },
};

function statusFor(startDate: Date, endDate: Date | null, employeeIsActive: boolean, projectIsActive: boolean) {
  const label = allocationStatusFor(startDate, endDate, employeeIsActive, projectIsActive);
  return { label, ...STATUS_META[label] };
}

export default async function AllocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { sort, dir } = await searchParams;
  const sortKey: SortKey = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "employee";
  const sortDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const [allocations, employees, projects] = await Promise.all([
    prisma.projectAllocation.findMany({
      include: { employee: { select: employeeSafeSelect }, project: true },
    }),
    prisma.employee.findMany({ where: { isActive: true }, select: employeeOptionSelect, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const utilization = new Map<string, number>();
  for (const a of allocations) {
    const active =
      a.startDate <= today &&
      (!a.endDate || a.endDate > today) &&
      a.project.isActive &&
      a.employee.isActive;
    if (active) {
      utilization.set(a.employeeId, (utilization.get(a.employeeId) ?? 0) + a.allocationPercentage);
    }
  }

  const decorated = allocations.map((a) => ({
    ...a,
    status: statusFor(a.startDate, a.endDate, a.employee.isActive, a.project.isActive),
  }));
  decorated.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "employee":
        cmp = a.employee.name.localeCompare(b.employee.name);
        break;
      case "project":
        cmp = a.project.name.localeCompare(b.project.name);
        break;
      case "percentage":
        cmp = a.allocationPercentage - b.allocationPercentage;
        break;
      case "start":
        cmp = a.startDate.getTime() - b.startDate.getTime();
        break;
      case "end":
        cmp = (a.endDate?.getTime() ?? Infinity) - (b.endDate?.getTime() ?? Infinity);
        break;
      case "status":
        cmp = a.status.rank - b.status.rank;
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const base = "/admin/allocations";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current utilization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {employees.map((e) => {
              const pct = utilization.get(e.id) ?? 0;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                >
                  <span>{e.name}</span>
                  <Badge variant={pct > 100 ? "destructive" : pct === 100 ? "default" : "secondary"}>
                    {pct}%
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Allocations</CardTitle>
          <CreateAllocationDialog employees={employees} projects={projects} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader label="Employee" sortKey="employee" currentSort={sortKey} currentDir={sortDir} basePath={base} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Project" sortKey="project" currentSort={sortKey} currentDir={sortDir} basePath={base} />
                </TableHead>
                <TableHead>
                  <SortHeader label="%" sortKey="percentage" currentSort={sortKey} currentDir={sortDir} basePath={base} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Start" sortKey="start" currentSort={sortKey} currentDir={sortDir} basePath={base} />
                </TableHead>
                <TableHead>
                  <SortHeader label="End" sortKey="end" currentSort={sortKey} currentDir={sortDir} basePath={base} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} basePath={base} />
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decorated.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.employee.name}</TableCell>
                  <TableCell>{a.project.name}</TableCell>
                  <TableCell>{a.allocationPercentage}%</TableCell>
                  <TableCell>{a.startDate.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>
                    {a.endDate ? a.endDate.toISOString().slice(0, 10) : "Open"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status.variant}>{a.status.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AllocationRowActions
                      id={a.id}
                      label={`${a.employee.name} · ${a.project.name}`}
                      canEnd={a.status.label !== "Ended"}
                      startDate={a.startDate.toISOString().slice(0, 10)}
                      endDate={a.endDate ? a.endDate.toISOString().slice(0, 10) : null}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {decorated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No allocations yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
