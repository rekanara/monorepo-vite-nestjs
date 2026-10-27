import { Injectable } from "@nestjs/common"
import type { AttachmentResponse } from "@workspace/contracts"
import { generateId } from "../../../common/ids/id-generator"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { StorageService } from "../../../common/storage/storage.service"
import {
  AttachmentNotFoundError,
  InvalidAttachmentError,
  StorageUnavailableError,
} from "../../auth/domain/errors/auth.errors"

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async upload(
    userId: string,
    file?: {
      buffer: Buffer
      mimetype: string
      size: number
      originalname: string
    }
  ): Promise<AttachmentResponse> {
    if (!file) throw new InvalidAttachmentError()
    if (!this.storage.enabled) throw new StorageUnavailableError()
    if (file.size > 10_000_000) throw new InvalidAttachmentError()
    const uploaded = await this.storage.upload({
      feature: "misc",
      scope: userId,
      body: file.buffer,
      contentType: file.mimetype,
    })
    const row = await this.prisma.attachment.create({
      data: {
        id: generateId(),
        ownerUserId: userId,
        key: uploaded.key,
        filename: file.originalname.slice(0, 255),
        contentType: file.mimetype,
        size: file.size,
      },
    })
    return this.toResponse(row)
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.prisma.attachment.findUnique({ where: { id } })
    if (!row || row.ownerUserId !== userId) throw new AttachmentNotFoundError()
    await this.prisma.attachment.delete({ where: { id } })
    await this.storage.remove(row.key)
  }

  async list(userId: string): Promise<AttachmentResponse[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return Promise.all(rows.map((row) => this.toResponse(row)))
  }

  private async toResponse(row: {
    id: string
    key: string
    filename: string
    contentType: string
    size: number
    createdAt: Date
  }): Promise<AttachmentResponse> {
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      url: await this.storage.getSignedUrl(row.key, {
        downloadAs: row.filename,
      }),
      createdAt: row.createdAt.toISOString(),
    }
  }
}
