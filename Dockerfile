# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
# No credentials or database connection is required or accepted as a build argument.
ARG DEPLOYMENT_VERSION
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION
RUN pnpm build

# Explicit one-off release task; never used as an application entrypoint/pre-deploy hook.
FROM dependencies AS migrations
COPY drizzle ./drizzle
COPY ops-migrations ./ops-migrations
COPY drizzle.config.ts ./
COPY scripts/hosting ./scripts/hosting
USER node
CMD ["node", "scripts/hosting/migrate.mjs"]

FROM node:24.21.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 TZ=UTC
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node scripts/hosting/start.mjs ./scripts/hosting/start.mjs
COPY --chown=node:node scripts/hosting/run-scheduled.mjs ./scripts/hosting/run-scheduled.mjs
COPY --chown=node:node lib/scheduling/execution.mjs ./lib/scheduling/execution.mjs
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "scripts/hosting/start.mjs"]
