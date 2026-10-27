import { randomBytes, createHash } from "node:crypto"
import { Injectable } from "@nestjs/common"
import {
  type ApiKeyResponse,
  type CreateApiKeyRequest,
  type CreatedApiKeyResponse,
  type UpdateApiKeyRequest,
} from "@workspace/contracts"
import { DomainException } from "../../../common/errors/domain-exception"
import { generateId } from "../../../common/ids/id-generator"
import { PrismaService } from "../../../common/prisma/prisma.service"

class ApiKeyError extends DomainException {}

const toResponse = (k: {
  id: string
  name: string
  prefix: string
  isActive: boolean
  lastUsedAt: Date | null
  createdAt: Date
}): ApiKeyResponse => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  isActive: k.isActive,
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  createdAt: k.createdAt.toISOString(),
})

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ApiKeyResponse[]> {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
    })
    return keys.map(toResponse)
  }

  async create(input: CreateApiKeyRequest): Promise<CreatedApiKeyResponse> {
    const secret = `rk_${randomBytes(32).toString("base64url")}`
    const key = await this.prisma.apiKey.create({
      data: {
        id: generateId(),
        name: input.name,
        prefix: secret.slice(0, 10),
        keyHash: this.hash(secret),
      },
    })
    return { ...toResponse(key), key: secret }
  }

  async update(
    id: string,
    input: UpdateApiKeyRequest
  ): Promise<ApiKeyResponse> {
    try {
      return toResponse(
        await this.prisma.apiKey.update({ where: { id }, data: input })
      )
    } catch {
      throw this.notFound()
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.apiKey.delete({ where: { id } })
    } catch {
      throw this.notFound()
    }
  }

  private hash(key: string): string {
    return createHash("sha256").update(key).digest("hex")
  }

  private notFound() {
    return new ApiKeyError({
      code: "API_KEY_NOT_FOUND",
      title: "API key not found",
      status: 404,
    })
  }
}
