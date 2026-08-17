"use server";

import { signOut, auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateBoundedText } from "@/lib/validation";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function changePasswordAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("All fields are required");
  }

  if (newPassword !== confirmPassword) {
    throw new Error("New passwords do not match");
  }

  validateBoundedText(currentPassword, "Current password", 128);
  validateBoundedText(newPassword, "New password", 128);

  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new Error("Password must contain at least one letter and one number.");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!employee) throw new Error("Employee not found");

  const valid = await bcrypt.compare(currentPassword, employee.passwordHash);
  if (!valid) throw new Error("Incorrect current password");

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.employee.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash },
  });
}
