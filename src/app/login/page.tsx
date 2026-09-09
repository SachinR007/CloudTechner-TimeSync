import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { azureLoginAction, loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === "not-authorized"
      ? "Your Microsoft account is not mapped to an active employee. Please contact your admin."
      : "Microsoft sign-in could not be completed. Please try again or contact your admin.";
  const azureAvailable =
    !!process.env.AZURE_AD_CLIENT_ID &&
    !!process.env.AZURE_AD_CLIENT_SECRET &&
    !!process.env.AZURE_AD_TENANT_ID;
  const credentialsAvailable = process.env.ENABLE_CREDENTIALS_LOGIN === "true";

  return (
    <div className="fixed inset-0 grid grid-cols-1 md:grid-cols-[1.1fr_1fr] bg-white overflow-auto font-sans">
      <div className="relative hidden md:flex flex-col justify-between p-12 text-white bg-gradient-to-br from-[#061e1a] via-[#0b2b24] to-[#123b2a] overflow-hidden">
        <div className="absolute -top-20 -right-20 w-[280px] h-[280px] bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 w-[320px] h-[320px] bg-teal-500/10 rounded-full blur-[70px] pointer-events-none" />

        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.png" alt="CloudTechner Logo" className="h-10 w-10 object-contain rounded-md bg-white p-0.5" />
          <div>
            <strong className="text-base font-semibold tracking-tight block text-white">CloudTechner</strong>
            <small className="text-xs text-white/60">CT Orbit · Enterprise</small>
          </div>
        </div>

        <div className="relative z-10 max-w-md my-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-xs font-semibold text-[#7AC143] uppercase tracking-wider mb-6">
            <span className="w-1.5 h-1.5 bg-[#7AC143] rounded-full animate-pulse shadow-[0_0_8px_#7AC143]" />
            CloudTechner Internal
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-none mb-4">
            Every hour, <span className="bg-gradient-to-r from-[#7AC143] to-[#0E9DC4] bg-clip-text text-transparent">accounted for.</span>
          </h1>
          <p className="text-sm text-white/70 leading-relaxed mb-8">
            Track Progress. Stay Connected. Keep Moving.
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 text-sm text-white/90">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                ✓
              </div>
              <span>Weekly timesheets with draft, submit, and approval workflow</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-white/90">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                %
              </div>
              <span>Partial allocation and staggered assignments across projects</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-white/90">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                #
              </div>
              <span>Live utilization dashboards for managers and HR</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex justify-between items-center text-xs text-white/50">
          <span>SSO enabled · SOC 2 compliant</span>
          <span>© 2026 CloudTechner</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="flex md:hidden items-center gap-3 mb-6">
              <img src="/logo.png" alt="CloudTechner Logo" className="h-8 w-8 object-contain rounded-md bg-gray-50 p-0.5 border border-gray-100" />
              <div>
                <strong className="text-sm font-bold tracking-tight block text-gray-900">CloudTechner</strong>
                <small className="text-xs text-muted-foreground block">CT Orbit</small>
              </div>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Welcome back</h2>
            <p className="text-sm text-gray-500">Sign in with your CloudTechner Microsoft account.</p>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          {azureAvailable && (
            <form action={azureLoginAction}>
              <Button type="submit" className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-lg shadow-md shadow-emerald-500/10 transition-all duration-150 flex items-center justify-center gap-2">
                <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                Sign in with Microsoft
              </Button>
            </form>
          )}

          {azureAvailable && credentialsAvailable && (
            <div className="my-5 flex items-center gap-3 text-xs font-semibold text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              <span>OR LOCAL PASSWORD</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
          )}

          {credentialsAvailable && (
            <form action={loginAction} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" variant="outline" className="w-full h-11 font-semibold">
                Sign in with password
              </Button>
              <p className="text-center text-xs text-amber-700">
                Local development login only. Keep this disabled in production.
              </p>
            </form>
          )}

          {!azureAvailable && !credentialsAvailable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Microsoft SSO and local password login are not configured for this environment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
