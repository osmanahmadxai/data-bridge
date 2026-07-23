# syntax=docker/dockerfile:1
#
# Single image that builds the whole Syncle monorepo (core + api + web).
# The same image runs both the API and the web GUI — docker-compose.app.yml
# starts two containers from it with different commands. See `bin/syncle`.

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

# Toolchain: build-essential + python3 for better-sqlite3's native addon,
# openssl for Prisma's query engine, git for any git: dependencies.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates git \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

# 1) Install deps from just the manifests so this layer caches across code edits.
#    apps/api/prisma is copied first because @syncle/api's postinstall runs
#    `prisma generate`, which needs the schema.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile

# 2) Build everything. NEXT_PUBLIC_API_URL is baked into the browser bundle at
#    build time, so it must point at wherever the browser reaches the API
#    (the host-exposed API port, default http://localhost:4002/api).
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:4002/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @syncle/core build \
 && pnpm --filter @syncle/api build \
 && pnpm --filter @syncle/web build

ENV NODE_ENV=production
# API 4002, Web 3002 — the actual command per container comes from compose.
EXPOSE 4002 3002
