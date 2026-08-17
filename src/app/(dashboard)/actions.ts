"use server";

import { signOut, auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function changePasswordAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("All fields are required");
  }

  if (newPassword !== confirmPassword) {
    throw new Error("New passwords do not match");
  }

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long");
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
