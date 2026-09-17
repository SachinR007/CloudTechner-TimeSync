export const ROLES = ["EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Timesheet admins have the same HR operational access, including late approvals.
export const HR_ACCESS_ROLES: Role[] = ["HR_ADMIN", "TS_ADMIN"];

export function hasHrAccess(role: Role): boolean {
  return HR_ACCESS_ROLES.includes(role);
}

export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "TS_ADMIN":
      return "/employee";
    case "HR_ADMIN":
      return "/hr";
    case "PROJECT_MANAGER":
      return "/manager";
    case "EMPLOYEE":
    default:
      return "/employee";
  }
}
