import { Prisma } from "@prisma/client"

/**
 * True when `err` is a Prisma unique-constraint violation (P2002), optionally
 * narrowed to a specific column/index target. Used as a defense-in-depth
 * fallback for races between an application-level pre-check (e.g.
 * `findByEmail`) and the actual insert - two concurrent requests can both
 * pass the pre-check and only the database's own unique index can catch the
 * second one.
 */
export function isUniqueConstraintViolation(
  err: unknown,
  target?: string
): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== "P2002"
  ) {
    return false
  }
  if (target === undefined) {
    return true
  }
  const meta = err.meta?.target
  return Array.isArray(meta) ? meta.includes(target) : meta === target
}
