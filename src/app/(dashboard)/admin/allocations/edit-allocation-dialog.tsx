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
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { updateAllocation } from "./actions";

export function EditAllocationDialog({
  id,
  label,
  startDate,
  endDate,
  percentage,
}: {
  id: string;
  label: string;
  startDate: string;
  endDate: string | null;
  percentage: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate ?? "");
  const [allocationPercentage, setAllocationPercentage] = useState(String(percentage));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setStart(startDate);
      setEnd(endDate ?? "");
      setAllocationPercentage(String(percentage));
    }
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateAllocation(id, Number(allocationPercentage), start, end || null);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update allocation");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="icon" title="Edit allocation" onClick={() => handleOpenChange(true)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit allocation</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">{label}</p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-alloc-percentage">Allocation</Label>
            <div className="flex items-center gap-2">
              <Input
                id="edit-alloc-percentage"
                type="number"
                min="5"
                max="100"
                step="5"
                value={allocationPercentage}
                onChange={(e) => setAllocationPercentage(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Use 5% steps. Existing allocations remain visible for history.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-alloc-start">Start date</Label>
            <Input
              id="edit-alloc-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-alloc-end">End date</Label>
            <Input
              id="edit-alloc-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave blank for open-ended.</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !start || !allocationPercentage}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
