"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History } from "lucide-react";
import { getEmployeeProjectHistory, type ProjectHistoryEntry } from "./actions";
import { formatDisplayDate } from "@/lib/dates";

const STATUS_VARIANT: Record<ProjectHistoryEntry["status"], "default" | "secondary" | "outline"> = {
  Active: "default",
  Ended: "outline",
  "Project Inactive": "outline",
};

export function EmployeeHistoryDialog({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProjectHistoryEntry[] | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && history === null) {
      setError(null);
      startTransition(async () => {
        try {
          setHistory(await getEmployeeProjectHistory(employeeId));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load project history");
        }
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="outline"
        size="icon"
        title="Project history"
        onClick={() => handleOpenChange(true)}
      >
        <History className="h-4 w-4" />
      </Button>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{employeeName} &mdash; Project History</DialogTitle>
        </DialogHeader>

        {isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!isPending && !error && history && history.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No project allocation history recorded for this employee.
          </p>
        )}

        {!isPending && !error && history && history.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">%</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.projectName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.clientName}</TableCell>
                    <TableCell className="text-center">{h.allocationPercentage}%</TableCell>
                    <TableCell className="text-sm">{formatDisplayDate(h.startDate)}</TableCell>
                    <TableCell className="text-sm">{h.endDate ? formatDisplayDate(h.endDate) : "Present"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[h.status]}>{h.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
