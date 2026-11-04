# syntax=docker/dockerfile:1.7

# ─────────────────────────────── Build ───────────────────────────────
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src

# Install dependencies first so they are cached between source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @slavotax/web build \
 && pnpm --filter @slavotax/server build \
 && pnpm --filter @slavotax/server deploy --prod --legacy /out

# ─────────────────────────────── Runtime ───────────────────────────────
FROM node:24-alpine AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="Slavotax" \
      org.opencontainers.image.description="Self-hosted personal budget & money manager" \
      org.opencontainers.image.source="https://github.com/MrNechev/slavotax" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${APP_VERSION}"

RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8742 \
    WEB_DIST=/app/public \
    APP_VERSION=${APP_VERSION}

COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /src/apps/server/dist ./dist
COPY --from=build --chown=node:node /src/apps/server/drizzle ./drizzle
COPY --from=build --chown=node:node /src/apps/web/dist ./public

USER node
EXPOSE 8742
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
