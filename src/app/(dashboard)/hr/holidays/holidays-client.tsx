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
  importHolidaysExcel, 
  addHolidayManual, 
  deleteHoliday,
  createHolidayPlan,
  assignEmployeesToPlan
} from "./actions";
import * as XLSX from "@e965/xlsx";
import { Search, Calendar, Plus, FileSpreadsheet, Trash2, Users, Check, AlertTriangle, Briefcase, HelpCircle } from "lucide-react";
import Link from "next/link";

type Holiday = {
  id: string;
  name: string;
  date: string;
  isFloaterLeave: boolean;
  specialHoliday: boolean;
};

type HolidayPlan = {
  id: string;
  name: string;
  isDefault: boolean;
  holidays: Holiday[];
  employees: { id: string; name: string; email: string }[];
};

type EmployeeShort = {
  id: string;
  name: string;
  email: string;
  role: string;
  holidayPlanId: string | null;
  activeAllocations: {
    id: string;
    projectName: string;
    clientName: string;
  }[];
};

export function HolidaysClient({
  initialPlans,
  allEmployees,
}: {
  initialPlans: HolidayPlan[];
  allEmployees: EmployeeShort[];
}) {
  const [activeTab, setActiveTab] = useState<"calendars" | "unallocated">("calendars");
  const [plans, setPlans] = useState<HolidayPlan[]>(initialPlans);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    initialPlans.find(p => p.isDefault)?.id || initialPlans[0]?.id || ""
  );
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [searchQuery, setSearchQuery] = useState("");
  const [unallocatedSearchQuery, setUnallocatedSearchQuery] = useState("");
  
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Modal Dialog states
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);

  // Manual Holiday Form state
  const [manualName, setManualName] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualIsFloater, setManualIsFloater] = useState(false);
  const [manualIsSpecial, setManualIsSpecial] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // New Plan Form state
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanError, setNewPlanError] = useState<string | null>(null);

  // Assignment checkbox state
  const [assignedEmpIds, setAssignedEmpIds] = useState<string[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  // Search filter plans
  const filteredPlans = plans.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter holidays of selected plan by selected year
  const activeHolidays = selectedPlan
    ? selectedPlan.holidays.filter(h => new Date(h.date).getFullYear() === selectedYear)
    : [];

  // Filter employees who are NOT assigned to any client project or task
  const unallocatedEmployees = allEmployees.filter(emp => 
    emp.activeAllocations.length === 0 &&
    emp.role !== "HR_ADMIN" &&
    emp.role !== "TS_ADMIN"
  ).filter(emp =>
    emp.name.toLowerCase().includes(unallocatedSearchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(unallocatedSearchQuery.toLowerCase())
  );

  // Exporter for template
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Holiday Details"],
      ["Name", "Date", "Is Floater Leave", "Special Holiday"],
      ["Republic Day", "2026-01-26", "No", "No"],
      ["Makar Sankranti", "2026-01-14", "Yes", "No"],
      ["Independence Day", "2026-08-15", "No", "No"]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Holiday Details");
    XLSX.writeFile(wb, "Keka_Holidays_Template.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("holidayPlanId", selectedPlanId);

    startTransition(async () => {
      try {
        const res = await importHolidaysExcel(formData);
        setUploadSuccess(`Successfully imported ${res.count} holidays!`);
        window.location.reload();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Failed to import file");
      }
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    if (!manualName || !manualDate) {
      setManualError("Please enter both name and date.");
      return;
    }

    startTransition(async () => {
      try {
        await addHolidayManual(
          manualName,
          manualDate,
          manualIsFloater,
          manualIsSpecial,
          selectedPlanId
        );
        setIsManualOpen(false);
        setManualName("");
        setManualDate("");
        setManualIsFloater(false);
        setManualIsSpecial(false);
        window.location.reload();
      } catch (err) {
        setManualError(err instanceof Error ? err.message : "Failed to add holiday");
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return;

    startTransition(async () => {
      try {
        await deleteHoliday(id);
        window.location.reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete holiday");
      }
    });
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    setNewPlanError(null);
    if (!newPlanName.trim()) {
      setNewPlanError("Plan name cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        const plan = await createHolidayPlan(newPlanName);
        setIsNewPlanOpen(false);
        setNewPlanName("");
        setSelectedPlanId(plan.id);
        window.location.reload();
      } catch (err) {
        setNewPlanError(err instanceof Error ? err.message : "Failed to create plan");
      }
    });
  };

  const openAssignModal = () => {
    if (!selectedPlan) return;
    const currentIds = selectedPlan.employees.map(e => e.id);
    setAssignedEmpIds(currentIds);
    setWarningMessage(null);
    setIsAssignOpen(true);
  };

  const handleSaveAssignments = () => {
    startTransition(async () => {
      try {
        await assignEmployeesToPlan(selectedPlanId, assignedEmpIds);
        setIsAssignOpen(false);
        window.location.reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to save assignments");
      }
    });
  };

  const toggleEmployeeAssigned = (empId: string) => {
    const emp = allEmployees.find(e => e.id === empId);
    const isAdding = !assignedEmpIds.includes(empId);

    // If adding, and the employee is already assigned to a DIFFERENT non-default plan, raise a warning!
    if (isAdding && emp && emp.holidayPlanId && emp.holidayPlanId !== selectedPlanId) {
      const currentPlan = plans.find(p => p.id === emp.holidayPlanId);
      if (currentPlan && !currentPlan.isDefault) {
        setWarningMessage(
          `⚠️ Notice: ${emp.name} is currently assigned to the "${currentPlan.name}" holiday plan. Re-assigning will move them to "${selectedPlan?.name}".`
        );
      }
    }

    setAssignedEmpIds(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Shifts, Offs & Holidays</h1>
          <p className="text-sm text-gray-500">
            Define default company holiday lists, client holiday rosters, and assign rules.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "calendars" && (
            <Button
              onClick={downloadTemplate}
              variant="outline"
              className="border-gray-250 hover:bg-gray-50 font-semibold flex gap-2 items-center text-gray-700 bg-white"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              Download Excel Template
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("calendars")}
          className={`px-6 py-2.5 font-bold text-sm border-b-2 transition-all ${
            activeTab === "calendars"
              ? "border-purple-700 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-750"
          }`}
        >
          Holiday Plans & Rosters
        </button>
        <button
          onClick={() => setActiveTab("unallocated")}
          className={`px-6 py-2.5 font-bold text-sm border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "unallocated"
              ? "border-purple-700 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-750"
          }`}
        >
          Unallocated Team members
          {unallocatedEmployees.length > 0 && (
            <Badge className="bg-rose-50 text-rose-800 hover:bg-rose-50 border border-rose-200/50 text-[10px] py-0 px-1.5 font-bold rounded-full">
              {unallocatedEmployees.length}
            </Badge>
          )}
        </button>
      </div>

      {activeTab === "calendars" ? (
        /* TAB 1: Holiday Calendars */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Holiday Plans list (3 cols) */}
          <Card className="lg:col-span-3 border border-gray-250/60 shadow-sm bg-white overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
              <span className="text-sm font-bold text-gray-800">Holiday Plans</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search plans..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-gray-50/50 border-gray-200 rounded-lg h-9 text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {filteredPlans.map((p) => {
                const isActive = p.id === selectedPlanId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all select-none ${
                      isActive
                        ? "bg-purple-50/80 text-purple-900 border border-purple-200"
                        : "hover:bg-gray-50 text-gray-700 border border-transparent"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold">{p.name}</span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {p.isDefault ? allEmployees.length : p.employees.length} employees
                      </span>
                    </div>
                    {p.isDefault && (
                      <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200/50 border text-[9px] font-bold py-0 px-1 rounded-sm select-none">
                        DEFAULT
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50/50">
              <Button
                onClick={() => setIsNewPlanOpen(true)}
                variant="outline"
                className="w-full justify-center border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs h-9 bg-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New holiday plan
              </Button>
            </div>
          </Card>

          {/* MIDDLE COLUMN: Holidays List (6 cols) */}
          <Card className="lg:col-span-6 border border-gray-250/60 shadow-sm bg-white overflow-hidden min-h-[600px] flex flex-col">
            {selectedPlan && (
              <>
                {/* Header inside center card */}
                <div className="border-b border-gray-100 p-4 bg-gray-50/30 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                      {selectedPlan.name}
                      {selectedPlan.isDefault && (
                        <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </h2>
                    <span className="text-xs text-gray-400 font-medium">
                      {selectedPlan.isDefault ? allEmployees.length : selectedPlan.employees.length} Employees Assigned
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setIsManualOpen(true)}
                      className="bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs h-8 px-3"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add holiday
                    </Button>
                    <div className="relative">
                      <input
                        type="file"
                        id="excel-import-input"
                        accept=".xlsx, .xls"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isPending}
                      />
                      <Label
                        htmlFor="excel-import-input"
                        className={`inline-flex items-center justify-center rounded-md bg-white border border-gray-250 text-gray-700 hover:bg-gray-50 text-xs font-semibold px-3 h-8 cursor-pointer transition-colors ${
                          isPending ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-700" />
                        Import from excel
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Year Selector Tabs */}
                <div className="px-4 py-2 border-b border-gray-150 flex gap-1.5 bg-gray-50/20">
                  {[2026, 2025, 2024, 2023].map((yr) => {
                    const isYrActive = yr === selectedYear;
                    return (
                      <button
                        key={yr}
                        onClick={() => setSelectedYear(yr)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all border ${
                          isYrActive
                            ? "bg-purple-800 text-white border-purple-800 shadow-sm"
                            : "bg-white hover:bg-gray-50 text-gray-600 border-gray-250"
                        }`}
                      >
                        {yr}
                      </button>
                    );
                  })}
                </div>

                {/* Upload notifications */}
                {(uploadError || uploadSuccess) && (
                  <div className="p-3 border-b border-gray-100">
                    {uploadError && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-800 font-semibold">
                        {uploadError}
                      </div>
                    )}
                    {uploadSuccess && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 font-semibold">
                        {uploadSuccess}
                      </div>
                    )}
                  </div>
                )}

                {/* Content area: Table or Empty State */}
                <div className="flex-1 overflow-x-auto">
                  {activeHolidays.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/30 hover:bg-gray-50/30">
                          <TableHead className="font-semibold text-gray-700 pl-4 text-xs">Holiday Name</TableHead>
                          <TableHead className="font-semibold text-gray-700 text-xs">Date</TableHead>
                          <TableHead className="font-semibold text-gray-700 text-xs">Type</TableHead>
                          <TableHead className="font-semibold text-gray-700 text-right pr-4 text-xs">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeHolidays.map((hol) => (
                          <TableRow key={hol.id} className="hover:bg-gray-50/50">
                            <TableCell className="font-bold text-gray-800 pl-4 text-xs">{hol.name}</TableCell>
                            <TableCell className="text-gray-500 text-xs">{hol.date}</TableCell>
                            <TableCell>
                              {hol.isFloaterLeave ? (
                                <Badge className="bg-sky-50 text-sky-855 hover:bg-sky-50 border-sky-200/50 border text-[9px] font-bold">
                                  Floater Leave
                                </Badge>
                              ) : hol.specialHoliday ? (
                                <Badge className="bg-purple-50 text-purple-855 hover:bg-purple-50 border-purple-200/50 border text-[9px] font-bold">
                                  Special Holiday
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-50 text-amber-855 hover:bg-amber-50 border-amber-200/50 border text-[9px] font-bold">
                                  Public Holiday
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-4">
                              <button
                                onClick={() => handleDelete(hol.id)}
                                className="text-red-600 hover:text-red-800 font-semibold text-xs flex items-center justify-end w-full"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[400px]">
                      <div className="p-4 bg-purple-50 rounded-full mb-4 shadow-inner">
                        <Calendar className="h-10 w-10 text-purple-600" />
                      </div>
                      <h3 className="text-sm font-bold text-gray-800 mb-1">There are no holidays added</h3>
                      <p className="text-xs text-gray-400 max-w-sm mb-6">
                        Add a holiday manually or import an Excel spreadsheet to populate this holiday plan for {selectedYear}.
                      </p>
                      <div className="flex gap-2.5">
                        <Button
                          onClick={() => setIsManualOpen(true)}
                          variant="outline"
                          className="border-purple-200 text-purple-800 hover:bg-purple-50 font-bold text-xs h-9 bg-white"
                        >
                          Select holiday list
                        </Button>
                        <Button
                          onClick={() => document.getElementById("excel-import-input")?.click()}
                          className="bg-purple-800 hover:bg-purple-900 text-white font-bold text-xs h-9"
                        >
                          Import from excel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* RIGHT COLUMN: Rule Based Assignment (3 cols) */}
          <Card className="lg:col-span-3 border border-gray-250/60 shadow-sm bg-white overflow-hidden min-h-[600px] flex flex-col">
            <CardHeader className="border-b border-gray-100 bg-gray-50/30 px-4 py-4 flex flex-col gap-1">
              <CardTitle className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-purple-700" />
                Rule based assignment
              </CardTitle>
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                Employees following this rule will be added to this holiday plan automatically.
              </p>
            </CardHeader>
            <CardContent className="p-3 flex-1 flex flex-col overflow-hidden">
              {selectedPlan && (
                <>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Assigned Employees ({selectedPlan.isDefault ? allEmployees.length : selectedPlan.employees.length})
                    </span>
                    {selectedPlan.isDefault ? (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/50 px-1.5 py-0.5 rounded select-none">
                        Company-wide
                      </span>
                    ) : (
                      <button
                        onClick={openAssignModal}
                        className="text-[10px] font-bold text-purple-700 hover:underline"
                      >
                        Add rule / edit
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                    {(selectedPlan.isDefault ? allEmployees : selectedPlan.employees).map((emp) => (
                      <div
                        key={emp.id}
                        className="p-2 border border-gray-100 rounded-lg bg-gray-50/50 flex flex-col gap-0.5 select-none"
                      >
                        <span className="text-xs font-bold text-gray-800">{emp.name}</span>
                        <span className="text-[10px] text-gray-400 font-medium">{emp.email}</span>
                      </div>
                    ))}
                    {(selectedPlan.isDefault ? allEmployees : selectedPlan.employees).length === 0 && (
                      <div className="text-center text-[10px] text-gray-400 py-12">
                        No employees explicitly assigned to this plan yet.
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* TAB 2: Unallocated Team members */
        <Card className="border border-gray-250/60 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-gray-100 bg-gray-55/20 px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-rose-600" />
                Unallocated Team Members ({unallocatedEmployees.length})
              </CardTitle>
              <p className="text-xs text-gray-500">
                The following active employees are not assigned to any client project or timesheet task yet.
              </p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search unallocated team..."
                value={unallocatedSearchQuery}
                onChange={(e) => setUnallocatedSearchQuery(e.target.value)}
                className="pl-8 bg-white border-gray-250 rounded-lg h-9 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {unallocatedEmployees.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="pl-6 font-semibold text-gray-600 text-xs">Employee Name</TableHead>
                    <TableHead className="font-semibold text-gray-600 text-xs">System Role</TableHead>
                    <TableHead className="font-semibold text-gray-600 text-xs">Holiday Plan</TableHead>
                    <TableHead className="font-semibold text-gray-600 text-xs">Status</TableHead>
                    <TableHead className="pr-6 font-semibold text-gray-600 text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unallocatedEmployees.map((emp) => {
                    const currentPlanName = plans.find(p => p.id === emp.holidayPlanId)?.name || "Default (Company-wide)";
                    return (
                      <TableRow key={emp.id} className="hover:bg-gray-50/30">
                        <TableCell className="pl-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800">{emp.name}</span>
                            <span className="text-[10px] text-gray-400 font-medium">{emp.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600 text-xs font-semibold">
                          {emp.role === "PROJECT_MANAGER" ? "Project Manager" : "Employee"}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-purple-50 text-purple-800 hover:bg-purple-50 border border-purple-200/50 text-[10px] font-bold">
                            {currentPlanName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-rose-50 text-rose-800 hover:bg-rose-50 border border-rose-200/50 text-[10px] font-bold">
                            Unallocated
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Link href="/admin/projects" passHref>
                            <Button className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-[10px] h-7 px-3">
                              Allocate Project
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center p-16 text-center">
                <div className="p-4 bg-emerald-50 rounded-full mb-4 shadow-inner">
                  <Check className="h-10 w-10 text-emerald-600 stroke-[3]" />
                </div>
                <h3 className="text-sm font-bold text-gray-800 mb-1">All employees are allocated!</h3>
                <p className="text-xs text-gray-400 max-w-sm">
                  Every active team member is currently assigned to one or more active client projects or tasks.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MANUAL HOLIDAY MODAL */}
      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Add Holiday</DialogTitle>
          </DialogHeader>

          {manualError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-semibold">
              {manualError}
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="holiday-name" className="text-sm font-semibold text-gray-700">Holiday Name</Label>
              <Input
                id="holiday-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Independence Day"
                className="bg-white border-gray-250 rounded-lg text-xs"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="holiday-date" className="text-sm font-semibold text-gray-700">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="bg-white border-gray-250 rounded-lg text-xs"
                required
              />
            </div>

            <div className="flex flex-col gap-3 mt-2 border-t border-gray-55 pt-3">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="is-floater"
                  checked={manualIsFloater}
                  onChange={(e) => setManualIsFloater(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <Label htmlFor="is-floater" className="text-xs text-gray-700 font-medium cursor-pointer">
                  Is Floater Leave (Optional holiday)
                </Label>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="is-special"
                  checked={manualIsSpecial}
                  onChange={(e) => setManualIsSpecial(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <Label htmlFor="is-special" className="text-xs text-gray-700 font-medium cursor-pointer">
                  Is Special Holiday
                </Label>
              </div>
            </div>

            <DialogFooter className="mt-4 pt-3 border-t border-gray-50 flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsManualOpen(false)}
                className="border-gray-200 hover:bg-gray-50 font-semibold text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs h-9 px-5"
              >
                {isPending ? "Saving..." : "Add Holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* NEW PLAN MODAL */}
      <Dialog open={isNewPlanOpen} onOpenChange={setIsNewPlanOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">Create Holiday Plan</DialogTitle>
          </DialogHeader>

          {newPlanError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-semibold">
              {newPlanError}
            </div>
          )}

          <form onSubmit={handleCreatePlan} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-name" className="text-sm font-semibold text-gray-700">Holiday Plan Name</Label>
              <Input
                id="plan-name"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder="e.g. Bangalore - Klub"
                className="bg-white border-gray-250 rounded-lg text-xs"
                required
              />
            </div>

            <DialogFooter className="mt-4 pt-3 border-t border-gray-50 flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewPlanOpen(false)}
                className="border-gray-200 hover:bg-gray-50 font-semibold text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs h-9 px-5"
              >
                {isPending ? "Creating..." : "Create Plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ASSIGN EMPLOYEES MODAL */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="max-w-lg bg-white flex flex-col h-[520px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
              <Users className="h-5 w-5 text-purple-700" />
              Manage Plan Assignment
            </DialogTitle>
            <p className="text-xs text-gray-400">
              Select employees that should belong to the **{selectedPlan?.name}** holiday plan.
            </p>
          </DialogHeader>

          {/* Warning Banner */}
          {warningMessage && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-850 font-semibold flex items-start gap-2 animate-shake">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <span>{warningMessage}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto my-3 border border-gray-150 rounded-lg p-2 bg-gray-50/20 flex flex-col gap-1">
            {allEmployees.map((emp) => {
              const isChecked = assignedEmpIds.includes(emp.id);
              // Find other plans if assigned elsewhere
              const otherPlan = emp.holidayPlanId && emp.holidayPlanId !== selectedPlanId
                ? plans.find(p => p.id === emp.holidayPlanId)
                : null;
              
              // Only flag warning if it's not the Default plan
              const hasOtherClientPlan = otherPlan && !otherPlan.isDefault;

              return (
                <div
                  key={emp.id}
                  onClick={() => toggleEmployeeAssigned(emp.id)}
                  className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all select-none ${
                    isChecked
                      ? "bg-purple-50/50 border-purple-300"
                      : "bg-white border-gray-250 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-800">{emp.name}</span>
                      {hasOtherClientPlan && (
                        <Badge className="bg-amber-50 text-amber-800 border-amber-200/50 border text-[8px] py-0 px-1 font-bold rounded-sm">
                          Assigned to {otherPlan.name}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">
                      {emp.email}
                    </span>
                  </div>
                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                    isChecked 
                      ? "bg-purple-800 border-purple-800 text-white animate-scale-up" 
                      : "border-gray-300 bg-white"
                  }`}>
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="border-t border-gray-50 pt-3 flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAssignOpen(false)}
              className="border-gray-200 hover:bg-gray-50 font-semibold text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveAssignments}
              disabled={isPending}
              className="bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs h-9 px-5"
            >
              {isPending ? "Saving..." : "Save Rules"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
