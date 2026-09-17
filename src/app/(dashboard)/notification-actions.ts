"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { validateRecordId } from "@/lib/validation";
export async function dismissDashboardNotification(id: string) { const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN"); await prisma.notification.updateMany({ where: { id: validateRecordId(id, "Notification"), employeeId: user.id, isRead: false }, data: { isRead: true } }); revalidatePath("/", "layout"); }
export async function dismissAllDashboardNotifications() { const user = await requireRole("EMPLOYEE", "PROJECT_MANAGER", "HR_ADMIN", "TS_ADMIN"); await prisma.notification.updateMany({ where: { employeeId: user.id, isRead: false }, data: { isRead: true } }); revalidatePath("/", "layout"); }
