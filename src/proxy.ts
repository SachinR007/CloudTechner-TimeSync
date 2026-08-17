import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { dashboardPathForRole, type Role } from "@/lib/roles";

const PUBLIC_PATHS = ["/login"];
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["TS_ADMIN"] },
  { prefix: "/hr", roles: ["HR_ADMIN", "TS_ADMIN"] },
];

export default auth((req) => {
  const { nextUrl } = req;
  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && nextUrl.pathname === "/login") {
    return NextResponse.redirect(
      new URL(dashboardPathForRole(req.auth.user.role), nextUrl.origin)
    );
  }

  const restrictedRoute = ROUTE_ROLES.find(
    (route) => nextUrl.pathname === route.prefix || nextUrl.pathname.startsWith(`${route.prefix}/`)
  );
  if (req.auth?.user && restrictedRoute && !restrictedRoute.roles.includes(req.auth.user.role)) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
