import { SetMetadata } from "@nestjs/common"

export const AUDITED_KEY = "audited"
export interface AuditedMetadata {
  action: string
  entityType: string
}
export const Audited = (action: string, entityType: string) =>
  SetMetadata(AUDITED_KEY, { action, entityType } satisfies AuditedMetadata)
