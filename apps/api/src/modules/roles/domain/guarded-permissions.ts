import type { RolePermission } from "@workspace/contracts"

// Revoking the last holder of these would lock every admin out of the admin UI.
export const GUARDED_PERMISSIONS = ["users.manage", "roles.manage"] as const

/** Guarded permissions the role holds now but would lose with `next`. */
export function droppedGuardedPermissions(
  current: readonly RolePermission[],
  next: readonly RolePermission[]
): string[] {
  const key = (p: RolePermission) => `${p.resource}.${p.action}`
  const kept = new Set(next.map(key))
  return current
    .map(key)
    .filter(
      (k) =>
        (GUARDED_PERMISSIONS as readonly string[]).includes(k) && !kept.has(k)
    )
}
