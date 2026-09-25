"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendTimesheetReminder } from "./actions";
import { captureDashboardScroll, restoreDashboardScroll } from "@/lib/dashboard-scroll";

interface NotifyButtonProps {
  employeeId: string;
  weekStartISO: string;
}

export function NotifyButton({ employeeId, weekStartISO }: NotifyButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = React.useState(false);

  const handleNotify = () => {
    if (sent) return;
    const scroll = captureDashboardScroll();
    startTransition(async () => {
      try {
        await sendTimesheetReminder(employeeId, weekStartISO);
        restoreDashboardScroll(scroll);
        setSent(true);
        // Reset sent status after 3 seconds
        setTimeout(() => setSent(false), 3000);
      } catch (err) {
        restoreDashboardScroll(scroll);
        alert(err instanceof Error ? err.message : "Failed to send notification");
      }
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending || sent}
      onClick={handleNotify}
      className={`h-7 px-2.5 text-xs font-semibold rounded-md border flex items-center gap-1.5 transition-all select-none ${
        sent
          ? "bg-emerald-50 text-emerald-700 border-emerald-250 cursor-default"
          : "bg-white text-gray-700 hover:text-emerald-700 hover:bg-emerald-50/50 hover:border-emerald-600/30 border-gray-200"
      }`}
    >
      {isPending ? (
        <>
          <svg
            className="animate-spin -ml-0.5 h-3.5 w-3.5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Sending...</span>
        </>
      ) : sent ? (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
              clipRule="evenodd"
            />
          </svg>
          <span>Notified</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
            />
          </svg>
          <span>Notify</span>
        </>
      )}
    </Button>
  );
}
