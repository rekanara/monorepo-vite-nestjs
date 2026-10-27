import { Inject, Injectable, Logger } from "@nestjs/common"
import type Redis from "ioredis"
import { REDIS } from "./redis.tokens"

/**
 * Thin Redis read-through cache. Every Redis failure degrades to a cache miss
 * (the caller's loader still runs), so a Redis outage slows the API down
 * instead of breaking it.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private async ready(): Promise<boolean> {
    try {
      if (this.redis.status === "wait") await this.redis.connect()
      return this.redis.status === "ready"
    } catch (err) {
      this.logger.warn(`Redis unavailable: ${String(err)}`)
      return false
    }
  }

  async wrap<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>
  ): Promise<T> {
    if (await this.ready()) {
      try {
        const hit = await this.redis.get(key)
        if (hit !== null) return JSON.parse(hit) as T
      } catch (err) {
        this.logger.warn(`Cache read failed for ${key}: ${String(err)}`)
      }
    }
    const value = await load()
    try {
      if (this.redis.status === "ready") {
        await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds)
      }
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${String(err)}`)
    }
    return value
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return
    try {
      if (await this.ready()) await this.redis.del(...keys)
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${String(err)}`)
    }
  }
}
