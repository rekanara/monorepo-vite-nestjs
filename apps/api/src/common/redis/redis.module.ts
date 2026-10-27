import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common"
import Redis from "ioredis"
import { loadEnv } from "../config/env.schema"
import { CacheService } from "./cache.service"
import { REDIS } from "./redis.tokens"

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () =>
        new Redis(loadEnv().REDIS_URL, {
          lazyConnect: true,
          // Fail fast instead of queueing forever when Redis is down;
          // callers (cache, health) decide how to degrade.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        }),
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationShutdown() {
    if (this.redis.status !== "end") this.redis.disconnect()
  }
}
