import { prisma } from "../src/lib/prisma";

const tag = `HOLIDAY-REGRESSION-${Date.now()}`;
const date = new Date("2026-12-31T00:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  let firstPlanId: string | undefined;
  let secondPlanId: string | undefined;

  try {
    const [firstPlan, secondPlan] = await prisma.$transaction([
      prisma.holidayPlan.create({ data: { name: `${tag} A` } }),
      prisma.holidayPlan.create({ data: { name: `${tag} B` } }),
    ]);
    firstPlanId = firstPlan.id;
    secondPlanId = secondPlan.id;

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
    console.log("HOLIDAY_PLAN_REGRESSION_PASS");
  } finally {
    if (firstPlanId || secondPlanId) {
      await prisma.holidayPlan.deleteMany({ where: { id: { in: [firstPlanId, secondPlanId].filter((id): id is string => Boolean(id)) } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
