import { randomInt, createHash } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { generateId } from "../../../common/ids/id-generator"
import { PrismaService } from "../../../common/prisma/prisma.service"

const CODE_COUNT = 10

@Injectable()
export class BackupCodeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Replaces any existing codes with a fresh set; returns the plaintext codes once. */
  async regenerate(userId: string): Promise<string[]> {
    const codes = Array.from({ length: CODE_COUNT }, () => this.generateOne())
    await this.prisma.$transaction([
      this.prisma.userBackupCode.deleteMany({ where: { userId } }),
      this.prisma.userBackupCode.createMany({
        data: codes.map((code) => ({
          id: generateId(),
          userId,
          codeHash: this.hash(code),
        })),
      }),
    ])
    return codes
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.userBackupCode.deleteMany({ where: { userId } })
  }

  /** Consumes a matching unused code; returns whether one was found. */
  async consume(userId: string, code: string): Promise<boolean> {
    const hash = this.hash(this.normalize(code))
    const match = await this.prisma.userBackupCode.findFirst({
      where: { userId, codeHash: hash, usedAt: null },
    })
    if (!match) return false
    await this.prisma.userBackupCode.update({
      where: { id: match.id },
      data: { usedAt: new Date() },
    })
    return true
  }

  async remainingCount(userId: string): Promise<number> {
    return this.prisma.userBackupCode.count({
      where: { userId, usedAt: null },
    })
  }

  private generateOne(): string {
    const part = () => randomInt(0, 100_000).toString().padStart(5, "0")
    return `${part()}-${part()}`
  }

  private normalize(code: string): string {
    return code.trim().toLowerCase()
  }

  private hash(code: string): string {
    return createHash("sha256").update(this.normalize(code)).digest("hex")
  }
}
