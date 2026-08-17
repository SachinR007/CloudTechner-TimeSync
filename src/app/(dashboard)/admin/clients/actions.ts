"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-guards";
import { formString, optionalRecordId, requireString, validateBoolean, validateRecordId, validateSafeDisplayText } from "@/lib/validation";
import { writeAuditLog } from "@/lib/audit";

export async function createClient(formData: FormData) {
  const actor = await requireRole("TS_ADMIN");

  const name = validateSafeDisplayText(requireString(formData, "name", "Client name", { max: 160 }), "Client name", 160);

  const code = formString(formData, "code", { max: 32 });
  if (code) {
    const existing = await prisma.client.findUnique({ where: { code } });
    if (existing) throw new Error(`Client code ${code} is already in use`);
  }

  const sameAsClient = formData.get("billingSameAsClient") === "on";

  const client = await prisma.client.create({
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
  await writeAuditLog({
    actor,
    action: "CLIENT_CREATED",
    entity: "Client",
    entityId: client.id,
    summary: `${actor.name ?? actor.id} created client ${name}.`,
    metadata: { code, clientManagerId: client.clientManagerId },
  });

  revalidatePath("/admin/clients");
}

export async function toggleClientActive(id: string, isActive: boolean) {
  const actor = await requireRole("TS_ADMIN");
  const clientId = validateRecordId(id, "Client");
  const active = validateBoolean(isActive, "Client status");
  const client = await prisma.client.update({ where: { id: clientId }, data: { isActive: active } });
  await writeAuditLog({
    actor,
    action: active ? "CLIENT_ACTIVATED" : "CLIENT_DEACTIVATED",
    entity: "Client",
    entityId: clientId,
    summary: `${actor.name ?? actor.id} changed client ${client.name} active status to ${active}.`,
  });
  revalidatePath("/admin/clients");
}
