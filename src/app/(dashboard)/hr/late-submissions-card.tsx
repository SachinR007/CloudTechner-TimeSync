"use client";

import { useEffect, useState, useTransition } from "react";
import { approveLateSubmissions, rejectLateSubmission } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

type LateTimesheet = {
  id: string;
  weekStartDate: string | Date;
  totalHours: any;
  submittedAt: string | Date | null;
  employee: {
    id: string;
    name: string;
    email: string;
  };
};

export function LateSubmissionsCard({ items }: { items: LateTimesheet[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [approvingIds, setApprovingIds] = useState<string[] | null>(null);

  useEffect(() => {
    const availableIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
  }, [items]);

  if (items.length === 0) return null;

  function requestApproval(ids: string[]) {
    if (ids.length > 0) setApprovingIds(ids);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  function toggleAll() {
    setSelectedIds((current) => (current.length === items.length ? [] : items.map((item) => item.id)));
  }

  function handleBulkApprove() {
    requestApproval(selectedIds);
  }

  function confirmApproval() {
    if (!approvingIds?.length) return;
    startTransition(async () => {
      try {
        await approveLateSubmissions(approvingIds);
        setSelectedIds([]);
        setApprovingIds(null);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to approve late submission(s)");
      }
    });
  }

  function handleRejectSubmit() {
    if (!rejectingId) return;
    if (!rejectComment.trim()) {
      alert("Please enter a reason for rejecting the late submission.");
      return;
    }

    startTransition(async () => {
      try {
        await rejectLateSubmission(rejectingId, rejectComment);
        setRejectingId(null);
        setRejectComment("");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to reject late submission");
      }
    });
  }

  return (
    <>
      <Card className="border border-red-200 bg-red-50/10 shadow-sm overflow-hidden animate-fade-in">
        <CardHeader className="flex flex-row items-center justify-between border-b border-red-100 bg-red-50/30 px-6 py-4">
          <div>
            <CardTitle className="text-lg font-bold text-red-900 flex items-center gap-2">
              <span>⚠️</span> Late Submission Requests ({items.length})
            </CardTitle>
            <p className="text-xs text-red-700 mt-0.5">
              These timesheets are more than 2 weeks overdue and require HR authorization to proceed.
            </p>
          </div>
          <Button
            size="sm"
            disabled={isPending || selectedIds.length === 0}
            onClick={handleBulkApprove}
            className="h-8 shrink-0 bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {isPending ? "Approving..." : `Approve selected${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </Button>
        </CardHeader>
        <CardContent className="p-0 bg-white">
          <Table>
            <TableHeader className="bg-red-50/5">
              <TableRow className="border-b border-red-100 hover:bg-transparent">
                <TableHead className="w-14 px-3 text-center">
                  <input
                    aria-label="Select all late submissions"
                    type="checkbox"
                    checked={selectedIds.length === items.length}
                    onChange={toggleAll}
                    disabled={isPending}
                    className="size-4 cursor-pointer rounded border-gray-300 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed"
                  />
                </TableHead>
                <TableHead className="pl-2 font-semibold text-red-900">Employee</TableHead>
                <TableHead className="font-semibold text-red-900">Overdue Week</TableHead>
                <TableHead className="font-semibold text-red-900 text-center">Total Hours</TableHead>
                <TableHead className="font-semibold text-red-900">Submitted On</TableHead>
                <TableHead className="pr-6 font-semibold text-red-900 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const initials = item.employee.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                const weekStartStr = formatDisplayDate(item.weekStartDate);
                const submittedStr = item.submittedAt
                  ? formatDisplayDateTime(item.submittedAt)
                  : "—";

                return (
                  <TableRow key={item.id} className="border-b border-red-50 hover:bg-red-50/5 transition-colors">
                    <TableCell className="w-14 px-3 py-3.5 text-center align-middle">
                      <input
                        aria-label={`Select ${item.employee.name}'s late submission`}
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        disabled={isPending}
                        className="size-4 cursor-pointer rounded border-gray-300 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed"
                      />
                    </TableCell>
                    <TableCell className="pl-2 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 border border-red-200 text-xs font-semibold text-red-700">
                          {initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">{item.employee.name}</span>
                          <span className="text-[10px] text-gray-400">{item.employee.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 font-bold text-red-800">
                      {weekStartStr}
                    </TableCell>
                    <TableCell className="py-3.5 text-center font-bold text-gray-700">
                      {item.totalHours?.toString() ?? "—"}
                    </TableCell>
                    <TableCell className="py-3.5 text-sm text-gray-500">
                      {submittedStr}
                    </TableCell>
                    <TableCell className="pr-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => requestApproval([item.id])}
                          className="h-8 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => setRejectingId(item.id)}
                          className="h-8 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 transition-colors"
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={approvingIds !== null} onOpenChange={(open) => !open && setApprovingIds(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-emerald-900 font-bold">
              Approve {approvingIds?.length === 1 ? "Late Submission" : "Late Submissions"}
            </DialogTitle>
            <DialogDescription>
              {approvingIds?.length === 1
                ? "This timesheet will be released to the manager for final review."
                : `${approvingIds?.length ?? 0} timesheets will be released to their managers for final review.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => setApprovingIds(null)}>Cancel</Button>
            <Button disabled={isPending} onClick={confirmApproval} className="bg-emerald-700 text-white hover:bg-emerald-800">
              {isPending ? "Approving..." : "Confirm approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectingId !== null} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-900 font-bold">Reject Late Submission</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="comments">Reason for Rejection</Label>
              <Input
                id="comments"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Enter feedback/reason (e.g. Too late, incorrect hours)"
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectSubmit}>Reject Submission</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
