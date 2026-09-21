CREATE TYPE "NotificationKind" AS ENUM ('GENERAL', 'MISSED_TIMESHEET');

ALTER TABLE "Notification"
  ADD COLUMN "kind" "NotificationKind" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "subjectEmployeeId" TEXT;

CREATE INDEX "Notification_kind_subjectEmployeeId_idx"
  ON "Notification"("kind", "subjectEmployeeId");
