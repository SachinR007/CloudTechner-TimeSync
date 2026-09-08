import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── Wipe existing data (FK-safe order) so re-seeding starts clean ──
  await prisma.approvalHistory.deleteMany();
  await prisma.timesheetLine.deleteMany();
  await prisma.timesheetHeader.deleteMany();
  await prisma.projectAllocation.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.holidayPlan.deleteMany();
  // Clear employee self-references before deleting employees.
  await prisma.employee.updateMany({
    data: { reportingManagerId: null, approverOverrideId: null, holidayPlanId: null },
  });
  await prisma.employee.deleteMany();

  // ── Holiday Plans ──
  const defaultPlan = await prisma.holidayPlan.create({
    data: { name: "Default", isDefault: true },
  });
  const granicusPlan = await prisma.holidayPlan.create({
    data: { name: "Granicus", isDefault: false },
  });
  const klubPlan = await prisma.holidayPlan.create({
    data: { name: "Bangalore - Klub", isDefault: false },
  });
  const cloverPlan = await prisma.holidayPlan.create({
    data: { name: "Bangalore-Clover", isDefault: false },
  });

  // ── Employees (CloudTechner org) ──
  // 2 Timesheet Admins, 1 HR Admin, 2 Project Managers, 4 Employees.
  const siba = await prisma.employee.create({
    data: {
      id: "CT001",
      name: "Siba Prasad",
      email: "siba@cloudtechner.com",
      role: "TS_ADMIN",
      passwordHash,
      holidayPlanId: defaultPlan.id,
    },
  });

  await prisma.employee.create({
    data: {
      id: "CT002",
      name: "Prabhakar",
      email: "prabhakar@cloudtechner.com",
      role: "TS_ADMIN",
      passwordHash,
      holidayPlanId: defaultPlan.id,
    },
  });

  const bhavya = await prisma.employee.create({
    data: {
      id: "CT003",
      name: "Bhavya",
      email: "bhavya@cloudtechner.com",
      role: "HR_ADMIN",
      passwordHash,
      holidayPlanId: defaultPlan.id,
    },
  });

  // Two PMs cross-approve each other's timesheets -- neither can self-approve.
  const anil = await prisma.employee.create({
    data: {
      id: "CT004",
      name: "Anil Kumar",
      email: "anil@cloudtechner.com",
      role: "PROJECT_MANAGER",
      passwordHash,
      holidayPlanId: defaultPlan.id,
    },
  });

  const rohitGaur = await prisma.employee.create({
    data: {
      id: "CT005",
      name: "Rohit Gaur",
      email: "rohit.gaur@cloudtechner.com",
      role: "PROJECT_MANAGER",
      passwordHash,
      approverOverrideId: anil.id,
      holidayPlanId: defaultPlan.id,
    },
  });

  await prisma.employee.update({
    where: { id: anil.id },
    data: { approverOverrideId: rohitGaur.id },
  });

  // Employees -> report to a PM.
  const sachin = await prisma.employee.create({
    data: {
      id: "CT006",
      name: "Sachin",
      email: "sachin@cloudtechner.com",
      role: "EMPLOYEE",
      passwordHash,
      reportingManagerId: anil.id,
      holidayPlanId: granicusPlan.id,
    },
  });

  const rajat = await prisma.employee.create({
    data: {
      id: "CT007",
      name: "Rajat",
      email: "rajat@cloudtechner.com",
      role: "EMPLOYEE",
      passwordHash,
      reportingManagerId: anil.id,
      holidayPlanId: defaultPlan.id,
    },
  });

  const mehul = await prisma.employee.create({
    data: {
      id: "CT008",
      name: "Mehul",
      email: "mehul@cloudtechner.com",
      role: "EMPLOYEE",
      passwordHash,
      reportingManagerId: rohitGaur.id,
      holidayPlanId: granicusPlan.id,
    },
  });

  const rohit = await prisma.employee.create({
    data: {
      id: "CT009",
      name: "Rohit",
      email: "rohit@cloudtechner.com",
      role: "EMPLOYEE",
      passwordHash,
      reportingManagerId: rohitGaur.id,
      holidayPlanId: defaultPlan.id,
    },
  });

  await prisma.employee.updateMany({
    data: { canSubmitTimesheet: true },
  });

  // ── Clients / Projects / Tasks ──
  const acme = await prisma.client.create({
    data: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Acme Corp",
      code: "C001",
      country: "United States",
      billingCurrency: "USD",
      clientManagerId: siba.id,
      city: "New York",
    },
  });

  const globex = await prisma.client.create({
    data: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Globex Inc",
      code: "C002",
      country: "India",
      billingCurrency: "INR",
      clientManagerId: bhavya.id,
      city: "Bengaluru",
    },
  });

  const projectA = await prisma.project.create({
    data: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      clientId: acme.id,
      name: "Website Revamp",
      code: "P0001",
      status: "IN_PROGRESS",
      projectManagerId: anil.id,
      billingModel: "TIME_AND_MATERIAL",
      startDate: new Date("2026-01-01"),
    },
  });

  const projectB = await prisma.project.create({
    data: {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      clientId: acme.id,
      name: "Mobile App",
      code: "P0002",
      status: "IN_PROGRESS",
      projectManagerId: anil.id,
      billingModel: "FIXED_FEE",
      startDate: new Date("2026-01-01"),
    },
  });

  const projectC = await prisma.project.create({
    data: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      clientId: globex.id,
      name: "Data Platform",
      code: "P0003",
      status: "IN_PROGRESS",
      projectManagerId: rohitGaur.id,
      billingModel: "RETAINER",
      startDate: new Date("2026-01-01"),
    },
  });

  const taskDefs = [
    { project: projectA, names: ["Design", "Development", "QA", "Admin/Overhead"] },
    { project: projectB, names: ["Design", "Development", "QA", "Admin/Overhead"] },
    { project: projectC, names: ["Development", "QA", "Admin/Overhead"] },
  ];

  const defaultLeaveTaskNames = [
    "Casual Leave",
    "Sick Leave",
    "Privilege Leave",
    "Floater Leave",
    "Special Leave",
  ];

  for (const { project, names } of taskDefs) {
    for (const name of [...names, ...defaultLeaveTaskNames]) {
      await prisma.task.create({
        data: {
          projectId: project.id,
          name,
          isDefaultTemplate: name === "Admin/Overhead" || defaultLeaveTaskNames.includes(name),
        },
      });
    }
  }

  // ── Allocations ──
  await prisma.projectAllocation.createMany({
    data: [
      // Sachin: partial allocation split across two projects (40% + 60%)
      {
        projectId: projectA.id,
        employeeId: sachin.id,
        allocationPercentage: 40,
        startDate: new Date("2026-01-01"),
        createdById: siba.id,
      },
      {
        projectId: projectB.id,
        employeeId: sachin.id,
        allocationPercentage: 60,
        startDate: new Date("2026-01-01"),
        createdById: siba.id,
      },
      // Rajat: full-time on Website Revamp
      {
        projectId: projectA.id,
        employeeId: rajat.id,
        allocationPercentage: 100,
        startDate: new Date("2026-01-01"),
        createdById: siba.id,
      },
      // Mehul: staggered allocation on Data Platform -- Jan-Feb, gap, then Apr onward
      {
        projectId: projectC.id,
        employeeId: mehul.id,
        allocationPercentage: 100,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-02-28"),
        createdById: siba.id,
      },
      {
        projectId: projectC.id,
        employeeId: mehul.id,
        allocationPercentage: 100,
        startDate: new Date("2026-04-01"),
        createdById: siba.id,
      },
      // Rohit: split 50/50 between Mobile App and Data Platform
      {
        projectId: projectB.id,
        employeeId: rohit.id,
        allocationPercentage: 50,
        startDate: new Date("2026-01-01"),
        createdById: siba.id,
      },
      {
        projectId: projectC.id,
        employeeId: rohit.id,
        allocationPercentage: 50,
        startDate: new Date("2026-01-01"),
        createdById: siba.id,
      },
    ],
    skipDuplicates: true,
  });

  // ── Seed Leave Balances for all employees ──
  const allEmployees = [siba.id, bhavya.id, anil.id, rohitGaur.id, sachin.id, rajat.id, mehul.id, rohit.id];
  for (const empId of allEmployees) {
    await prisma.leaveBalance.create({
      data: {
        employeeId: empId,
        casual: 12,
        sick: 12,
        earned: 15,
      },
    });
  }

  // ── Seed Default Holidays for 2026 ──
  await prisma.holiday.createMany({
    data: [
      { name: "New Year", date: new Date("2026-01-01"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Makar Sankranti", date: new Date("2026-01-14"), isFloaterLeave: true, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Republic Day", date: new Date("2026-01-26"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Holi", date: new Date("2026-03-04"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Good Friday", date: new Date("2026-04-03"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Eid-ul-Fitr", date: new Date("2026-05-27"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Eid-al-Adha", date: new Date("2026-06-26"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Independence Day", date: new Date("2026-08-15"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Gandhi Jayanti", date: new Date("2026-10-02"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Dussehra", date: new Date("2026-10-22"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Diwali", date: new Date("2026-11-12"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
      { name: "Christmas", date: new Date("2026-12-25"), isFloaterLeave: false, specialHoliday: false, holidayPlanId: defaultPlan.id },
    ],
    skipDuplicates: true,
  });

  // ── Seed Client-specific Holidays for 2026 ──
  await prisma.holiday.create({
    data: {
      name: "Granicus Day",
      date: new Date("2026-07-24"),
      isFloaterLeave: false,
      specialHoliday: false,
      holidayPlanId: granicusPlan.id,
    },
  });

  // ── Seed a sample approved leave for Sachin to demonstrate timesheet blocking ──
  await prisma.leave.create({
    data: {
      employeeId: sachin.id,
      leaveType: "CASUAL",
      startDate: new Date("2026-07-22"), // Wed of Sachin's timesheet week 2026-07-20
      endDate: new Date("2026-07-22"),
      status: "APPROVED",
      reason: "Personal family event",
    },
  });

  console.log("Seed complete.");
  console.log("Login with any of these (password: %s):", DEFAULT_PASSWORD);
  console.log("  Timesheet Admin -> siba@cloudtechner.com / prabhakar@cloudtechner.com");
  console.log("  HR Admin        -> bhavya@cloudtechner.com");
  console.log("  Project Manager -> anil@cloudtechner.com / rohit.gaur@cloudtechner.com");
  console.log(
    "  Employee        -> sachin@cloudtechner.com / rajat@cloudtechner.com / mehul@cloudtechner.com / rohit@cloudtechner.com"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
