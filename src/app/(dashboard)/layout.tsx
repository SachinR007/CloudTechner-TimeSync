import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./actions";
import { prisma } from "@/lib/prisma";
import { SidebarNav, NavItem } from "@/components/sidebar-nav";
import Link from "next/link";
import { dashboardPathForRole, hasHrAccess } from "@/lib/roles";
import { NotificationBell } from "@/components/notification-bell";

const ROLE_LABEL: Record<string, string> = {
  TS_ADMIN: "Timesheet Admin",
  HR_ADMIN: "HR Admin",
  PROJECT_MANAGER: "Project Manager",
  EMPLOYEE: "Employee",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userRole = session.user.role;
  const userId = session.user.id;

  // Query to check if the user has any manager or approval duties
  const [isDirectManager, isProjectManager, isClientManager, pendingApprovalsCount, unreadNotifications] = await Promise.all([
    prisma.employee.count({
      where: {
        OR: [
          { reportingManagerId: userId },
          { approverOverrideId: userId },
        ],
        isActive: true,
      },
    }),
    prisma.project.count({
      where: { projectManagerId: userId, isActive: true },
    }),
    prisma.client.count({
      where: { clientManagerId: userId, isActive: true },
    }),
    // Per-project approval slices awaiting this user (excludes relieved employees).
    prisma.timesheetApproval.count({
      where: {
        approverId: userId,
        status: "PENDING",
        timesheetHeader: {
          employee: { isActive: true },
          OR: [{ isLate: false }, { isLate: true, lateApproved: true }],
        },
      },
    }),
    prisma.notification.findMany({ where: { employeeId: userId, isRead: false }, select: { id: true, message: true, kind: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const hasManagerDuties =
    isDirectManager > 0 ||
    isProjectManager > 0 ||
    isClientManager > 0 ||
    ["TS_ADMIN", "HR_ADMIN", "PROJECT_MANAGER"].includes(userRole);

  let pendingRequestsCount = 0;
  if (hasHrAccess(userRole)) {
    pendingRequestsCount = await prisma.allocationRequest.count({
      where: { status: "PENDING" },
    });
  }

  const workspaceItems: NavItem[] = [
    { href: "/employee", label: "My Timesheet", icon: "timesheet" as const },
    {
      href: "/requests",
      label: "Allocation Requests",
      icon: "requests" as const,
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
    },
  ];

  if (hasManagerDuties) {
    workspaceItems.push({
      href: "/manager",
      label: "Approvals",
      icon: "approvals" as const,
      badge: pendingApprovalsCount,
    });
  }

  // Only TS_ADMIN has access to the Admin Dashboard
  if (userRole === "TS_ADMIN") {
  } else if (userRole === "HR_ADMIN") {
    workspaceItems.push({
      href: "/hr",
      label: "HR dashboard",
      icon: "admin-dash" as const,
    });
  }

  const manageItems: NavItem[] = [];
  if (userRole === "TS_ADMIN") {
    manageItems.push({ href: "/admin", label: "Dashboard", icon: "admin-dash" as const });
    manageItems.push({ href: "/hr", label: "HR dashboard", icon: "admin-dash" as const });
    manageItems.push({ href: "/hr/employees", label: "Employees", icon: "hr-employees" as const });
    manageItems.push({ href: "/admin/clients", label: "Clients", icon: "admin-clients" as const });
    manageItems.push({ href: "/admin/projects", label: "Projects", icon: "admin-projects" as const });
    manageItems.push({ href: "/hr/holidays", label: "Holidays", icon: "holidays" as const });
    manageItems.push({ href: "/hr/import-timesheets", label: "Import / Export Timesheets", icon: "import-keka" as const });
  } else if (userRole === "HR_ADMIN") {
    manageItems.push({ href: "/hr/employees", label: "Employees", icon: "hr-employees" as const });
    manageItems.push({ href: "/hr/holidays", label: "Holidays", icon: "holidays" as const });
    manageItems.push({ href: "/hr/import-timesheets", label: "Import / Export Timesheets", icon: "import-keka" as const });
  }

  const reportItems: NavItem[] = [];
  if (userRole === "TS_ADMIN") {
    reportItems.push({ href: "/admin/allocations", label: "Utilization report", icon: "admin-allocations" as const });
    reportItems.push({ href: "/admin/history", label: "Timesheet history", icon: "timesheet-history" as const });
  }

  const navGroups = [
    { title: "Workspace", items: workspaceItems },
    ...(manageItems.length > 0 ? [{ title: "Manage", items: manageItems }] : []),
    ...(reportItems.length > 0 ? [{ title: "Reports", items: reportItems }] : []),
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50/50">
      {/* Left Sidebar */}
      <aside className="flex w-64 flex-col bg-[#07241C] text-white border-r border-emerald-950 shrink-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <img src="/logo.png" alt="CloudTechner Logo" className="h-9 w-9 object-contain rounded-md bg-white p-0.5 shadow-sm" />
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-sm font-bold tracking-tight text-white">CloudTechner</span>
            <span className="text-xs font-light text-white/70">CT Orbit</span>
          </div>
          <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 select-none">
            v1.0
          </span>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav groups={navGroups} />
        </div>

        {/* Footer profile */}
        <div className="mt-auto border-t border-white/5 p-4 flex flex-col gap-3 bg-[#051c16]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30 text-sm font-semibold text-emerald-400">
              {(session.user.name ?? "User").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-semibold text-white">{session.user.name ?? "User"}</span>
              <span className="truncate text-[10px] text-white/50">{ROLE_LABEL[userRole]}</span>
            </div>
          </div>
          <div className="mt-1">
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                className="h-11 w-full justify-center gap-2 border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/90 hover:bg-white/10 hover:text-white"
                title="Sign out"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                </svg>
                Logout
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Right Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar for Breadcrumbs */}
        <header className="flex h-14 items-center justify-between border-b border-gray-200/80 bg-white px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <Link
              href={dashboardPathForRole(userRole)}
              className="hover:text-emerald-700 hover:underline transition-colors"
            >
              Home
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-foreground capitalize font-semibold">
              CT Orbit Portal
            </span>
          </div>
          <NotificationBell notifications={unreadNotifications.map((notification) => ({ ...notification, createdAt: notification.createdAt.toISOString() }))} />
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
          {children}
        </main>
      </div>
    </div>
  );
}
