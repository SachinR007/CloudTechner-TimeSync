import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type AuditActor = {
  id?: string | null;
  name?: string | null;
};

export async function writeAuditLog({
  actor,
  action,
  entity,
  entityId,
  summary,
  metadata,
}: {
  actor?: AuditActor | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      summary,
      metadata: metadata ?? undefined,
    },
  });
}
