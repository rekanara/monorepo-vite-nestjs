import * as Sentry from "@sentry/node"

export function initSentry() {
  if (!process.env.SENTRY_DSN) return false
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  })
  return true
}

export function captureException(err: unknown) {
  if (process.env.SENTRY_DSN) Sentry.captureException(err)
}
