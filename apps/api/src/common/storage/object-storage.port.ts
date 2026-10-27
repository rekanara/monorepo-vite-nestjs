export interface StoredObject {
  body: Buffer
  contentType: string
}

export interface SignedUrlOptions {
  /** Seconds the link stays valid. */
  expiresIn: number
  /** When set, the browser downloads the object under this file name. */
  downloadAs?: string
}

/**
 * Low-level driver for an S3-compatible store. Feature code should go through
 * StorageService, which owns key layout and public/private rules.
 */
export interface ObjectStoragePort {
  /** False when no credentials are configured; callers must not use the rest. */
  readonly enabled: boolean
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  /** Idempotent: deleting a missing object is not an error. */
  delete(key: string): Promise<void>
  /** Time-limited link that works for any object, public or private. */
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>
  /** Permanent link; only readable for keys under a `public` prefix. */
  publicUrl(key: string): string
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE")
