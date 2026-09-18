-- A plan has at most one holiday per calendar date. Existing production data
-- was checked for duplicates before this forward-only migration was added.
ALTER TABLE "Holiday"
ADD CONSTRAINT "Holiday_holidayPlanId_date_key" UNIQUE ("holidayPlanId", "date");
