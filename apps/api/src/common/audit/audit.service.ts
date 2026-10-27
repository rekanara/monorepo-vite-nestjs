import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { generateId } from "../ids/id-generator"
import { redactSensitive } from "./redact-sensitive"

export interface AuditRecordInput {
  actorUserId: string | null
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: generateId(),
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: redactSensitive(input.before) as Prisma.InputJsonValue,
        after: redactSensitive(input.after) as Prisma.InputJsonValue,
      },
    })
  }
}
