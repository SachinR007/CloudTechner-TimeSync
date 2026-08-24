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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES } from "@/lib/roles";
import { createEmployee } from "./actions";

export function CreateEmployeeDialog({
  managers,
  suggestedId,
}: {
  managers: { id: string; name: string; role: string }[];
  suggestedId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState("EMPLOYEE");
  const [reportingManagerId, setReportingManagerId] = useState("none");
  const [approverOverrideId, setApproverOverrideId] = useState("none");

  function reset() {
    setRole("EMPLOYEE");
    setReportingManagerId("none");
    setApproverOverrideId("none");
    setError(null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);

    if (reportingManagerId === "none") {
      setError("Reporting Manager is required.");
      return;
    }

    formData.set("role", role);
    formData.set("reportingManagerId", reportingManagerId);
    
    if (approverOverrideId !== "none") {
      formData.set("approverOverrideId", approverOverrideId);
    }
    startTransition(async () => {
      try {
        await createEmployee(formData);
        setOpen(false);
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to onboard employee");
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
      <Button onClick={() => setOpen(true)} className="bg-[#0B3B45] hover:bg-[#123B2A] text-white">
        Onboard Employee
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Onboard Employee Profile</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="id">Employee ID *</Label>
              <Input id="id" name="id" defaultValue={suggestedId} required placeholder="e.g. CT010" />
              <p className="text-xs text-muted-foreground">Suggested ID: {suggestedId}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" name="name" required placeholder="Enter full name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input id="email" name="email" type="email" required placeholder="name@cloudtechner.com" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" name="phone" placeholder="Optional" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>System Role *</Label>
              <Select value={role} onValueChange={(val) => setRole(val ?? "EMPLOYEE")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a role">
                    {(value) => value ? String(value).replace("_", " ") : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Designation / Title</Label>
              <Input id="title" name="title" placeholder="e.g. Software Engineer" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Login Password *</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Enter a password"
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters, with letters and numbers.
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-sm">
              <input
                type="checkbox"
                name="canSubmitTimesheet"
                className="mt-1 h-4 w-4 rounded border-gray-300 accent-emerald-700"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-gray-800">Enable timesheet access</span>
                <span className="text-xs text-muted-foreground">
                  Leave unchecked until HR approves this employee to fill timesheets.
                </span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Reporting Manager *</Label>
              <Select value={reportingManagerId} onValueChange={(val) => setReportingManagerId(val ?? "none")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select manager">
                    {(value) => {
                      const m = managers.find((mgr) => mgr.id === value);
                      return m ? `${m.name} (${m.id})` : "Select a manager...";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a manager...</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {`${m.name} (${m.id})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Approver Override</Label>
              <Select value={approverOverrideId} onValueChange={(val) => setApproverOverrideId(val ?? "none")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select approver">
                    {(value) => {
                      const m = managers.find((mgr) => mgr.id === value);
                      return m ? `${m.name} (${m.id})` : "None";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {`${m.name} (${m.id})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-[#0B3B45] hover:bg-[#123B2A] text-white">
              {isPending ? "Onboarding…" : "Onboard Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
