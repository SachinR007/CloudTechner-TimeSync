"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { formString, optionalRecordId, requireString, validateBoolean, validateRecordId } from "@/lib/validation";

export async function createClient(formData: FormData) {
  await requireRole("TS_ADMIN");

  const name = requireString(formData, "name", "Client name", { max: 160 });

  const code = formString(formData, "code", { max: 32 });
  if (code) {
    const existing = await prisma.client.findUnique({ where: { code } });
    if (existing) throw new Error(`Client code ${code} is already in use`);
  }

  const sameAsClient = formData.get("billingSameAsClient") === "on";

  await prisma.client.create({
    data: {
      name,
      code,
      country: formString(formData, "country", { max: 80 }),
      billingCurrency: formString(formData, "billingCurrency", { max: 8 }),
      clientManagerId: optionalRecordId(formString(formData, "clientManagerId"), "Client manager"),
      description: formString(formData, "description", { max: 2000 }),
      billingName: sameAsClient ? name : formString(formData, "billingName", { max: 160 }),
      addressLine1: formString(formData, "addressLine1", { max: 200 }),
      addressLine2: formString(formData, "addressLine2", { max: 200 }),
      billingCountry: formString(formData, "billingCountry", { max: 80 }),
      state: formString(formData, "state", { max: 80 }),
      city: formString(formData, "city", { max: 80 }),
      zip: formString(formData, "zip", { max: 24 }),
    },
  });

  revalidatePath("/admin/clients");
}

export async function toggleClientActive(id: string, isActive: boolean) {
  await requireRole("TS_ADMIN");
  await prisma.client.update({ where: { id: validateRecordId(id, "Client") }, data: { isActive: validateBoolean(isActive, "Client status") } });
  revalidatePath("/admin/clients");
}
