ALTER TABLE "Employee" ADD COLUMN "canSubmitTimesheet" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Employee"
SET "canSubmitTimesheet" = true
WHERE "isActive" = true;
