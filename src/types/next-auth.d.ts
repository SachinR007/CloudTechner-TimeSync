import type { Role } from "@/lib/roles";

declare module "next-auth" {
  interface User {
    role: Role;
    sessionVersion?: string;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    employeeId?: string;
    role?: Role;
    sessionVersion?: string;
  }
}
