import { Inject, Injectable } from "@nestjs/common"
import { generateId } from "../ids/id-generator"
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
  type StoredObject,
} from "./object-storage.port"
import {
  buildStorageKey,
  extensionFor,
  visibilityOf,
  FEATURE_VISIBILITY,
  type StorageFeature,
  type StorageVisibility,
} from "./storage-keys"

export const DEFAULT_SIGNED_URL_TTL = 3600

export interface UploadInput {
  /** Decides public/private; see FEATURE_VISIBILITY. */
  feature: StorageFeature
  body: Buffer
  contentType: string
  /** Sub-folder, typically the owner's id. */
  scope?: string
  /** File name without extension; a fresh id by default. */
  name?: string
  /** Defaults to the one implied by contentType. */
  ext?: string
}

export interface UploadResult {
  key: string
  /** Permanent link for public files; null for private ones (sign on demand). */
  url: string | null
}

/**
 * What the rest of the app uses for files: decides where things are stored,
 * keeps public and private apart, and hands out links. Callers keep only the
 * returned `key` in the database.
 */
@Injectable()
export class StorageService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly driver: ObjectStoragePort
  ) {}

  get enabled(): boolean {
    return this.driver.enabled
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const key = buildStorageKey({
      feature: input.feature,
      visibility: FEATURE_VISIBILITY[input.feature],
      scope: input.scope,
      name: input.name ?? generateId(),
      ext: input.ext ?? extensionFor(input.contentType),
    })
    await this.driver.put(key, input.body, input.contentType)
    return { key, url: this.urlOf(key) }
  }

  /** Stores the new file first, so a failed upload never loses the old one. */
  async replace(
    oldKey: string | null,
    input: UploadInput
  ): Promise<UploadResult> {
    const result = await this.upload(input)
    if (oldKey && oldKey !== result.key) await this.remove(oldKey)
    return result
  }

  remove(key: string): Promise<void> {
    return this.driver.delete(key)
  }

  /** Server-side read, for when the API itself must stream or audit access. */
  read(key: string): Promise<StoredObject | null> {
    return this.driver.get(key)
  }

  visibilityOf(key: string): StorageVisibility {
    return visibilityOf(key)
  }

  /** Permanent URL for public keys, otherwise null. */
  urlOf(key: string | null): string | null {
    if (!key) return null
    if (/^https?:\/\//.test(key)) return key
    return visibilityOf(key) === "public" ? this.driver.publicUrl(key) : null
  }

  /** Time-limited link; the way to hand out a private file. */
  getSignedUrl(
    key: string,
    options: { expiresIn?: number; downloadAs?: string } = {}
  ): Promise<string> {
    return this.driver.getSignedUrl(key, {
      expiresIn: options.expiresIn ?? DEFAULT_SIGNED_URL_TTL,
      downloadAs: options.downloadAs,
    })
  }

  /** Recovers the key from a stored public URL, e.g. to delete the file. */
  keyFromUrl(url: string | null): string | null {
    if (!url) return null
    if (!/^https?:\/\//.test(url)) return url
    const match = url.match(/([a-z0-9_-]+\/(?:public|private)\/[^?#]+)/i)
    return match?.[1] ?? null
  }
}
