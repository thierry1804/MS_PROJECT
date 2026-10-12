# Build context MUST be the repo root (see docker-compose.yml), because this
# workspace package depends on the sibling @atelier/scheduling-engine package
# via the pnpm "workspace:*" protocol.

FROM node:22-slim AS base
# Prisma's native query engine needs OpenSSL; without it, it silently
# defaults to a guessed version and can fail to connect at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Neon (and most managed Postgres) resolve to both A and AAAA records, but
# Docker's default bridge network has no outbound IPv6 route: the Prisma
# engine's getaddrinfo() can pick the AAAA record and hang until timeout
# ("Can't reach database server"). Prefer IPv4-mapped results at the glibc
# resolver level so this never depends on which address family wins the race.
RUN echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /repo

# Install deps in their own layer, keyed only on manifests + lockfile, so
# `pnpm install` is cached across source-only changes.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/scheduling-engine/package.json packages/scheduling-engine/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
COPY . .
# Generates both the Postgres client (used at runtime here) and the SQLite
# client: apps/api/src/db.ts imports the SQLite client unconditionally, so it
# must exist even though this image never runs in desktop mode.
RUN pnpm --filter @atelier/api db:generate

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8888
WORKDIR /repo/apps/api
EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8888)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
