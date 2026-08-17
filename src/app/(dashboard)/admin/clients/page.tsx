import { prisma } from "@/lib/prisma";
import { nextClientCode } from "@/lib/codes";
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
import { CreateClientDialog } from "./create-client-dialog";
import { toggleClientActive } from "./actions";
import { employeeOptionSelect } from "@/lib/safe-selects";

export default async function ClientsPage() {
  const [clients, employees, suggestedCode] = await Promise.all([
    prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        clientManager: { select: employeeOptionSelect },
        _count: { select: { projects: true } },
      },
    }),
    prisma.employee.findMany({ where: { isActive: true }, select: employeeOptionSelect, orderBy: { name: "asc" } }),
    nextClientCode(),
  ]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Clients</CardTitle>
        <CreateClientDialog employees={employees} suggestedCode={suggestedCode} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Billing Currency</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Client Manager</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <div className="font-medium">{client.name}</div>
                  <div className="text-xs text-muted-foreground">{client.code ?? "—"}</div>
                </TableCell>
                <TableCell>{client.billingCurrency ?? "—"}</TableCell>
                <TableCell>{client._count.projects}</TableCell>
                <TableCell>{client.clientManager?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={client.isActive ? "default" : "secondary"}>
                    {client.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ToggleActiveButton
                    id={client.id}
                    isActive={client.isActive}
                    action={toggleClientActive}
                  />
                </TableCell>
              </TableRow>
            ))}
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No clients yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
