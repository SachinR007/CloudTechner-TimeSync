"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { formatDisplayDate } from "@/lib/dates";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { WEEKDAY_LABELS } from "@/lib/dates";
import { commentsCriteriaForTask, type TaskCommentsCriteria } from "@/lib/timesheet-rules";
import { saveDraft, submitTimesheet } from "./actions";

type Task = {
  id: string;
  name: string;
  projectName: string;
  clientName: string;
  allocationStartDate: string;
  allocationEndDate: string | null;
  commentsCriteria: TaskCommentsCriteria;
};

export function TimesheetGrid({
  weekStartISO,
  focusDateISO,
  dates,
  tasks,
  initialHours,
  initialNotes,
  editable,
  leaveDates = {},
  holidayDates = {},
}: {
  weekStartISO: string;
  focusDateISO: string;
  dates: string[];
  tasks: Task[];
  initialHours: Record<string, number>;
  initialNotes: Record<string, string>;
  editable: boolean;
  leaveDates?: Record<string, string>;
  holidayDates?: Record<string, string>;
}) {
  const router = useRouter();
  const [hours, setHours] = useState<Record<string, number>>(initialHours);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 1. Tracks which task rows are currently active/visible in the timesheet grid.
  // We initialize it with all tasks that already have saved hours or comments.
  const [activeTaskIds, setActiveTaskIds] = useState<string[]>(() => {
    const ids = new Set<string>();
    for (const key of Object.keys(initialHours)) {
      const [taskId] = key.split("__");
      ids.add(taskId);
    }
    return Array.from(ids);
  });

  // Re-sync local grid state whenever weekStartISO, initialHours, or initialNotes change
  useEffect(() => {
    setHours(initialHours);
    setNotes(initialNotes);
    const ids = new Set<string>();
    for (const key of Object.keys(initialHours)) {
      const [taskId] = key.split("__");
      ids.add(taskId);
    }
    setActiveTaskIds(Array.from(ids));
  }, [weekStartISO, initialHours, initialNotes]);

  // 2. Dialog state for adding a project/task row
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [selectedProjectName, setSelectedProjectName] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  // 3. Compute unique projects available to add (from allocations/tasks)
  const availableProjects = useMemo(() => {
    const map = new Map<string, { projectName: string; clientName: string }>();
    for (const t of tasks) {
      map.set(t.projectName, { projectName: t.projectName, clientName: t.clientName });
    }
    return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [tasks]);

  // 4. Compute available tasks for the selected project that aren't already active/visible
  const availableTasksForSelectedProject = useMemo(() => {
    if (!selectedProjectName) return [];
    return tasks
      .filter((t) => t.projectName === selectedProjectName && !activeTaskIds.includes(t.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, selectedProjectName, activeTaskIds]);

  const [workedHolidays, setWorkedHolidays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const key of Object.keys(initialHours)) {
      if (initialHours[key] > 0) {
        const [, date] = key.split("__");
        if (holidayDates[date]) {
          initial[date] = true;
        }
      }
    }
    return initial;
  });

  const [workedWeekends, setWorkedWeekends] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const key of Object.keys(initialHours)) {
      if (initialHours[key] > 0) {
        const [, date] = key.split("__");
        const dObj = new Date(`${date}T00:00:00.000Z`);
        const dayIndex = dObj.getUTCDay();
        if (dayIndex === 0 || dayIndex === 6) {
          initial[date] = true;
        }
      }
    }
    return initial;
  });

  const [commentingCell, setCommentingCell] = useState<{
    taskId: string;
    taskName: string;
    projectName: string;
    clientName: string;
    date: string;
  } | null>(null);

  const isOverdue = useMemo(() => {
    try {
      const parts = weekStartISO.split("-");
      const weekStart = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      
      // Calculate current week Monday
      const today = new Date();
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      const currentMonday = new Date(today.getFullYear(), today.getMonth(), diff);
      currentMonday.setHours(0, 0, 0, 0);

      const diffTime = currentMonday.getTime() - weekStart.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      return diffDays > 14;
    } catch {
      return false;
    }
  }, [weekStartISO]);

  // Group and display only tasks that exist in activeTaskIds state
  const groupedTasks = useMemo(() => {
    const clients: { clientName: string; projects: { projectName: string; tasks: Task[] }[] }[] = [];
    const filteredTasks = tasks.filter((t) => activeTaskIds.includes(t.id));
    for (const task of filteredTasks) {
      let client = clients.find((c) => c.clientName === task.clientName);
      if (!client) {
        client = { clientName: task.clientName, projects: [] };
        clients.push(client);
      }
      let project = client.projects.find((p) => p.projectName === task.projectName);
      if (!project) {
        project = { projectName: task.projectName, tasks: [] };
        client.projects.push(project);
      }
      project.tasks.push(task);
    }
    return clients;
  }, [tasks, activeTaskIds]);

  const dailyTotals = useMemo(() => {
    return dates.map((date, idx) => {
      const leaveType = leaveDates[date];
      const originalHolidayName = holidayDates[date];
      const isHoliday = !!originalHolidayName && !workedHolidays[date];

      // Automatic 8 hours for weekdays (Mon-Fri, index < 5) if on leave or it's a holiday (and they didn't work)
      let autoHours = 0;
      if (idx < 5 && (leaveType || isHoliday)) {
        autoHours = 8;
      }

      const loggedHours = tasks.reduce((sum, task) => {
        // Only count hours if task is in activeTaskIds
        if (!activeTaskIds.includes(task.id)) return sum;
        return sum + (hours[`${task.id}__${date}`] ?? 0);
      }, 0);

      return loggedHours + autoHours;
    });
  }, [dates, tasks, hours, activeTaskIds, leaveDates, holidayDates, workedHolidays]);

  const weeklyTotal = dailyTotals.reduce((a, b) => a + b, 0);

  function buildFormData() {
    const fd = new FormData();
    for (const [key, value] of Object.entries(hours)) {
      const [taskId] = key.split("__");
      // Only include hours if task is active/visible
      if (value > 0 && activeTaskIds.includes(taskId)) {
        fd.set(`hours__${key}`, String(value));
        const note = notes[key] ?? "";
        if (note.trim()) {
          fd.set(`notes__${key}`, note.trim());
        }
      }
    }
    return fd;
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveDraft(weekStartISO, buildFormData());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save draft");
      }
    });
  }

  function handleSubmit() {
    setError(null);

    // Rule 1: Weekly total must be at least 40 hours to submit
    if (weeklyTotal < 40) {
      setError(`You must log a total of at least 40 hours (including leaves and holidays) to submit this timesheet. Current total: ${weeklyTotal} hours.`);
      return;
    }

    // Rule 2: Cannot submit until Friday of that week (or later)
    try {
      const parts = weekStartISO.split("-");
      const weekStart = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      // Friday of that week is 4 days after Monday
      const fridayOfTimesheetWeek = new Date(weekStart.getTime() + 4 * 24 * 60 * 60 * 1000);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (today.getTime() < fridayOfTimesheetWeek.getTime()) {
        setError("You can only submit this timesheet starting from Friday of this timesheet week. Please save it as a draft for now.");
        return;
      }
    } catch {
      // Fallback
    }
    
    // Check if any cell with hours > 0 has empty notes/comments according to project criteria
    const missingNotes: string[] = [];
    for (const [key, val] of Object.entries(hours)) {
      const [taskId, date] = key.split("__");
      if (val > 0 && activeTaskIds.includes(taskId)) {
        const task = tasks.find((t) => t.id === taskId);
        const criteria = task
          ? commentsCriteriaForTask(task.name, task.commentsCriteria)
          : "COMPULSORY";

        let requiresComment = false;
        if (criteria === "COMPULSORY") {
          requiresComment = true;
        } else if (criteria === "LESS_THAN_8_HOURS" || criteria === "MORE_THAN_8_HOURS") {
          requiresComment = val !== 8;
        }

        if (requiresComment) {
          const note = notes[key] ?? "";
          if (!note.trim()) {
            missingNotes.push(date);
          }
        }
      }
    }

    if (missingNotes.length > 0) {
      setError("Please add a comment description for the days you logged hours that require comments (based on project settings). Missing comments for dates: " + [...new Set(missingNotes)].join(", "));
      return;
    }

    startTransition(async () => {
      try {
        await submitTimesheet(weekStartISO, buildFormData());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {isOverdue && editable && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-semibold flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-bold">
            <span>⚠️ Overdue Timesheet</span>
          </div>
          <p className="font-normal text-red-700">
            This timesheet is more than 2 weeks overdue. Normal submission is locked. You can save your draft, or click "Request Late Submission" to submit it to the HR Admin for approval.
          </p>
        </div>
      )}

      {/* Dropdown Add Row Trigger */}
      {editable && tasks.length > 0 && (
        <div className="flex justify-between items-center mb-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-emerald-700 border-emerald-250 hover:bg-emerald-50 font-semibold gap-1.5 shadow-sm"
            onClick={() => {
              // Initialize dialog states
              const proj = availableProjects[0]?.projectName ?? "";
              setSelectedProjectName(proj);
              const projectTasks = tasks.filter((t) => t.projectName === proj && !activeTaskIds.includes(t.id));
              setSelectedTaskId(projectTasks[0]?.id ?? "");
              setIsAddEntryOpen(true);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Project / Task
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-150 shadow-sm bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="min-w-48 font-bold text-gray-700">Client / Project / Task</TableHead>
              {dates.map((date, i) => (
                <TableHead key={date} className={`text-center font-bold text-gray-700 ${date === focusDateISO ? "bg-emerald-50 text-emerald-900" : ""}`}>
                  {WEEKDAY_LABELS[i]}
                  <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                    {formatDisplayDate(date)}
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-center font-bold text-gray-700">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedTasks.map((client) => (
              <Fragment key={client.clientName}>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableCell colSpan={dates.length + 2} className="font-semibold text-gray-800 py-1.5">
                    {client.clientName}
                  </TableCell>
                </TableRow>
                {client.projects.map((project) => (
                  <Fragment key={project.projectName}>
                    <TableRow className="bg-gray-50/40 hover:bg-gray-50/40">
                      <TableCell
                        colSpan={dates.length + 2}
                        className="pl-6 text-xs font-semibold text-gray-500 py-1"
                      >
                        {project.projectName}
                      </TableCell>
                    </TableRow>
                    {project.tasks.map((task) => {
                      const rowTotal = dates.reduce(
                        (s, date) => s + (hours[`${task.id}__${date}`] ?? 0),
                        0
                      );
                      return (
                        <TableRow key={task.id} className="hover:bg-gray-50/30">
                          <TableCell className="pl-10">
                            <div className="flex items-center justify-between group">
                              <span className="font-medium text-gray-900">{task.name}</span>
                              {editable && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTaskIds((prev) => prev.filter((id) => id !== task.id));
                                    setHours((prev) => {
                                      const next = { ...prev };
                                      for (const d of dates) {
                                        delete next[`${task.id}__${d}`];
                                      }
                                      return next;
                                    });
                                    setNotes((prev) => {
                                      const next = { ...prev };
                                      for (const d of dates) {
                                        delete next[`${task.id}__${d}`];
                                      }
                                      return next;
                                    });
                                  }}
                                  className="text-gray-400 hover:text-red-650 ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100"
                                  title="Remove row"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </TableCell>
                          {dates.map((date) => {
                            const key = `${task.id}__${date}`;
                            const val = hours[key] ?? 0;
                            const noteText = notes[key] ?? "";
                            const hasNote = noteText.trim().length > 0;

                            const leaveType = leaveDates[date];
                            const originalHolidayName = holidayDates[date];
                            
                            const dObj = new Date(`${date}T00:00:00.000Z`);
                            const dayIndex = dObj.getUTCDay();
                            const isWeekendDay = dayIndex === 0 || dayIndex === 6;
                            
                            const isHoliday = !!originalHolidayName && !workedHolidays[date];
                            const holidayName = isHoliday ? originalHolidayName : null;
                            
                            const isWeeklyOff = isWeekendDay && !originalHolidayName && !workedWeekends[date];
                            
                            const todayStr = new Date().toLocaleDateString('sv-SE');
                            const isFutureDay = date > todayStr;
                            
                            const hasLoggedHours = (hours[key] ?? 0) > 0;
                            const isNotAllocated = editable &&
                                                   !hasLoggedHours &&
                                                   !!((task.allocationStartDate && date < task.allocationStartDate) ||
                                                      (task.allocationEndDate && date > task.allocationEndDate));

                            const isDisabled = !editable || !!leaveType || !!holidayName || isWeeklyOff || isFutureDay || isNotAllocated;

                            return (
                              <TableCell 
                                key={date} 
                                className={`p-1 text-center border-r border-gray-100 last:border-0 relative ${
                                  leaveType
                                    ? "bg-emerald-50/50"
                                    : isNotAllocated
                                    ? "bg-gray-100/50"
                                    : holidayName
                                    ? "bg-amber-50/50" 
                                    : isWeeklyOff
                                    ? "bg-slate-100/50"
                                    : ""
                                } ${date === focusDateISO ? "ring-1 ring-inset ring-emerald-300 bg-emerald-50/30" : ""}`}
                              >
                                <div className="flex flex-col gap-1 items-center min-h-[50px] justify-center">
                                  {leaveType ? (
                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded shadow-sm select-none">
                                      🌴 {leaveType} Leave
                                    </span>
                                  ) : isNotAllocated ? (
                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-200/80 px-1.5 py-0.5 rounded shadow-sm select-none">
                                      🚫 Not Allocated
                                    </span>
                                  ) : holidayName ? (
                                    <div className="flex flex-col gap-1 items-center">
                                      <span 
                                        className="text-[10px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded shadow-sm select-none max-w-[70px] truncate"
                                        title={holidayName}
                                      >
                                        🎉 {holidayName}
                                      </span>
                                      {editable && !isFutureDay && (
                                        <button
                                          type="button"
                                          onClick={() => setWorkedHolidays((prev) => ({ ...prev, [date]: true }))}
                                          className="text-[9px] text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/50 px-1 py-0.5 rounded transition-all font-semibold"
                                        >
                                          I worked
                                        </button>
                                      )}
                                    </div>
                                  ) : isWeeklyOff ? (
                                    <div className="flex flex-col gap-1 items-center">
                                      <span className="text-[10px] font-bold text-slate-700 bg-slate-200/80 px-1.5 py-0.5 rounded shadow-sm select-none">
                                        💤 Weekly Off
                                      </span>
                                      {editable && !isFutureDay && (
                                        <button
                                          type="button"
                                          onClick={() => setWorkedWeekends((prev) => ({ ...prev, [date]: true }))}
                                          className="text-[9px] text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 px-1 py-0.5 rounded transition-all font-semibold"
                                        >
                                          I worked
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <>
                                      <Input
                                        type="number"
                                        min={0}
                                        max={24}
                                        step={0.5}
                                        disabled={isDisabled}
                                        value={hours[key] ?? ""}
                                        onChange={(e) => {
                                          const v = e.target.value === "" ? 0 : Number(e.target.value);
                                          setHours((prev) => ({
                                            ...prev,
                                            [key]: v,
                                          }));
                                          const c = task
                                            ? commentsCriteriaForTask(task.name, task.commentsCriteria)
                                            : "COMPULSORY";
                                          if (v === 8 && (c === "LESS_THAN_8_HOURS" || c === "MORE_THAN_8_HOURS")) {
                                            setNotes((prev) => {
                                              const next = { ...prev };
                                              delete next[key];
                                              return next;
                                            });
                                          }
                                        }}
                                        className="w-16 h-8 text-center mx-auto bg-white border-gray-200 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
                                      />
                                      {val > 0 && (hasNote || editable) && (() => {
                                        const criteria = task
                                          ? commentsCriteriaForTask(task.name, task.commentsCriteria)
                                          : "COMPULSORY";
                                        if ((criteria === "LESS_THAN_8_HOURS" || criteria === "MORE_THAN_8_HOURS") && val === 8) {
                                          return null;
                                        }
                                        let commentRequired = false;
                                        if (criteria === "COMPULSORY") {
                                          commentRequired = true;
                                        } else if (criteria === "LESS_THAN_8_HOURS" || criteria === "MORE_THAN_8_HOURS") {
                                          commentRequired = val !== 8;
                                        }

                                        return (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setCommentingCell({
                                                taskId: task.id,
                                                taskName: task.name,
                                                projectName: task.projectName,
                                                clientName: task.clientName,
                                                date,
                                              })
                                            }
                                            className={`flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] gap-1 font-medium transition-all ${
                                              hasNote
                                                ? "text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                                                : commentRequired
                                                ? "text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 animate-pulse"
                                                : "text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100"
                                            }`}
                                          >
                                            <span>{hasNote ? "📝 Note" : "➕ Comment"}</span>
                                          </button>
                                        );
                                      })()}
                                      {originalHolidayName && editable && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setHours((prev) => {
                                              const next = { ...prev };
                                              for (const t of tasks) {
                                                delete next[`${t.id}__${date}`];
                                              }
                                              return next;
                                            });
                                            setWorkedHolidays((prev) => ({ ...prev, [date]: false }));
                                          }}
                                          className="text-[9px] text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-1 py-0.5 rounded transition-all"
                                        >
                                          Mark Holiday
                                        </button>
                                      )}
                                      {isWeekendDay && !originalHolidayName && editable && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setHours((prev) => {
                                              const next = { ...prev };
                                              for (const t of tasks) {
                                                delete next[`${t.id}__${date}`];
                                              }
                                              return next;
                                            });
                                            setWorkedWeekends((prev) => ({ ...prev, [date]: false }));
                                          }}
                                          className="text-[9px] text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-1 py-0.5 rounded transition-all"
                                        >
                                          Mark Weekly Off
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center font-semibold text-gray-900">{rowTotal}</TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                ))}
              </Fragment>
            ))}
            <TableRow className="bg-gray-50/50 font-bold text-gray-800">
              <TableCell>Total Daily Hours</TableCell>
              {dailyTotals.map((total, i) => (
                <TableCell
                  key={dates[i]}
                  className={`text-center ${
                    i < 5 && total < 8 ? "text-destructive" : ""
                  }`}
                >
                  {total}
                </TableCell>
              ))}
              <TableCell className="text-center">{weeklyTotal}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {/* Empty state when activeTaskIds is empty */}
        {tasks.length > 0 && activeTaskIds.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
            <p className="font-medium text-gray-500">Your timesheet grid is empty for this week.</p>
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-emerald-700 border-emerald-250 hover:bg-emerald-50 font-semibold gap-1.5 shadow-sm"
                onClick={() => {
                  const proj = availableProjects[0]?.projectName ?? "";
                  setSelectedProjectName(proj);
                  const projectTasks = tasks.filter((t) => t.projectName === proj && !activeTaskIds.includes(t.id));
                  setSelectedTaskId(projectTasks[0]?.id ?? "");
                  setIsAddEntryOpen(true);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Project / Task
              </Button>
            )}
          </div>
        )}

        {tasks.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No active project allocations for this week — contact Timesheet Admin.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive font-medium">{error}</p>}

      {editable && (
        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={handleSave} disabled={isPending} className="border-gray-300">
            {isPending ? "Saving…" : "Save Draft"}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} variant={isOverdue ? "destructive" : "default"}>
            {isPending ? "Submitting…" : isOverdue ? "Request Late Submission" : "Submit Weekly Timesheet"}
          </Button>
        </div>
      )}

      {/* Add Project / Task Dialog */}
      <Dialog open={isAddEntryOpen} onOpenChange={setIsAddEntryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 font-bold">Add Time Entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-gray-600">Select Project</Label>
              <Select
                value={selectedProjectName}
                onValueChange={(val) => {
                  const v = val ?? "";
                  setSelectedProjectName(v);
                  const projectTasks = tasks.filter((t) => t.projectName === v && !activeTaskIds.includes(t.id));
                  setSelectedTaskId(projectTasks[0]?.id ?? "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose project">
                    {(value) => {
                      const proj = availableProjects.find((p) => p.projectName === value);
                      return proj ? `${proj.projectName} (${proj.clientName})` : "Choose project";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((p) => (
                    <SelectItem key={p.projectName} value={p.projectName}>
                      {p.projectName} ({p.clientName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-gray-600">Select Task / Phase</Label>
              <Select
                value={selectedTaskId}
                onValueChange={(val) => setSelectedTaskId(val ?? "")}
                disabled={!selectedProjectName}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose task">
                    {(value) => tasks.find((t) => t.id === value)?.name || "Choose task"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableTasksForSelectedProject.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProjectName && availableTasksForSelectedProject.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">All tasks for this project are already added to your timesheet.</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsAddEntryOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (selectedTaskId) {
                  setActiveTaskIds((prev) => [...prev, selectedTaskId]);
                  setIsAddEntryOpen(false);
                }
              }}
              disabled={!selectedTaskId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Add Row
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cell Comment Dialog */}
      <Dialog open={commentingCell !== null} onOpenChange={(open) => !open && setCommentingCell(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 font-bold">Add Comment / Notes</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="text-xs text-muted-foreground flex flex-col gap-0.5 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
              <div>
                <span className="font-semibold text-gray-700">Client:</span> {commentingCell?.clientName}
              </div>
              <div>
                <span className="font-semibold text-gray-700">Project:</span> {commentingCell?.projectName}
              </div>
              <div>
                <span className="font-semibold text-gray-700">Task:</span> {commentingCell?.taskName}
              </div>
              <div className="mt-1 font-semibold text-emerald-800">
                Date: {formatDisplayDate(commentingCell?.date)}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cell-note" className="text-xs font-semibold text-gray-600">Daily Work Description (Mandatory)</Label>
              <Textarea
                id="cell-note"
                rows={4}
                disabled={!editable}
                placeholder="Describe what you worked on today (e.g. Implemented auth middleware, fixed CSS layout bugs)..."
                value={commentingCell ? (notes[`${commentingCell.taskId}__${commentingCell.date}`] ?? "") : ""}
                onChange={(e) => {
                  if (commentingCell) {
                    const key = `${commentingCell.taskId}__${commentingCell.date}`;
                    setNotes((prev) => ({ ...prev, [key]: e.target.value }));
                  }
                }}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCommentingCell(null)}>Save & Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
