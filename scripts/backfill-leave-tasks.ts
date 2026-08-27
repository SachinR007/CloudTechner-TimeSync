// Adds the standard leave tasks to existing projects.
//
// Safe and idempotent:
// - creates only missing tasks
// - reactivates existing matching leave tasks if they were inactive
// - does not touch timesheet headers, lines, approvals, allocations, or employees
//
// Preview active projects:
//   npm run tasks:backfill-leave
//
// Apply active projects:
//   npm run tasks:backfill-leave -- --apply
//
// Include inactive projects too:
//   INCLUDE_INACTIVE_PROJECTS=true npm run tasks:backfill-leave -- --apply

import { prisma } from "@/lib/prisma";

const LEAVE_TASK_NAMES = ["Casual Leave", "Sick Leave", "Privilege Leave"];

function normalizeTaskName(name: string) {
  return name.trim().toLowerCase();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const includeInactiveProjects = process.env.INCLUDE_INACTIVE_PROJECTS === "true";

  const projects = await prisma.project.findMany({
    where: includeInactiveProjects ? undefined : { isActive: true },
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
      endDate: true,
      tasks: {
        select: {
          id: true,
          name: true,
          isActive: true,
          isDefaultTemplate: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  let created = 0;
  let reactivated = 0;
  let alreadyReady = 0;

  for (const project of projects) {
    const existingByName = new Map(project.tasks.map((task) => [normalizeTaskName(task.name), task]));

    for (const taskName of LEAVE_TASK_NAMES) {
      const existing = existingByName.get(normalizeTaskName(taskName));

      if (!existing) {
        if (apply) {
          await prisma.task.create({
            data: {
              projectId: project.id,
              name: taskName,
              isDefaultTemplate: true,
              isActive: true,
              startDate: project.startDate,
              endDate: project.endDate,
            },
          });
        }
        created += 1;
        continue;
      }

      if (!existing.isActive || !existing.isDefaultTemplate) {
        if (apply) {
          await prisma.task.update({
            where: { id: existing.id },
            data: { isActive: true, isDefaultTemplate: true },
          });
        }
        reactivated += 1;
        continue;
      }

      alreadyReady += 1;
    }
  }

  console.log(apply ? "Leave task backfill applied." : "Leave task backfill preview.");
  console.log({
    projectScope: includeInactiveProjects ? "all projects" : "active projects",
    projectsScanned: projects.length,
    created,
    reactivated,
    alreadyReady,
  });
  if (!apply) {
    console.log("No changes were written. Re-run with -- --apply to update the database.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
