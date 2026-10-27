export type StorageVisibility = "public" | "private"

/**
 * The one place that decides what is public. Callers only name a feature;
 * adding a feature means choosing its visibility here, deliberately.
 */
export const FEATURE_VISIBILITY = {
  attendance: "private", // clock photos
  corrections: "private", // attendance request attachments
  timeoff: "private", // leave attachments (medical notes...)
  profile_changes: "private", // proof for NIK/NPWP/bank/name changes
  employees: "private",
  avatars: "public",
  branding: "public",
  payroll: "private",
  announcements: "public", // shown to every employee and in push notifications
  misc: "private",
} as const satisfies Record<string, StorageVisibility>
export type StorageFeature = keyof typeof FEATURE_VISIBILITY

const SAFE = /[^a-z0-9_-]/gi
const clean = (part: string) => part.replace(SAFE, "")

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/csv": "csv",
}

export function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType] ?? "bin"
}

/**
 * `{feature}/{visibility}/{scope?}/{yyyy}/{mm}/{name}.{ext}`
 *
 * The visibility segment is what the bucket policy keys on: only
 * the `public` folders are anonymously readable. Every part is stripped to
 * [a-z0-9_-], so callers cannot escape their folder with `..` or `/`.
 */
export function buildStorageKey(input: {
  feature: StorageFeature
  visibility: StorageVisibility
  name: string
  ext: string
  scope?: string
  at?: Date
}): string {
  const at = input.at ?? new Date()
  const parts = [
    input.feature,
    input.visibility,
    ...(input.scope ? [clean(input.scope)] : []),
    String(at.getUTCFullYear()),
    String(at.getUTCMonth() + 1).padStart(2, "0"),
  ]
  return `${parts.join("/")}/${clean(input.name)}.${clean(input.ext)}`
}

/** Keys without a `/public/` segment (including legacy ones) are private. */
export function visibilityOf(key: string): StorageVisibility {
  const segments = key.split("/")
  return segments[1] === "public" ? "public" : "private"
}
