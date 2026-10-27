import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import type { Prisma } from "@prisma/client"
import type { Response } from "express"
import { AuditQuerySchema, type AuditQuery } from "@workspace/contracts"
import { PermissionGuard } from "../rbac/permission-guard"
import { RequirePermission } from "../rbac/require-permission.decorator"
import { PrismaService } from "../prisma/prisma.service"
import { ZodValidationPipe } from "../pipes/zod-validation.pipe"
import { Paged } from "../http/response-envelope.interceptor"
import { toCsv } from "../csv"

// ponytail: exports are built in memory; stream rows when this cap is hit.
const EXPORT_LIMIT = 10_000
const DAY_MS = 24 * 60 * 60 * 1000

function whereOf(q: Omit<AuditQuery, "page" | "limit">) {
  return {
    actorUserId: q.actorUserId,
    entityType: q.entityType,
    entityId: q.entityId,
    action: q.action ? { contains: q.action } : undefined,
    ...(q.userId && {
      OR: [
        { actorUserId: q.userId },
        { entityType: "user", entityId: q.userId },
      ],
    }),
    createdAt:
      q.from || q.to
        ? {
            gte: q.from ? new Date(q.from) : undefined,
            // `to` is inclusive of the whole day.
            lt: q.to ? new Date(new Date(q.to).getTime() + DAY_MS) : undefined,
          }
        : undefined,
  } satisfies Prisma.AuditLogWhereInput
}

@ApiTags("Audit Log")
@ApiBearerAuth("JWT-auth")
@Controller("audit")
@UseGuards(PermissionGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: "List audit log entries, newest first" })
  @Get()
  @RequirePermission("audit.view")
  async list(@Query(new ZodValidationPipe(AuditQuerySchema)) q: AuditQuery) {
    const where = whereOf(q)
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ])
    return Paged.of(items, total, q.page, q.limit)
  }

  @ApiOperation({ summary: "Export filtered audit entries as CSV" })
  @Get("export")
  @RequirePermission("audit.view")
  async export(
    @Query(new ZodValidationPipe(AuditQuerySchema)) q: AuditQuery,
    @Res({ passthrough: true }) res: Response
  ) {
    const rows = await this.prisma.auditLog.findMany({
      where: whereOf(q),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: EXPORT_LIMIT,
    })
    const csv = toCsv([
      [
        "createdAt",
        "action",
        "entityType",
        "entityId",
        "actorUserId",
        "before",
        "after",
      ],
      ...rows.map((r) => [
        r.createdAt.toISOString(),
        r.action,
        r.entityType,
        r.entityId,
        r.actorUserId,
        JSON.stringify(r.before),
        JSON.stringify(r.after),
      ]),
    ])
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`
    )
    return new StreamableFile(Buffer.from(csv))
  }
}
