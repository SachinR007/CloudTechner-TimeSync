import { requireRole } from "@/lib/auth-guards";
import { HR_ACCESS_ROLES } from "@/lib/roles";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  await requireRole(...HR_ACCESS_ROLES);

  return (
    <div className="flex flex-col gap-6">
      {children}
    </div>
  );
}
