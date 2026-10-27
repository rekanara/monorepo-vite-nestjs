const SENSITIVE_KEYS = new Set([
  "passwordHash",
  "password",
  "tokenHash",
  "token",
  "accessToken",
  "refreshToken",
  "backupCodes",
  "currentPassword",
])

/** Deep copy of `value` without secret keys; never mutates the input. */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive)
  if (typeof (value as { toJSON?: unknown } | null)?.toJSON === "function") {
    return redactSensitive((value as { toJSON(): unknown }).toJSON())
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEYS.has(key))
        .map(([key, v]) => [key, redactSensitive(v)])
    )
  }
  return value
}
