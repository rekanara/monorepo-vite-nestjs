import { Injectable, Logger } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import type {
  AnnouncementListQuery,
  AnnouncementResponse,
  CreateAnnouncement,
  UpdateAnnouncement,
} from "@workspace/contracts"
import { DomainException } from "../../../common/errors/domain-exception"
import { Paged } from "../../../common/http/response-envelope.interceptor"
import { generateId } from "../../../common/ids/id-generator"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { detectImage, MAX_IMAGE_BYTES } from "../../../common/storage/image"
import { StorageService } from "../../../common/storage/storage.service"
import { NotificationService } from "../../notifications/application/notification.service"

class AnnouncementError extends DomainException {}

const PREVIEW_LENGTH = 140

const include = {
  author: { select: { fullName: true, email: true } },
} satisfies Prisma.AnnouncementInclude
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>

const toResponse = (r: Row): AnnouncementResponse => ({
  id: r.id,
  title: r.title,
  content: r.content,
  imageUrl: r.imageUrl,
  isPinned: r.isPinned,
  status: r.status as AnnouncementResponse["status"],
  publishedAt: r.publishedAt?.toISOString() ?? null,
  notifiedAt: r.notifiedAt?.toISOString() ?? null,
  authorName: r.author.fullName ?? r.author.email,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})

const preview = (content: string) => {
  const flat = content.replace(/\s+/g, " ").trim()
  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…`
    : flat
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly storage: StorageService
  ) {}

  /** Readers see published only; managers (`all`) also see drafts. */
  async list(q: AnnouncementListQuery, all: boolean) {
    const where: Prisma.AnnouncementWhereInput = {
      status: all ? q.status : "published",
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: "insensitive" } },
          { content: { contains: q.search, mode: "insensitive" } },
        ],
      }),
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        include,
        orderBy: [
          { isPinned: "desc" },
          { publishedAt: { sort: "desc", nulls: "first" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.announcement.count({ where }),
    ])
    return Paged.of(rows.map(toResponse), total, q.page, q.limit)
  }

  async get(id: string, includeDrafts: boolean): Promise<AnnouncementResponse> {
    const row = await this.prisma.announcement.findUnique({
      where: { id },
      include,
    })
    if (!row || (!includeDrafts && row.status !== "published"))
      throw this.notFound()
    return toResponse(row)
  }

  async create(
    authorId: string,
    body: CreateAnnouncement
  ): Promise<AnnouncementResponse> {
    const published = body.status === "published"
    const row = await this.prisma.announcement.create({
      data: {
        id: generateId(),
        title: body.title,
        content: body.content,
        imageUrl: body.imageUrl ?? null,
        isPinned: body.isPinned,
        status: body.status,
        publishedAt: published ? new Date() : null,
        authorId,
      },
    })
    if (published) await this.notify(row.id)
    return this.get(row.id, true)
  }

  async update(
    id: string,
    body: UpdateAnnouncement
  ): Promise<AnnouncementResponse> {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    })
    if (!existing) throw this.notFound()
    const nowPublished =
      body.status === "published" && existing.status !== "published"
    await this.prisma.announcement.update({
      where: { id },
      data: {
        title: body.title,
        content: body.content,
        imageUrl: body.imageUrl,
        isPinned: body.isPinned,
        status: body.status,
        ...(nowPublished && { publishedAt: new Date() }),
      },
    })
    if (body.imageUrl !== undefined)
      await this.removeOwnImage(existing.imageUrl, body.imageUrl ?? null)
    if (nowPublished) await this.notify(id)
    return this.get(id, true)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    })
    if (!existing) throw this.notFound()
    await this.prisma.announcement.delete({ where: { id } })
    await this.removeOwnImage(existing.imageUrl, null)
  }

  /** Public image (readable by URL, including from push notifications). */
  async uploadImage(file?: { buffer: Buffer }) {
    if (!file?.buffer.length)
      throw this.badImage("IMAGE_REQUIRED", "An image file is required")
    if (file.buffer.length > MAX_IMAGE_BYTES)
      throw this.badImage("IMAGE_TOO_LARGE", "Image must be 5 MB or smaller")
    const image = detectImage(file.buffer)
    if (!image)
      throw this.badImage("INVALID_IMAGE", "Only JPEG, PNG or WebP images")
    if (!this.storage.enabled)
      throw new AnnouncementError({
        code: "STORAGE_UNAVAILABLE",
        title: "Object storage is not configured",
        status: 503,
      })
    const { key, url } = await this.storage.upload({
      feature: "announcements",
      body: file.buffer,
      contentType: image.mime,
      ext: image.ext,
    })
    return { key, url: url! }
  }

  /** Deletes only files we stored, and only when nothing else points at them. */
  private async removeOwnImage(previous: string | null, next: string | null) {
    if (!previous || previous === next) return
    const key = this.storage.keyFromUrl(previous)
    if (!key?.startsWith("announcements/public/")) return
    const stillUsed = await this.prisma.announcement.count({
      where: { imageUrl: previous },
    })
    if (stillUsed > 0) return
    try {
      await this.storage.remove(key)
    } catch (err) {
      this.logger.warn(`Could not delete old image ${key}: ${String(err)}`)
    }
  }

  /** Pushes once per announcement; delivery failures never fail the save. */
  private async notify(id: string): Promise<void> {
    try {
      const claim = await this.prisma.announcement.updateMany({
        where: { id, notifiedAt: null, status: "published" },
        data: { notifiedAt: new Date() },
      })
      if (claim.count === 0) return
      const a = await this.prisma.announcement.findUniqueOrThrow({
        where: { id },
      })
      await this.notifications.notifyAllActive({
        type: "announcement",
        title: a.title,
        body: preview(a.content),
        data: { modules: "announcement", id: a.id },
        dedupeKey: `announcement:${a.id}`,
        imageUrl: a.imageUrl ?? undefined,
      })
    } catch (err) {
      this.logger.error(`Announcement push failed: ${String(err)}`)
    }
  }

  private badImage(code: string, title: string) {
    return new AnnouncementError({ code, title, status: 400 })
  }

  private notFound() {
    return new AnnouncementError({
      code: "ANNOUNCEMENT_NOT_FOUND",
      title: "Announcement not found",
      status: 404,
    })
  }
}
