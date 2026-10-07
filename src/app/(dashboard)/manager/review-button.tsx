"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReviewDialog, type ReviewLine } from "./review-dialog";
import type { ReviewHoliday } from "@/lib/review-holidays";

export function ReviewButton({
  approvalId,
  employeeName,
  projectName,
  dates,
  lines,
  holidays,
  submitComments,
}: {
  approvalId: string;
  employeeName: string;
  projectName: string;
  dates: string[];
  lines: ReviewLine[];
  holidays: ReviewHoliday[];
  submitComments: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Review
      </Button>
      <ReviewDialog
        approvalId={approvalId}
        employeeName={employeeName}
        projectName={projectName}
        dates={dates}
        lines={lines}
        holidays={holidays}
        submitComments={submitComments}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
