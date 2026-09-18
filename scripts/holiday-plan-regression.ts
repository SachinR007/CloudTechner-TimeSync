import { prisma } from "../src/lib/prisma";

const tag = `HOLIDAY-REGRESSION-${Date.now()}`;
const date = new Date("2026-12-31T00:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  let firstPlanId: string | undefined;
  let secondPlanId: string | undefined;
  let employeeId: string | undefined;
  let temporaryDefaultPlanId: string | undefined;

  try {
    // CI starts with an empty migrated database, while production normally
    // already has a Default plan. Make this regression self-contained in both.
    let defaultPlan = await prisma.holidayPlan.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });
    if (!defaultPlan) {
      defaultPlan = await prisma.holidayPlan.create({
        data: { name: `${tag} Default`, isDefault: true },
        select: { id: true },
      });
      temporaryDefaultPlanId = defaultPlan.id;
    }

    const [firstPlan, secondPlan] = await prisma.$transaction([
      prisma.holidayPlan.create({ data: { name: `${tag} A` } }),
      prisma.holidayPlan.create({ data: { name: `${tag} B` } }),
    ]);
    firstPlanId = firstPlan.id;
    secondPlanId = secondPlan.id;

    const employee = await prisma.employee.create({
      data: {
        id: `${tag}-EMPLOYEE`,
        name: "Holiday Regression Employee",
        email: `${tag.toLowerCase()}@example.invalid`,
        passwordHash: "not-used-by-regression",
        holidayPlanId: firstPlan.id,
      },
      select: { id: true },
    });
    employeeId = employee.id;

    await prisma.holiday.upsert({
      where: { holidayPlanId_date: { holidayPlanId: firstPlan.id, date } },
      create: { name: "Plan A original", date, holidayPlanId: firstPlan.id },
      update: { name: "Plan A original" },
    });
    await prisma.holiday.upsert({
      where: { holidayPlanId_date: { holidayPlanId: secondPlan.id, date } },
      create: { name: "Plan B original", date, holidayPlanId: secondPlan.id },
      update: { name: "Plan B original" },
    });
    await prisma.holiday.upsert({
      where: { holidayPlanId_date: { holidayPlanId: firstPlan.id, date } },
      create: { name: "Plan A replacement", date, holidayPlanId: firstPlan.id },
      update: { name: "Plan A replacement" },
    });

    const holidays = await prisma.holiday.findMany({
      where: { holidayPlanId: { in: [firstPlan.id, secondPlan.id] } },
      select: { holidayPlanId: true, name: true },
    });
    assert(holidays.length === 2, "same-date entries were not isolated by holiday plan");
    assert(holidays.some((holiday) => holiday.holidayPlanId === firstPlan.id && holiday.name === "Plan A replacement"), "plan A was not updated");
    assert(holidays.some((holiday) => holiday.holidayPlanId === secondPlan.id && holiday.name === "Plan B original"), "plan B was changed by plan A import");

    // An employee must have one effective calendar: switching is exclusive and
    // removal returns the employee to Default rather than leaving no calendar.
    await prisma.employee.update({ where: { id: employee.id }, data: { holidayPlanId: secondPlan.id } });
    let assignedEmployee = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, select: { holidayPlanId: true } });
    assert(assignedEmployee.holidayPlanId === secondPlan.id, "employee was not moved exclusively to plan B");
    await prisma.employee.update({ where: { id: employee.id }, data: { holidayPlanId: defaultPlan.id } });
    assignedEmployee = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, select: { holidayPlanId: true } });
    assert(assignedEmployee.holidayPlanId === defaultPlan.id, "employee was not returned to the default plan");
    console.log("HOLIDAY_PLAN_REGRESSION_PASS");
  } finally {
    if (employeeId) {
      await prisma.employee.delete({ where: { id: employeeId } });
    }
    if (firstPlanId || secondPlanId) {
      await prisma.holidayPlan.deleteMany({ where: { id: { in: [firstPlanId, secondPlanId].filter((id): id is string => Boolean(id)) } } });
    }
    if (temporaryDefaultPlanId) {
      await prisma.holidayPlan.delete({ where: { id: temporaryDefaultPlanId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
