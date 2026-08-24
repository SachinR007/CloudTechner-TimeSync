import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, signOut } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function NotEnabledPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "EMPLOYEE" || session.user.canSubmitTimesheet) {
    redirect(dashboardPathForRole(session.user.role));
  }

  return (
    <main className="min-h-screen bg-[#061e1a] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
        <Image
          src="/logo.png"
          alt="CloudTechner Logo"
          width={56}
          height={56}
          className="mb-6 h-14 w-14 rounded-lg bg-white object-contain p-1 shadow-sm"
        />
        <Badge className="mb-5 border border-amber-300/30 bg-amber-400/10 px-4 py-1 text-amber-200 hover:bg-amber-400/10">
          Timesheet not enabled for you yet
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Access pending</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
          Your Microsoft sign-in is valid, but your employee profile is not authorized to use CT Orbit timesheets yet.
          Please contact HR or the Timesheet Admin to enable access.
        </p>
        <form action={logoutAction} className="mt-8">
          <Button type="submit" variant="secondary" className="h-10 px-5 font-semibold">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
