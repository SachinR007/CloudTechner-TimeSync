import type { Role } from "@/lib/roles";

declare module "next-auth" {
  interface User {
    role: Role;
    canSubmitTimesheet?: boolean;
    sessionVersion?: string;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      canSubmitTimesheet: boolean;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    employeeId?: string;
    role?: Role;
    canSubmitTimesheet?: boolean;
    sessionVersion?: string;
  }
}
