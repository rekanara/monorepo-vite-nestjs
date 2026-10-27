import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { loadEnv } from "../config/env.schema"
import type {
  ObjectStoragePort,
  SignedUrlOptions,
  StoredObject,
} from "./object-storage.port"

/** MinIO / any S3-compatible store. Disabled (not an error) without credentials. */
@Injectable()
export class S3ObjectStorage implements ObjectStoragePort, OnModuleInit {
  private readonly logger = new Logger(S3ObjectStorage.name)
  private readonly client?: S3Client
  // Signature covers the host, so links for browsers must be signed against
  // the address browsers will use (which can differ from the internal one).
  private readonly signer?: S3Client
  private readonly bucket: string
  private readonly publicBase: string
  readonly enabled: boolean

  constructor() {
    const env = loadEnv()
    this.bucket = env.MINIO_BUCKET
    this.enabled = Boolean(
      env.MINIO_ENDPOINT && env.MINIO_ACCESS_KEY && env.MINIO_SECRET_KEY
    )
    const scheme = env.MINIO_USE_SSL === "true" ? "https" : "http"
    const internal = `${scheme}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`
    const external = (env.MINIO_PUBLIC_ENDPOINT ?? internal).replace(/\/$/, "")
    this.publicBase = (
      env.STORAGE_PUBLIC_URL ?? `${external}/${this.bucket}`
    ).replace(/\/$/, "")
    if (this.enabled) {
      const make = (endpoint: string) =>
        new S3Client({
          region: "us-east-1",
          endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.MINIO_ACCESS_KEY!,
            secretAccessKey: env.MINIO_SECRET_KEY!,
          },
        })
      this.client = make(internal)
      this.signer = external === internal ? this.client : make(external)
    }
  }

  async onModuleInit() {
    if (!this.client) {
      this.logger.warn("Object storage not configured; file features are off")
      return
    }
    try {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log(`Created bucket "${this.bucket}"`)
      }
      // Anonymous read only for `<feature>/public/...`; everything else needs
      // credentials or a signed link.
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: ["*"] },
                Action: ["s3:GetObject"],
                Resource: [`arn:aws:s3:::${this.bucket}/*/public/*`],
              },
            ],
          }),
        })
      )
    } catch (err) {
      // Don't block startup: the rest of the app must keep working.
      this.logger.error(
        `Object storage unavailable (bucket "${this.bucket}")`,
        err as Error
      )
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.requireClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
  }

  async delete(key: string): Promise<void> {
    await this.requireClient().send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    )
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.requireClient().send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      )
      const bytes = await res.Body!.transformToByteArray()
      return {
        body: Buffer.from(bytes),
        contentType: res.ContentType ?? "application/octet-stream",
      }
    } catch (err) {
      if (err instanceof S3ServiceException && err.name === "NoSuchKey") {
        return null
      }
      throw err
    }
  }

  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    this.requireClient()
    const name = options.downloadAs
    return getSignedUrl(
      this.signer!,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(name
          ? {
              ResponseContentDisposition: `attachment; filename="${name.replace(/[^\x20-\x7E]+|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            }
          : {}),
      }),
      { expiresIn: options.expiresIn }
    )
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`
  }

  private requireClient(): S3Client {
    if (!this.client) throw new Error("Object storage is not configured")
    return this.client
  }
}
