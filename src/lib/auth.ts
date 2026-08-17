import NextAuth from "next-auth";
import AzureAD from "next-auth/providers/azure-ad";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";

const azureClientId = process.env.AZURE_AD_CLIENT_ID;
const azureClientSecret = process.env.AZURE_AD_CLIENT_SECRET;
const azureTenantId = process.env.AZURE_AD_TENANT_ID;
const azureEnabled = !!azureClientId && !!azureClientSecret && !!azureTenantId;
const credentialsEnabled = process.env.ENABLE_CREDENTIALS_LOGIN !== "false";
const allowedEmailDomain = (process.env.SSO_ALLOWED_EMAIL_DOMAIN ?? "@cloudtechner.com").toLowerCase();

async function findActiveEmployeeByEmail(email: string) {
  return prisma.employee.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      isActive: true,
    },
    select: { id: true, name: true, email: true, role: true, updatedAt: true },
  });
}

async function findActiveEmployeeCredentialsByEmail(email: string) {
  return prisma.employee.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      isActive: true,
    },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, updatedAt: true },
  });
}

async function validateSessionToken(employeeId?: string, sessionVersion?: string) {
  if (!employeeId || !sessionVersion) return null;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, role: true, isActive: true, updatedAt: true },
  });
  if (!employee?.isActive) return null;
  const currentVersion = employee.updatedAt.toISOString();
  if (currentVersion !== sessionVersion) return null;
  return { role: employee.role, sessionVersion: currentVersion };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  jwt: {
    maxAge: 8 * 60 * 60,
  },
  pages: { signIn: "/login" },
  providers: [
    ...(azureEnabled
      ? [
          AzureAD({
            clientId: azureClientId!,
            clientSecret: azureClientSecret!,
            issuer: `https://login.microsoftonline.com/${azureTenantId}/v2.0`,
          }),
        ]
      : []),
    ...(credentialsEnabled
      ? [
          Credentials({
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
              const email = credentials?.email as string | undefined;
              const password = credentials?.password as string | undefined;
              if (!email || !password) return null;

              const employee = await findActiveEmployeeCredentialsByEmail(email);
              if (!employee) return null;

              const valid = await bcrypt.compare(password, employee.passwordHash);
              if (!valid) return null;

              return {
                id: employee.id,
                name: employee.name,
                email: employee.email,
                role: employee.role,
                sessionVersion: employee.updatedAt.toISOString(),
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      if (account?.provider !== "azure-ad") return true;

      const profileEmail =
        user.email ??
        (profile as { email?: string; preferred_username?: string } | undefined)?.email ??
        (profile as { email?: string; preferred_username?: string } | undefined)?.preferred_username;
      if (!profileEmail) {
        console.warn("SSO denied: Azure profile did not include an email.");
        return "/login?error=not-authorized";
      }

      const normalizedEmail = profileEmail.toLowerCase();
      if (!normalizedEmail.endsWith(allowedEmailDomain)) {
        console.warn("SSO denied: email domain is not allowed.", { email: normalizedEmail });
        return "/login?error=not-authorized";
      }

      const employee = await findActiveEmployeeByEmail(normalizedEmail);
      if (!employee) {
        console.warn("SSO denied: employee is not active or mapped.", { email: normalizedEmail });
        return "/login?error=not-authorized";
      }

      user.id = employee.id;
      user.name = employee.name;
      user.email = employee.email;
      user.role = employee.role;
      user.sessionVersion = employee.updatedAt.toISOString();
      console.info("SSO success.", { employeeId: employee.id, email: employee.email });
      return true;
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.employeeId = user.id;
        token.role = (user as { role: Role }).role;
        token.sessionVersion = (user as { sessionVersion?: string }).sessionVersion;
        return token;
      }

      const current = await validateSessionToken(token.employeeId as string | undefined, token.sessionVersion as string | undefined);
      if (!current) {
        return null;
      }
      token.role = current.role;
      token.sessionVersion = current.sessionVersion;
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.employeeId as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
