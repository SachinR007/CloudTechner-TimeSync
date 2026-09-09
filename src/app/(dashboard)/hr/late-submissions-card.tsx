"use client";

import { useTransition, useState } from "react";
import { approveLateSubmission, rejectLateSubmission } from "./actions";
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

  if (items.length === 0) return null;

  function handleApprove(id: string) {
    if (confirm("Are you sure you want to approve this late submission? This will allow the timesheet to be routed to their manager for final review.")) {
      startTransition(async () => {
        try {
          await approveLateSubmission(id);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed to approve late submission");
        }
      });
    }
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
        </CardHeader>
        <CardContent className="p-0 bg-white">
          <Table>
            <TableHeader className="bg-red-50/5">
              <TableRow className="border-b border-red-100 hover:bg-transparent">
                <TableHead className="pl-6 font-semibold text-red-900">Employee</TableHead>
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
                    <TableCell className="pl-6 py-3.5">
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
                          onClick={() => handleApprove(item.id)}
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
