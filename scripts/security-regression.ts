import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { validateSafeDisplayText } from "../src/lib/validation";

const prisma = new PrismaClient();
const baseUrl = process.env.SECURITY_TEST_BASE_URL ?? "http://127.0.0.1:3111";
const port = new URL(baseUrl).port || "3111";
const testIds = ["SECADM", "SECMGR", "SECEMP", "SECHASH"];

class CookieJar {
  private cookies = new Map<string, string>();

  add(setCookies: string[] | string | null) {
    if (!setCookies) return;
    const list = Array.isArray(setCookies) ? setCookies : [setCookies];
    for (const setCookie of list) {
      const parts = String(setCookie).split(/,(?=\s*[^;=]+=[^;]+)/);
      for (const part of parts) {
        const cookiePair = part.split(";")[0];
        const i = cookiePair.indexOf("=");
        if (i > 0) this.cookies.set(cookiePair.slice(0, i).trim(), cookiePair.slice(i + 1).trim());
      }
    }
  }

  header() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request(jar: CookieJar | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookie = jar?.header();
  if (cookie) headers.set("cookie", cookie);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if (jar) {
      const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
      jar.add(getSetCookie ? getSetCookie.call(response.headers) : response.headers.get("set-cookie"));
    }

    return {
      status: response.status,
      location: response.headers.get("location") ?? "",
      text: await response.text(),
      headers: response.headers,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function scan(text: string) {
  return {
    hasHash: /\$2[aby]\$/.test(text),
    hasPasswordHashField: text.includes("passwordHash"),
    hasMarker: /Hash Leak Marker|Security Leak Test|sec\.admin@example\.com/.test(text),
  };
}

async function cleanup() {
  await prisma.approvalHistory.deleteMany({
    where: { OR: [{ actorId: { in: testIds } }, { timesheetHeader: { employeeId: { in: testIds } } }] },
  });
  await prisma.timesheetApproval.deleteMany({
    where: {
      OR: [{ approverId: { in: testIds } }, { projectId: "sec-project" }, { timesheetHeader: { employeeId: { in: testIds } } }],
    },
  });
  await prisma.timesheetLine.deleteMany({ where: { timesheetHeader: { employeeId: { in: testIds } } } });
  await prisma.timesheetHeader.deleteMany({ where: { employeeId: { in: testIds } } });
  await prisma.projectAllocation.deleteMany({ where: { OR: [{ employeeId: { in: testIds } }, { projectId: "sec-project" }] } });
  await prisma.task.deleteMany({ where: { projectId: "sec-project" } });
  await prisma.project.deleteMany({ where: { id: "sec-project" } });
  await prisma.client.deleteMany({ where: { id: "sec-client" } });
  await prisma.employee.updateMany({
    where: { OR: [{ reportingManagerId: { in: testIds } }, { approverOverrideId: { in: testIds } }] },
    data: { reportingManagerId: null, approverOverrideId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: testIds } } });
}

async function seed() {
  await cleanup();
  const passwordHash = await bcrypt.hash("SecurityTest123", 10);
  await prisma.employee.createMany({
    data: [
      { id: "SECADM", name: "Security Test Admin", email: "sec.admin@example.com", role: "TS_ADMIN", passwordHash, isActive: true },
      {
        id: "SECMGR",
        name: "Security Test Manager",
        email: "sec.manager@example.com",
        role: "PROJECT_MANAGER",
        passwordHash,
        isActive: true,
        reportingManagerId: "SECADM",
      },
      {
        id: "SECEMP",
        name: "Security Test Employee",
        email: "sec.employee@example.com",
        role: "EMPLOYEE",
        passwordHash,
        isActive: true,
        reportingManagerId: "SECMGR",
      },
      {
        id: "SECHASH",
        name: "Hash Leak Marker Person",
        email: "hash.marker@example.com",
        role: "EMPLOYEE",
        passwordHash,
        isActive: true,
        reportingManagerId: "SECMGR",
      },
    ],
  });
  await prisma.client.create({
    data: { id: "sec-client", name: "Security Leak Test Client", code: "SEC-CLIENT", isActive: true, clientManagerId: "SECADM" },
  });
  await prisma.project.create({
    data: {
      id: "sec-project",
      name: "Security Leak Test Project",
      code: "SEC-PROJ",
      status: "IN_PROGRESS",
      isActive: true,
      clientId: "sec-client",
      projectManagerId: "SECMGR",
    },
  });
  await prisma.task.create({ data: { id: "sec-task", name: "Security Leak Task", projectId: "sec-project", isActive: true } });
  await prisma.projectAllocation.create({
    data: {
      employeeId: "SECEMP",
      projectId: "sec-project",
      allocationPercentage: 100,
      startDate: new Date("2026-08-10"),
      createdById: "SECADM",
    },
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/providers`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {
      // Keep waiting until the server is ready or the deadline expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next server did not become ready at ${baseUrl}`);
}

function startServer() {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTH_URL: baseUrl,
      ENABLE_CREDENTIALS_LOGIN: "true",
    },
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next:err] ${chunk}`));
  return child;
}

async function login(email: string) {
  const jar = new CookieJar();
  const csrf = await request(jar, "/api/auth/csrf");
  const csrfToken = JSON.parse(csrf.text).csrfToken;
  const body = new URLSearchParams({
    csrfToken,
    email,
    password: "SecurityTest123",
    callbackUrl: `${baseUrl}/employee`,
  });
  const loginResponse = await request(jar, "/api/auth/callback/credentials", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  if (loginResponse.status !== 302) throw new Error(`Login failed for ${email}: ${loginResponse.status}`);
  return jar;
}

async function runChecks() {
  for (const payload of ["<h1>Test</h1>", "%3cscript%3ealert(1)%3c/script%3e", "<a href=\"https://evil.com\">click</a>", "javascript:alert(1)"]) {
    try {
      validateSafeDisplayText(payload, "Payload", 1000);
      throw new Error(`Unsafe display text was accepted: ${payload}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unsafe display text")) throw error;
    }
  }

  const oldEmployeeSession = await login("sec.employee@example.com");
  const employee = await login("sec.employee@example.com");
  const admin = await login("sec.admin@example.com");

  const replacedSession = await request(oldEmployeeSession, "/employee");
  if (![302, 303, 307, 401].includes(replacedSession.status)) {
    throw new Error(`Concurrent-login invalidation check failed: ${replacedSession.status}`);
  }

  const protectedPaths = ["/admin", "/admin/allocations", "/admin/projects", "/admin/clients", "/admin/projects/sec-project", "/hr/employees"];
  const employeeRows = [];
  for (const path of protectedPaths) {
    const response = await request(employee, path);
    const result = { as: "EMPLOYEE", path, status: response.status, ...scan(response.text) };
    employeeRows.push(result);
    if (response.status !== 403 || result.hasHash || result.hasPasswordHashField || result.hasMarker) {
      throw new Error(`Employee access check failed: ${JSON.stringify(result)}`);
    }
  }

  const adminRows = [];
  for (const path of protectedPaths.filter((path) => path !== "/admin")) {
    const response = await request(admin, path);
    const result = { as: "TS_ADMIN", path, status: response.status, ...scan(response.text) };
    adminRows.push(result);
    if (response.status !== 200 || result.hasHash || result.hasPasswordHashField) {
      throw new Error(`Admin data leak check failed: ${JSON.stringify(result)}`);
    }
  }

  const loginHead = await request(null, "/login", { method: "HEAD" });
  const headers = {
    csp: loginHead.headers.get("content-security-policy"),
    xPoweredBy: loginHead.headers.get("x-powered-by"),
    xFrameOptions: loginHead.headers.get("x-frame-options"),
    xContentTypeOptions: loginHead.headers.get("x-content-type-options"),
  };
  if (!headers.csp || headers.xPoweredBy || headers.xFrameOptions !== "DENY" || headers.xContentTypeOptions !== "nosniff") {
    throw new Error(`Header check failed: ${JSON.stringify(headers)}`);
  }

  await prisma.employee.update({
    where: { id: "SECEMP" },
    data: { title: "Session revoked by regression test" },
  });
  const revokedSession = await request(employee, "/employee");
  if (![302, 303, 307, 401].includes(revokedSession.status)) {
    throw new Error(`Session revocation check failed: ${revokedSession.status}`);
  }

  console.log(JSON.stringify({ employeeRows, adminRows, headers, replacedSession: { status: replacedSession.status }, revokedSession: { status: revokedSession.status } }, null, 2));
}

async function stopServer(child: ChildProcessWithoutNullStreams) {
  if (child.killed) return;
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (!child.killed) child.kill("SIGKILL");
}

async function main() {
  let child: ChildProcessWithoutNullStreams | null = null;
  try {
    await seed();
    child = startServer();
    await waitForServer();
    await runChecks();
    console.log("SECURITY_REGRESSION_PASS");
  } finally {
    if (child) await stopServer(child);
    await cleanup();
    const remaining = await prisma.employee.count({ where: { id: { in: testIds } } });
    console.log(`SEC_RECORDS_AFTER_CLEANUP=${remaining}`);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
