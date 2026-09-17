"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteAllocation, endAllocationToday } from "./actions";
import { EditAllocationDialog } from "./edit-allocation-dialog";

export function AllocationRowActions({
  id,
  label,
  canEnd,
  startDate,
  endDate,
  percentage,
}: {
  id: string;
  label: string;
  canEnd: boolean;
  startDate: string;
  endDate: string | null;
  percentage: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleEnd() {
    setError(null);
    startTransition(() => endAllocationToday(id));
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteAllocation(id);
        setConfirmOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <EditAllocationDialog id={id} label={label} startDate={startDate} endDate={endDate} percentage={percentage} />
      {canEnd && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={handleEnd}>
          End
        </Button>
      )}
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
      >
        Delete
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete allocation?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the allocation for <span className="font-medium">{label}</span>.
            This can&apos;t be undone.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
