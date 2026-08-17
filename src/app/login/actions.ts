"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "unknown").trim().toLowerCase();
  assertRateLimit(`login:credentials:${email}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
    label: "Login",
  });
  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

export async function azureLoginAction() {
  assertRateLimit("login:azure:init", {
    limit: 120,
    windowMs: 10 * 60 * 1000,
    label: "Microsoft sign-in",
  });
  await signIn("azure-ad", { redirectTo: "/" });
}
