"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createBulkAllocations } from "./actions";

export function CreateAllocationDialog({
  employees,
  fixedProject,
}: {
  employees: { id: string; name: string }[];
  fixedProject: { id: string; name: string; code: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState(fixedProject.id);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeePercentages, setEmployeePercentages] = useState<Record<string, string>>({});
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");

  function reset() {
    setProjectId(fixedProject.id);
    setSelectedEmployeeIds([]);
    setEmployeePercentages({});
    setStartDateStr("");
    setEndDateStr("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selectedEmployeeIds.length === 0) {
      setError("Please select at least one employee.");
      return;
    }
    if (!startDateStr) {
      setError("Start date is required.");
      return;
    }

    const payload = selectedEmployeeIds.map((id) => ({
      employeeId: id,
      percentage: Number(employeePercentages[id] ?? "100"),
    }));

    startTransition(async () => {
      try {
        await createBulkAllocations(projectId, startDateStr, endDateStr, payload);
        setOpen(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create allocations");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger render={<Button className="bg-[#0B3B45] hover:bg-[#123B2A] text-white" />}>New Allocation</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Allocate employees to {fixedProject.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Project: <span className="font-semibold text-foreground">{fixedProject.code ? `${fixedProject.name} (${fixedProject.code})` : fixedProject.name}</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="font-semibold mb-1">Employees &amp; Allocation % *</Label>
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto flex flex-col gap-2 bg-gray-50/50">
              {employees.map((e) => {
                const isSelected = selectedEmployeeIds.includes(e.id);
                const pct = employeePercentages[e.id] ?? "100";
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0 border-gray-100">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`emp-${e.id}`}
                        checked={isSelected}
                        onChange={(evt) => {
                          if (evt.target.checked) {
                            setSelectedEmployeeIds([...selectedEmployeeIds, e.id]);
                          } else {
                            setSelectedEmployeeIds(selectedEmployeeIds.filter((id) => id !== e.id));
                          }
                        }}
                        className="h-4 w-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                      />
                      <label htmlFor={`emp-${e.id}`} className="text-xs text-gray-700 font-medium cursor-pointer">
                        {e.name} ({e.id})
                      </label>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="5"
                          max="100"
                          step="5"
                          value={pct}
                          onChange={(evt) => {
                            setEmployeePercentages({
                              ...employeePercentages,
                              [e.id]: evt.target.value,
                            });
                          }}
                          className="w-16 text-center text-xs border rounded p-1 font-semibold"
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">Select one or more employees. Default is 100% allocation (5% steps).</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                required
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End Date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isPending ? "Saving…" : "Create Allocation(s)"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
