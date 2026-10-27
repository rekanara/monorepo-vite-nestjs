# monorepo-fullstack

Reusable NestJS + React fullstack starter.

## Stack

- pnpm 10 + Turborepo
- API: NestJS 11, Express 5, Prisma 6, Vitest, Swagger in dev
- Web: Vite 8, React 19, TanStack Router/Query, shadcn/ui
- Contracts: shared zod schemas and permission catalog

## Features

- Auth: JWT access token + rotating refresh cookie, forgot/reset password (web link or mobile OTP), invites, email verification, session list/revoke.
- RBAC: roles, permission catalog, `self|team|all` scopes, fail-closed guards.
- Two-factor (TOTP): role-required or opt-in from the account page, QR enrolment, single-use backup codes (download + login fallback), reset/disable with password.
- Users: list/sort/filter, bulk actions, soft delete/restore, CSV/XLSX export, CSV import with preview.
- Audit log with filters and CSV export; per-user activity.
- Notifications: in-app + FCM push, per-user push opt-out, global push switch.
- Announcements: drafts, pinning, image upload, push on publish.
- Settings: branding (name, tagline, description, logo, banner), contact (email, phone), address/location (district, city, province, country, postal code, latitude/longitude), currency, timezone, login notice, email footer, push toggle and cleanup retention; security limits shown from `SECURITY_POLICY`.
- System status: DB/Redis checks, Prometheus-style `/api/v1/metrics`, optional Sentry error tracking.
- Webhooks: verified, idempotent Midtrans payment notifications; admin list with failed-event replay.
- API keys: create (secret shown once, stored hashed), toggle, delete.
- Maintenance: daily cleanup job plus manual run endpoint for expired tokens, old webhooks and read notifications.
- Email: branded responsive HTML templates (logo, tagline, button/OTP, footer, address) with plain-text fallback.
- Files: avatar, private attachments, MinIO/S3 optional.

## Setup

```bash
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres redis mailpit minio
pnpm --filter @workspace/api exec prisma migrate deploy
pnpm --filter @workspace/api db:seed
```

## Development

```bash
pnpm --filter @workspace/api start:dev
pnpm --filter web dev
```

Swagger is available outside production at `/api/docs` (`/api/docs-json`, `/api/docs-yaml`). API dev watches `apps/api/src` and `packages/contracts/dist`. Contract source changes are rebuilt by the API dev command, then the API restarts.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

E2E:

```bash
docker compose up -d postgres_test
cd apps/api && DATABASE_URL=postgresql://app:app@localhost:5433/app_test pnpm exec prisma migrate deploy
pnpm --filter @workspace/api test:e2e
```

## Production checklist

- Copy `.env.production.example` to `.env.production` and set secrets.
- Use strong `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `SUPER_ADMIN_PASSWORD`, and `DB_PASSWORD`.
- Set `CORS_ORIGIN` to the exact web origin.
- Set `VITE_API_BASE_URL` to the public API URL including `/api/v1`.
- Run migrations before serving traffic: `prisma migrate deploy`.
- Keep API and web behind HTTPS; refresh cookie uses `Secure`.
- Set `SENTRY_DSN` to enable error tracking; scrape `/api/v1/metrics` for basic Node metrics.
- Run smoke checks after deploy: `API_BASE_URL=https://api.example.com/api/v1 pnpm smoke`.
- Enable Renovate for this repository; config lives in `.github/renovate.json`.

## Docker

The values below are placeholders for a local try-out only; use real secrets anywhere else.

```bash
DB_PASSWORD=change-me \
JWT_ACCESS_SECRET=change-me-32-bytes-minimum-secret-value \
REFRESH_TOKEN_PEPPER=change-me-refresh-pepper \
CORS_ORIGIN=http://localhost:8080 \
VITE_API_BASE_URL=http://localhost:3000/api/v1 \
docker compose -f docker-compose.prod.yml up --build
```

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE)
