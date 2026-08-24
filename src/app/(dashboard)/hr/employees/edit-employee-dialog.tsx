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
import { updateEmployee } from "./actions";

type EmployeeInput = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  title: string | null;
  canSubmitTimesheet: boolean;
  reportingManagerId: string | null;
  approverOverrideId: string | null;
};

export function EditEmployeeDialog({
  employee,
  managers,
}: {
  employee: EmployeeInput;
  managers: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState(employee.role);
  const [reportingManagerId, setReportingManagerId] = useState(employee.reportingManagerId ?? "none");
  const [approverOverrideId, setApproverOverrideId] = useState(employee.approverOverrideId ?? "none");

  function reset() {
    setRole(employee.role);
    setReportingManagerId(employee.reportingManagerId ?? "none");
    setApproverOverrideId(employee.approverOverrideId ?? "none");
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
    } else {
      formData.set("approverOverrideId", "none");
    }

    startTransition(async () => {
      try {
        await updateEmployee(employee.id, formData);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update profile");
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        variant="outline"
        size="sm"
        className="border-gray-200 hover:bg-gray-50 text-gray-700"
      >
        Edit
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile: {employee.name}</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="id-readonly font-semibold text-gray-500">Employee ID</Label>
                <Input id="id-readonly" value={employee.id} readOnly className="bg-gray-55 text-gray-500 font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input id="name" name="name" defaultValue={employee.name} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email-readonly text-gray-500">Email Address</Label>
                <Input id="email-readonly" value={employee.email} readOnly className="bg-gray-55 text-gray-500" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" name="phone" defaultValue={employee.phone ?? ""} placeholder="Optional" />
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
                <Input id="title" name="title" defaultValue={employee.title ?? ""} placeholder="e.g. Software Engineer" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Login Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  placeholder="Leave blank to keep current"
                />
                <p className="text-xs text-muted-foreground">
                  If setting a new one: at least 8 characters, with letters and numbers.
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-sm">
                <input
                  type="checkbox"
                  name="canSubmitTimesheet"
                  defaultChecked={employee.canSubmitTimesheet}
                  className="mt-1 h-4 w-4 rounded border-gray-300 accent-emerald-700"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-gray-800">Enable timesheet access</span>
                  <span className="text-xs text-muted-foreground">
                    Controls whether this employee can save or submit timesheets.
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
                    {managers
                      .filter((m) => m.id !== employee.id) // Prevent selecting self as manager
                      .map((m) => (
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
                    {managers
                      .filter((m) => m.id !== employee.id)
                      .map((m) => (
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
