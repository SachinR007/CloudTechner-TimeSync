import { prisma } from "@/lib/prisma";

export async function assertTimesheetAccess(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { isActive: true, canSubmitTimesheet: true },
  });

  if (!employee?.isActive) {
    throw new Error("Your employee profile is inactive. Contact HR.");
  }

  if (!employee.canSubmitTimesheet) {
    throw new Error("Timesheet access is not enabled for your profile. Contact HR.");
  }
}
