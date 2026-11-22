import type { Prisma } from "../generated/prisma/client.js";
import type { AuthUser } from "../middleware/auth.js";

export function auditEntry(
  actor: AuthUser,
  action: string,
  targetType: string,
  targetId: string,
  changes?: Prisma.InputJsonObject,
) {
  return {
    actorId: actor.id,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    ...(changes ? { changes } : {}),
  };
}
