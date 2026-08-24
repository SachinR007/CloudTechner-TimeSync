import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const id = "TMP-AUTHZ-LOCAL";
  const email = "tmp-authz-local@example.com";

  await prisma.employee.deleteMany({ where: { OR: [{ id }, { email }] } });

  const countsBefore = {
    activeAllowed: await prisma.employee.count({ where: { isActive: true, canSubmitTimesheet: true } }),
    activeBlocked: await prisma.employee.count({ where: { isActive: true, canSubmitTimesheet: false } }),
  };

  const created = await prisma.employee.create({
    data: {
      id,
      name: "Temporary Authz Local",
      email,
      passwordHash: "not-used",
      role: "EMPLOYEE",
      isActive: true,
    },
    select: { id: true, canSubmitTimesheet: true },
  });

  await prisma.employee.update({ where: { id }, data: { canSubmitTimesheet: true } });
  const enabled = await prisma.employee.findUniqueOrThrow({
    where: { id },
    select: { canSubmitTimesheet: true },
  });

  await prisma.employee.update({ where: { id }, data: { canSubmitTimesheet: false } });
  const disabled = await prisma.employee.findUniqueOrThrow({
    where: { id },
    select: { canSubmitTimesheet: true },
  });

  await prisma.employee.delete({ where: { id } });
  const leftover = await prisma.employee.count({ where: { OR: [{ id }, { email }] } });

  const result = {
    countsBefore,
    newEmployeeDefaultIsDisabled: created.canSubmitTimesheet === false,
    enableToggleWorks: enabled.canSubmitTimesheet === true,
    disableToggleWorks: disabled.canSubmitTimesheet === false,
    tempDataCleanedUp: leftover === 0,
  };

  const pass = Object.values(result).every((value) =>
    typeof value === "boolean" ? value : true
  );

  console.log(JSON.stringify({ status: pass ? "PASS" : "FAIL", ...result }, null, 2));
  if (!pass) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
