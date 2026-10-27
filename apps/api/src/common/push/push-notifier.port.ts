export const PUSH_NOTIFIER = Symbol("PUSH_NOTIFIER")

export interface PushMessage {
  title: string
  body: string
  imageUrl?: string
  data: Record<string, string>
}

export interface PushResult {
  successCount: number
  failureCount: number
  invalidTokens: string[]
}

export interface PushNotifier {
  readonly enabled: boolean
  send(tokens: string[], message: PushMessage): Promise<PushResult>
}
