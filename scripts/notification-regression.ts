import { prisma } from "../src/lib/prisma";

const tag = `NOTIFY-REGRESSION-${Date.now()}`;
const managerId = `${tag}-M`;
const employeeId = `${tag}-E`;
const employeeMessage = `${tag}: Please fill your timesheet for week of 15/09/2026.`;
const managerMessage = `${tag}: Test Employee did not fill the timesheet for week of 15/09/2026.`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sendReminderOnce() {
  const existing = await prisma.notification.findMany({
    where: {
      employeeId: { in: [employeeId, managerId] },
      isRead: false,
      message: { in: [employeeMessage, managerMessage] },
    },
    select: { employeeId: true, message: true },
  });
  const sent = new Set(existing.map((notification) => `${notification.employeeId}:${notification.message}`));
  const creates = [];
  if (!sent.has(`${employeeId}:${employeeMessage}`)) creates.push(prisma.notification.create({ data: { employeeId, message: employeeMessage } }));
  if (!sent.has(`${managerId}:${managerMessage}`)) creates.push(prisma.notification.create({ data: { employeeId: managerId, message: managerMessage, kind: "MISSED_TIMESHEET", subjectEmployeeId: employeeId } }));
  await prisma.$transaction(creates);
}

async function main() {
  try {
    await prisma.employee.create({ data: { id: managerId, name: "Test Manager", email: `${tag}-manager@example.test`, passwordHash: "test", role: "PROJECT_MANAGER", canSubmitTimesheet: true } });
    await prisma.employee.create({ data: { id: employeeId, name: "Test Employee", email: `${tag}-employee@example.test`, passwordHash: "test", reportingManagerId: managerId, canSubmitTimesheet: true } });

    await sendReminderOnce();
    await sendReminderOnce();
    const unread = await prisma.notification.findMany({ where: { message: { startsWith: tag }, isRead: false }, select: { employeeId: true, message: true, kind: true, subjectEmployeeId: true } });
    assert(unread.length === 2, "duplicate reminder was created");
    assert(unread.some((notification) => notification.employeeId === employeeId && notification.message === employeeMessage), "employee reminder missing");
    assert(unread.some((notification) => notification.employeeId === managerId && notification.message === managerMessage), "reporting-manager reminder missing");
    assert(unread.some((notification) => notification.employeeId === employeeId && notification.kind === "GENERAL"), "employee reminder should remain personal");
    assert(unread.some((notification) => notification.employeeId === managerId && notification.kind === "MISSED_TIMESHEET" && notification.subjectEmployeeId === employeeId), "manager reminder metadata was not stored");

    const employeeBell = await prisma.notification.findMany({ where: { employeeId, isRead: false } });
    const managerBell = await prisma.notification.findMany({ where: { employeeId: managerId, isRead: false } });
    assert(employeeBell.length === 1 && managerBell.length === 1, "notification bell recipient isolation failed");

    await prisma.notification.updateMany({ where: { id: employeeBell[0].id, employeeId: managerId }, data: { isRead: true } });
    assert(await prisma.notification.count({ where: { id: employeeBell[0].id, isRead: false } }) === 1, "one user dismissed another user's notification");
    await prisma.notification.updateMany({ where: { id: managerBell[0].id, employeeId: managerId }, data: { isRead: true } });
    assert(await prisma.notification.count({ where: { id: managerBell[0].id, isRead: true } }) === 1, "manager could not dismiss own notification");

    console.log("NOTIFICATION_REGRESSION_PASS");
  } finally {
    await prisma.notification.deleteMany({ where: { message: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { id: { in: [employeeId, managerId] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
