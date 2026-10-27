import { Injectable, Logger } from "@nestjs/common"
import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { resolve } from "node:path"
import type {
  PushMessage,
  PushNotifier,
  PushResult,
} from "./push-notifier.port"

const BATCH_SIZE = 500
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
])

@Injectable()
export class FirebasePushService implements PushNotifier {
  private readonly logger = new Logger(FirebasePushService.name)
  private readonly app: App | null

  constructor() {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    if (!path) {
      this.app = null
      return
    }
    try {
      this.app =
        getApps()[0] ??
        initializeApp({ credential: cert(resolve(process.cwd(), path)) })
    } catch (err) {
      this.logger.error(`Firebase init failed, push disabled: ${String(err)}`)
      this.app = null
    }
  }

  get enabled(): boolean {
    return this.app !== null
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const result: PushResult = {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    }
    if (!this.app || tokens.length === 0) return result
    const messaging = getMessaging(this.app)
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE)
      try {
        const res = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: {
            title: message.title,
            body: message.body,
            ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
          },
          data: message.data,
        })
        result.successCount += res.successCount
        result.failureCount += res.failureCount
        res.responses.forEach((r, idx) => {
          const code = r.error?.code
          if (code && DEAD_TOKEN_CODES.has(code)) {
            result.invalidTokens.push(batch[idx]!)
          }
        })
      } catch (err) {
        result.failureCount += batch.length
        this.logger.error(`FCM batch failed: ${String(err)}`)
      }
    }
    return result
  }
}
