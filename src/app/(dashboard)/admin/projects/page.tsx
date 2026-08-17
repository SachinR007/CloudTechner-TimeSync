import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { nextProjectCode } from "@/lib/codes";
import { BILLING_MODEL_LABEL, PROJECT_STATUS_LABEL } from "@/lib/constants";
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
import { CreateProjectDialog } from "./create-project-dialog";
import { toggleProjectActive } from "./actions";
import { employeeOptionSelect } from "@/lib/safe-selects";

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function ProjectsPage() {
  const [projects, clients, employees, suggestedCode] = await Promise.all([
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        projectManager: { select: employeeOptionSelect },
        _count: { select: { tasks: true, allocations: true } },
      },
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { isActive: true }, select: employeeOptionSelect, orderBy: { name: "asc" } }),
    nextProjectCode(),
  ]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Active Projects</CardTitle>
        <CreateProjectDialog clients={clients} employees={employees} suggestedCode={suggestedCode} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Billing Model</TableHead>
              <TableHead>Start &amp; End</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                    {project.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{project.code ?? "—"}</div>
                </TableCell>
                <TableCell>{project.client.name}</TableCell>
                <TableCell>{BILLING_MODEL_LABEL[project.billingModel]}</TableCell>
                <TableCell className="text-sm">
                  {fmtDate(project.startDate)} → {fmtDate(project.endDate)}
                </TableCell>
                <TableCell>{project.projectManager?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={project.isActive ? "default" : "secondary"}>
                    {project.isActive ? PROJECT_STATUS_LABEL[project.status] : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ToggleActiveButton
                    id={project.id}
                    isActive={project.isActive}
                    action={toggleProjectActive}
                  />
                </TableCell>
              </TableRow>
            ))}
            {projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No projects yet. {clients.length === 0 && "Create a client first."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
