import { z } from "zod"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The one source for security limits. The API enforces these values and the
 * admin UI displays them, so the two cannot disagree.
 */
export const SECURITY_POLICY = {
  passwordMinLength: 8,
  passwordMaxLength: 128,
  accessTokenTtlMs: 15 * MINUTE,
  refreshTokenTtlMs: 7 * DAY,
  passwordResetLinkTtlMs: 30 * MINUTE,
  passwordResetCodeTtlMs: 10 * MINUTE,
  inviteTtlMs: 7 * DAY,
  emailVerificationTtlMs: 1 * DAY,
  maxCodeAttempts: 5,
} as const

export const PasswordSchema = z
  .string()
  .min(SECURITY_POLICY.passwordMinLength)
  .max(SECURITY_POLICY.passwordMaxLength)

/** "30 minutes", "1 day", "7 days": for emails and the admin UI. */
export function formatDuration(ms: number): string {
  const units = [
    ["day", DAY],
    ["hour", HOUR],
    ["minute", MINUTE],
  ] as const
  for (const [name, size] of units) {
    if (ms >= size && ms % size === 0) {
      const n = ms / size
      return `${n} ${name}${n === 1 ? "" : "s"}`
    }
  }
  return `${Math.round(ms / 1000)} seconds`
}
