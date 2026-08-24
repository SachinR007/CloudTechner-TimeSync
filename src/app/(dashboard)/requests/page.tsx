import { requireRole } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { RequestsClient } from "./requests-client";
import { redirect } from "next/navigation";

export default async function RequestsPage() {
  const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN");

  const isAdminOrHR = user.role === "TS_ADMIN" || user.role === "HR_ADMIN";
  if (!isAdminOrHR) {
    const access = await prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { isActive: true, canSubmitTimesheet: true },
    });
    if (!access.isActive || !access.canSubmitTimesheet) {
      redirect("/not-enabled");
    }
  }

  // Fetch active projects for dropdown
  const projects = await prisma.project.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  // Fetch requests based on role
  let requests = [];
  if (isAdminOrHR) {
    requests = await prisma.allocationRequest.findMany({
      include: {
        employee: { select: { name: true, email: true, isActive: true } },
        project: { select: { name: true, client: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  } else {
    requests = await prisma.allocationRequest.findMany({
      where: { employeeId: user.id },
      include: {
        employee: { select: { name: true, email: true, isActive: true } },
        project: { select: { name: true, client: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Check if current user is unassigned (no active project allocations today)
  const today = new Date();
  const myAllocations = await prisma.projectAllocation.findMany({
    where: {
      employeeId: user.id,
      startDate: { lte: today },
      OR: [
        { endDate: null },
        { endDate: { gte: today } },
      ],
      project: { isActive: true },
    },
  });

  const isUnassigned = myAllocations.length === 0;

  return (
    <RequestsClient
      isAdminOrHR={isAdminOrHR}
      projects={projects}
      requests={requests}
      isUnassigned={isUnassigned}
    />
  );
}
