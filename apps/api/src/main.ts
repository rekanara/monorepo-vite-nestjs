import "reflect-metadata"
import path from "node:path"
import dotenv from "dotenv"

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") })

import { NestFactory } from "@nestjs/core"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import { SwaggerModule } from "@nestjs/swagger"
import { Logger } from "nestjs-pino"
import { buildSwaggerConfig } from "./swagger"
import { AppModule } from "./app.module"
import { loadEnv } from "./common/config/env.schema"
import { initSentry } from "./common/observability/sentry"

initSentry()

async function bootstrap() {
  const env = loadEnv()
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  app.use(helmet())
  app.use(cookieParser())
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true })
  app.setGlobalPrefix("api/v1")
  app.enableShutdownHooks()

  if (env.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig())
    SwaggerModule.setup("api/docs", app, document, {
      jsonDocumentUrl: "api/docs-json",
      yamlDocumentUrl: "api/docs-yaml",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "none",
        filter: true,
      },
    })
  }

  await app.listen(env.APP_PORT)
}
void bootstrap()
