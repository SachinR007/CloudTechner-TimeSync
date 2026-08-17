import { notFound } from "next/navigation";
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
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreateTaskDialog } from "./create-task-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { EditTaskDialog } from "./edit-task-dialog";
import { toggleTaskActive } from "./actions";
import { allocationStatusFor } from "@/lib/allocation";
import { employeeOptionSelect, employeeSafeSelect } from "@/lib/safe-selects";

const STALE_DAYS = 30;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project, employees] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        tasks: { orderBy: { name: "asc" } },
        allocations: { include: { employee: { select: employeeSafeSelect } }, orderBy: { startDate: "desc" } },
      },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: employeeOptionSelect,
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) notFound();

  // Most recent workDate logged against this project, per employee -- lets
  // the "Allocated employees" table flag allocations nobody's actually
  // logging hours against anymore (a common sign someone moved on and the
  // allocation was never formally ended).
  const lines = await prisma.timesheetLine.findMany({
    where: { task: { projectId: project.id } },
    select: { workDate: true, timesheetHeader: { select: { employeeId: true } } },
    orderBy: { workDate: "desc" },
  });
  const lastLoggedByEmployee = new Map<string, Date>();
  for (const line of lines) {
    const empId = line.timesheetHeader.employeeId;
    if (!lastLoggedByEmployee.has(empId)) lastLoggedByEmployee.set(empId, line.workDate);
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const staleCutoff = new Date(today.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const projectInput = {
    ...project,
    costBudget: project.costBudget ? Number(project.costBudget) : null,
    hoursBudget: project.hoursBudget ? Number(project.hoursBudget) : null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
          <p className="text-muted-foreground text-sm">
            {project.client.name} {project.code && `· ${project.code}`}
          </p>
        </div>
        <EditProjectDialog project={projectInput} employees={employees} />
      </div>

      {project.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-gray-800">Project Description &amp; Extension Logs</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm text-gray-600 bg-gray-50/50 p-4 rounded-md border border-gray-150">
            {project.description}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Tasks</CardTitle>
          <CreateTaskDialog projectId={project.id} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.name}</TableCell>
                  <TableCell>{task.isDefaultTemplate ? "Default" : "—"}</TableCell>
                  <TableCell>{task.startDate ? task.startDate.toISOString().slice(0, 10) : "—"}</TableCell>
                  <TableCell>{task.endDate ? task.endDate.toISOString().slice(0, 10) : "Open"}</TableCell>
                  <TableCell>
                    <Badge variant={task.isActive ? "default" : "secondary"}>
                      {task.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-2">
                      <EditTaskDialog task={task} />
                      <ToggleActiveButton
                        id={task.id}
                        isActive={task.isActive}
                        action={toggleTaskActive}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {project.tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No tasks yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocated employees</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Allocation</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last logged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.allocations.map((a) => {
                const status = allocationStatusFor(a.startDate, a.endDate, a.employee.isActive, project.isActive);
                const lastLogged = lastLoggedByEmployee.get(a.employeeId) ?? null;
                const isOpenEnded = status === "Active";
                const isStale = isOpenEnded && (!lastLogged || lastLogged < staleCutoff);
                return (
                  <TableRow key={a.id}>
                    <TableCell>{a.employee.name}</TableCell>
                    <TableCell>{a.allocationPercentage}%</TableCell>
                    <TableCell>{a.startDate.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{a.endDate ? a.endDate.toISOString().slice(0, 10) : "Open"}</TableCell>
                    <TableCell>
                      <Badge variant={status === "Active" ? "default" : "secondary"}>{status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={isStale ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                        {lastLogged ? lastLogged.toISOString().slice(0, 10) : "Never"}
                        {isStale && ` — no entries in ${STALE_DAYS}+ days, may have moved on`}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {project.allocations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No allocations yet. Manage these from the Allocations tab.
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
