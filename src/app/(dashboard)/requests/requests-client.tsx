"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  submitAllocationRequest,
  approveAllocationRequest,
  rejectAllocationRequest,
} from "./actions";
import { toast } from "sonner";
import { Plus, Check, X, AlertCircle, HelpCircle } from "lucide-react";
import { formatDisplayDate } from "@/lib/dates";

type Project = {
  id: string;
  name: string;
  client: { name: string };
};

type AllocationRequest = {
  id: string;
  employeeId: string;
  employee: { name: string; email: string; isActive: boolean };
  projectId: string | null;
  project: { name: string; client: { name: string } } | null;
  allocationPercentage: number;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  updatedAt: Date;
};

type RequestsClientProps = {
  isAdminOrHR: boolean;
  projects: Project[];
  requests: AllocationRequest[];
  isUnassigned: boolean;
};

export function RequestsClient({
  isAdminOrHR,
  projects,
  requests,
  isUnassigned,
}: RequestsClientProps) {
  const [isPending, startTransition] = useTransition();

  // Create Request Form State
  const [message, setMessage] = useState("");

  // Approval Dialog State
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AllocationRequest | null>(null);
  const [approveProjectId, setApproveProjectId] = useState("");
  const [startDateStr, setStartDateStr] = useState(new Date().toISOString().split("T")[0]);
  const [endDateStr, setEndDateStr] = useState("");
  const [approveAllocPct, setApproveAllocPct] = useState(100);

  // Rejection Dialog State
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const historyRequests = requests.filter((r) => r.status !== "PENDING");

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please add some details/comments for your request.");
      return;
    }

    startTransition(async () => {
      try {
        await submitAllocationRequest(message);
        toast.success("Allocation request submitted successfully!");
        setMessage("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to submit request.");
      }
    });
  };

  const handleApprove = () => {
    if (!selectedRequest) return;
    if (!approveProjectId) {
      toast.error("Please select a project to allocate.");
      return;
    }
    if (!startDateStr) {
      toast.error("Start date is required.");
      return;
    }

    startTransition(async () => {
      try {
        await approveAllocationRequest(
          selectedRequest.id,
          approveProjectId,
          startDateStr,
          endDateStr || null,
          approveAllocPct
        );
        toast.success(`Allocation approved and project assigned to ${selectedRequest.employee.name}!`);
        setApproveDialogOpen(false);
        setSelectedRequest(null);
        setApproveProjectId("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to approve request.");
      }
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;

    startTransition(async () => {
      try {
        await rejectAllocationRequest(selectedRequest.id, rejectReason);
        toast.success(`Request for ${selectedRequest.employee.name} rejected.`);
        setRejectDialogOpen(false);
        setSelectedRequest(null);
        setRejectReason("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reject request.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Allocation Requests</h1>
        <p className="text-muted-foreground text-sm">
          {isAdminOrHR
            ? "Manage and approve employee requests for project allocations."
            : "Request allocation to active projects to start logging timesheet entries."}
        </p>
      </div>

      {/* Unassigned Warning Banner for Employees */}
      {!isAdminOrHR && isUnassigned && (
        <Card className="border-amber-200 bg-amber-50/50 shadow-none">
          <CardContent className="flex items-start gap-3 pt-4 text-amber-900">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-sm">You are currently unallocated</span>
              <p className="text-xs text-amber-800">
                You do not have any active project allocations. Please submit a request below to get allocated. Once the HR or Admin approves and allocates you to a project, it will reflect on your timesheet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Request form for employees */}
        {!isAdminOrHR && (
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Card className="border border-gray-150 shadow-sm bg-white">
              <CardHeader className="border-b border-gray-50 pb-4">
                <CardTitle className="text-base font-bold text-gray-800">New Request</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <form onSubmit={handleCreateRequest} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="message">Reason / Request Details *</Label>
                    <textarea
                      id="message"
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Specify your preferred project, skills, manager or allocation reason..."
                      className="w-full border rounded-md p-2.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 border-gray-200"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs py-2 h-9 flex items-center gap-1.5 justify-center w-full shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    {isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* RIGHT COLUMN / MAIN PANEL: Request status & approvals list */}
        <div className={isAdminOrHR ? "lg:col-span-3 flex flex-col gap-6" : "lg:col-span-2 flex flex-col gap-6"}>
          {/* Pending Requests Section */}
          <Card className="border border-gray-150 shadow-sm bg-white">
            <CardHeader className="border-b border-gray-50 pb-4">
              <CardTitle className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span>Pending Requests</span>
                {pendingRequests.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                    {pendingRequests.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    {isAdminOrHR && (
                      <TableHead className="font-semibold text-gray-700 text-xs pl-6">Employee</TableHead>
                    )}
                    <TableHead className={`font-semibold text-gray-700 text-xs ${!isAdminOrHR ? "pl-6" : ""}`}>
                      Requested Project
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs">Requested On</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs">Comments</TableHead>
                    {isAdminOrHR ? (
                      <TableHead className="font-semibold text-gray-700 text-xs pr-6 text-right">Actions</TableHead>
                    ) : (
                      <TableHead className="font-semibold text-gray-700 text-xs pr-6 text-right">Status</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-gray-50/30">
                      {isAdminOrHR && (
                        <TableCell className="font-medium text-xs pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900">{req.employee.name}</span>
                            <span className="text-[10px] text-gray-400 font-normal">{req.employee.email}</span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className={`font-medium text-xs ${!isAdminOrHR ? "pl-6" : ""}`}>
                        {req.project ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800">{req.project.name}</span>
                            <span className="text-[10px] text-gray-400 font-normal">{req.project.client.name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned (Decided by Admin)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 font-mono">
                        {formatDisplayDate(req.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 max-w-xs truncate italic">
                        {req.message || <span className="text-gray-300">No message</span>}
                      </TableCell>
                      {isAdminOrHR ? (
                        <TableCell className="pr-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] h-7 px-2.5 flex items-center gap-1"
                              onClick={() => {
                                setSelectedRequest(req);
                                setApproveAllocPct(100);
                                setApproveDialogOpen(true);
                              }}
                            >
                              <Check className="w-3 h-3" /> Approve / Allocate
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50 font-bold text-[10px] h-7 px-2.5 flex items-center gap-1"
                              onClick={() => {
                                setSelectedRequest(req);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <X className="w-3 h-3" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      ) : (
                        <TableCell className="pr-6 text-right">
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200/50 font-bold text-[10px]">
                            Pending
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {pendingRequests.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdminOrHR ? 5 : 4}
                        className="text-center text-muted-foreground py-12 text-xs"
                      >
                        No pending allocation requests.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* History Requests Section */}
          <Card className="border border-gray-150 shadow-sm bg-white">
            <CardHeader className="border-b border-gray-50 pb-4">
              <CardTitle className="text-base font-bold text-gray-800">History</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    {isAdminOrHR && (
                      <TableHead className="font-semibold text-gray-700 text-xs pl-6">Employee</TableHead>
                    )}
                    <TableHead className={`font-semibold text-gray-700 text-xs ${!isAdminOrHR ? "pl-6" : ""}`}>
                      Allocated Project
                    </TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs">Allocation</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs">Requested On</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs">Processed On</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs pr-6 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRequests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-gray-50/30">
                      {isAdminOrHR && (
                        <TableCell className="font-medium text-xs pl-6">
                          <span className="font-bold text-gray-800">{req.employee.name}</span>
                        </TableCell>
                      )}
                      <TableCell className={`font-medium text-xs ${!isAdminOrHR ? "pl-6" : ""}`}>
                        {req.project ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800">{req.project.name}</span>
                            <span className="text-[10px] text-gray-400 font-normal">{req.project.client.name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned (Rejected)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-gray-700">
                        {req.status === "APPROVED" ? `${req.allocationPercentage}%` : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 font-mono">
                        {formatDisplayDate(req.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 font-mono">
                        {formatDisplayDate(req.updatedAt)}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Badge
                          variant="outline"
                          className={`font-bold text-[10px] ${
                            req.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-250"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          {req.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {historyRequests.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdminOrHR ? 6 : 5}
                        className="text-center text-muted-foreground py-12 text-xs"
                      >
                        No historical requests found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* APPROVAL DIALOG */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve &amp; Allocate Project</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="flex flex-col gap-4 py-2">
              <div className="p-3 bg-gray-50 rounded-lg flex flex-col gap-1 border">
                <span className="text-[10px] font-bold text-gray-400 tracking-wider">REQUEST DETAILS</span>
                <span className="text-xs font-bold text-gray-800">
                  Employee: {selectedRequest.employee.name}
                </span>
                {selectedRequest.message && (
                  <span className="text-xs text-gray-600 italic mt-1 font-sans">
                    Comments: "{selectedRequest.message}"
                  </span>
                )}
              </div>

              {/* Project Dropdown for Admin to choose */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="approveProject">Select Project to Allocate *</Label>
                <Select
                  value={approveProjectId}
                  onValueChange={(v) => setApproveProjectId(v || "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select project">
                      {(value) => {
                        const p = projects.find((proj) => proj.id === value);
                        return p ? `${p.name} (${p.client.name})` : null;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.client.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="approvePct">Allocation Percentage (%) *</Label>
                <Input
                  id="approvePct"
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={approveAllocPct}
                  onChange={(e) => setApproveAllocPct(Number(e.target.value))}
                />
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
            </div>
          )}
          <DialogFooter className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
            >
              {isPending ? "Allocating..." : "Approve & Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECTION DIALOG */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Allocation Request</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-gray-500">
              Provide an optional explanation/reason for declining this request. This will be sent as a notification to the employee.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rejectReason">Rejection Comments (optional)</Label>
              <textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Project headcount full, or allocate percentage mismatch..."
                className="w-full border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 border-gray-200 text-gray-800"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isPending}
              className="bg-red-700 hover:bg-red-800 text-white font-semibold"
            >
              {isPending ? "Declining..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
