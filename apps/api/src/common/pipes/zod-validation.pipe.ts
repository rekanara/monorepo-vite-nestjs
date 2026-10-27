import { BadRequestException, PipeTransform } from "@nestjs/common"
import type { ZodSchema } from "zod"

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        title: "Request validation failed",
        detail: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      })
    }
    return result.data
  }
}
