import Link from "next/link";
import { Button } from "@/components/ui/button";

type Option = { id: string; name: string };

export function UtilizationReportFilters({
  employees,
  clients,
  projects,
  values,
}: {
  employees: Option[];
  clients: Option[];
  projects: (Option & { clientId: string })[];
  values: { employeeId?: string; clientId?: string; projectId?: string; startDate?: string; endDate?: string };
}) {
  return (
    <form action="/admin/allocations" className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-5">
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Employee
        <select name="employeeId" defaultValue={values.employeeId ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
          <option value="">All employees</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Client
        <select name="clientId" defaultValue={values.clientId ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
          <option value="">All clients</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Project
        <select name="projectId" defaultValue={values.projectId ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
          <option value="">All projects</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Allocation from
        <input name="startDate" type="date" defaultValue={values.startDate ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Allocation to
        <input name="endDate" type="date" defaultValue={values.endDate ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" />
      </label>
      <div className="flex items-end gap-2 xl:col-span-5">
        <Button type="submit" size="sm">Apply filters</Button>
        <Link href="/admin/allocations" className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent">Clear</Link>
      </div>
    </form>
  );
}
