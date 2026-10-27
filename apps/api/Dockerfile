FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api exec prisma generate
RUN pnpm --filter @workspace/api build
RUN pnpm --filter @workspace/api deploy --prod --legacy /out
RUN cp -r apps/api/dist apps/api/prisma /out/ \
  && cd /out && ./node_modules/.bin/prisma generate

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /out .
USER node
EXPOSE 3000
CMD ["node", "dist/src/main"]
