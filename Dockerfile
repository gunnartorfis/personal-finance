# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
# All production checks run here, without database/provider credentials or migrations.
RUN pnpm lint && pnpm typecheck && pnpm test:run && pnpm test:hosting && pnpm db:check && node scripts/hosting/check-migration-drift.mjs && pnpm dlx react-doctor@0.5.8 --yes --scope full --blocking warning --no-telemetry --verbose
# Public Clerk identity is compiled into browser bundles. Runtime secrets are never build arguments.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG RAILWAY_GIT_COMMIT_SHA
ENV DEPLOYMENT_VERSION=$RAILWAY_GIT_COMMIT_SHA
RUN pnpm build

FROM node:24.21.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 TZ=UTC
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node scripts/hosting/start.mjs ./scripts/hosting/start.mjs
COPY --chown=node:node scripts/hosting/runtime-config.mjs ./scripts/hosting/runtime-config.mjs
COPY --chown=node:node scripts/hosting/run-scheduled.mjs ./scripts/hosting/run-scheduled.mjs
COPY --chown=node:node lib/scheduling/execution.mjs ./lib/scheduling/execution.mjs
# Railway runs this isolated tool tree only in its separate pre-deploy container.
# pnpm's dependency links stay intact; no package installation or migration at startup.
COPY --from=dependencies /app/node_modules /release/node_modules
COPY package.json drizzle.config.ts /release/
COPY drizzle /release/drizzle
COPY ops-migrations /release/ops-migrations
COPY scripts/hosting/migrate.mjs scripts/hosting/migrate-operations.mjs /release/scripts/hosting/
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "scripts/hosting/start.mjs"]
