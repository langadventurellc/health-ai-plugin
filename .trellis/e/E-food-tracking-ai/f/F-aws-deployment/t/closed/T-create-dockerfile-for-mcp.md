---
id: T-create-dockerfile-for-mcp
title: Create Dockerfile for MCP Server
status: done
priority: high
parent: F-aws-deployment
prerequisites: []
affectedFiles:
  Dockerfile:
    'Created 3-stage multi-stage Dockerfile: build (TypeScript compile),
    deps (production-only npm ci with native addon), production (clean Alpine
    with dist/ and node_modules/ copied in, non-root user, health check,
    /app/data directory)'
  .dockerignore:
    Created comprehensive .dockerignore excluding node_modules, dist,
    .git, .env files, documentation, tests, plugin/, trellis, IDE configs,
    database files, and other non-essential files
log:
  - >-
    Research complete. Key findings:

    - Node.js 24.11.0 pinned in mise.toml

    - Server is in server/ subdirectory with its own package.json,
    package-lock.json, tsconfig.json

    - Root has a separate package.json for husky/lint-staged (not needed in
    Docker)

    - better-sqlite3 v12.6.2 is a native addon needing python3, make, g++ to
    compile on Alpine

    - Server uses ES2022/NodeNext modules, Express 5, MCP SDK

    - Entry point: node dist/index.js (from server/ context)

    - Health check at GET /health

    - ENV vars: PORT (3000), SQLITE_DB_PATH, USDA_API_KEY, ISSUER_URL

    - SQLite data dir: server/data/ locally, should be /app/data in container


    Planning multi-stage Dockerfile:

    1. Build stage: node:24-alpine, install build tools (python3, make, g++),
    copy server/package*.json, npm ci, copy server/src + tsconfig, npm run build

    2. Production stage: node:24-alpine, install runtime deps, copy dist/ and
    production node_modules, create /app/data, non-root user, healthcheck
  - Docker daemon is not running (Docker Desktop is installed but not started).
    Cannot perform the verification step (docker build + docker run). The
    Dockerfile and .dockerignore have been created and reviewed for correctness.
    Manual verification will be needed after starting Docker Desktop.
  - 'Created a production-ready multi-stage Dockerfile and .dockerignore for the
    MCP server. The Dockerfile uses 3 stages: (1) build stage to compile
    TypeScript with all dependencies, (2) deps stage to install only production
    dependencies with better-sqlite3 native addon compiled for Alpine, (3) clean
    production stage with no build tools -- just copies compiled dist/ and
    production node_modules/. The final image runs as non-root `node` user, has
    a health check against /health, exposes port 3000, creates /app/data for
    SQLite persistence (EFS mount point), and contains no baked-in secrets. The
    .dockerignore excludes node_modules, dist, .git, .env files, documentation,
    tests, plugin/, IDE configs, and other non-essential files to minimize build
    context. Note: Docker daemon was not running so the build could not be
    verified locally -- manual verification needed after starting Docker
    Desktop.'
schema: v1.0
childrenIds: []
created: 2026-02-28T22:03:22.494Z
updated: 2026-02-28T22:03:22.494Z
---

## Context

The Food Tracking AI MCP server (in `server/`) needs to be containerized for deployment to AWS ECS. The server is a Node.js 24 (ES2022, NodeNext) Express 5 application that uses `better-sqlite3` (a native C++ addon requiring compilation) and serves MCP Streamable HTTP with OAuth 2.1.

Parent feature: `F-aws-deployment`

## What to Build

Create a production-ready `Dockerfile` and `.dockerignore` in the repository root.

### Dockerfile Requirements

**Important: Repository layout.** The Dockerfile lives at the repo root, but the Node.js project (`package.json`, `tsconfig.json`, `src/`) is in the `server/` subdirectory. All `COPY` paths must account for this (e.g., `COPY server/package*.json ./`), and build commands must run in the correct context (e.g., `WORKDIR /app/server` or equivalent). The entrypoint `node dist/index.js` must resolve correctly relative to where `dist/` ends up in the final image.

- **Base image:** Node.js 24 Alpine (matches `mise.toml` pin of 24.11.0). Use a multi-stage build:
  - **Stage 1 (build):** Install all dependencies (including devDependencies), compile TypeScript (`npm run build`). `better-sqlite3` requires `python3`, `make`, and `g++` to compile its native addon on Alpine.
  - **Stage 2 (production):** Copy compiled `dist/`, production `node_modules` (install with `--omit=dev`), and `package.json`. `better-sqlite3` also needs runtime native libs -- reinstalling production deps in the final stage with build tools or copying the compiled `.node` file handles this.
- **Working directory:** `/app`
- **Data directory:** Create `/app/data` for SQLite persistence (will be an EFS mount point in production).
- **Environment variables:** Expose `PORT` (default 3000), `SQLITE_DB_PATH` (default `/app/data/food-cache.db`), `USDA_API_KEY`, `ISSUER_URL`. Do NOT bake secrets into the image.
- **Health check:** `HEALTHCHECK CMD wget -q --spider http://localhost:3000/health || exit 1` (or equivalent with curl/node).
- **User:** Run as non-root user for security.
- **Expose:** Port 3000.
- **Entrypoint:** `node dist/index.js`

### .dockerignore

Create `/Users/zach/code/food-tracking-ai/.dockerignore` to exclude:

- `node_modules`, `dist`, `.git`, `.env*`, `*.md` (except needed ones), test files, `.trellis/`, `plugin/`, IDE configs, and other non-essential files.

### Verification

- `docker build -t food-tracking-ai .` succeeds from the repo root.
- `docker run -e USDA_API_KEY=test -p 3000:3000 food-tracking-ai` starts and responds to `GET /health`.
- The image size is reasonable (under ~300MB).

## Files to Create/Modify

- `/Users/zach/code/food-tracking-ai/Dockerfile` (new)
- `/Users/zach/code/food-tracking-ai/.dockerignore` (new)

## Acceptance Criteria

- Multi-stage Dockerfile produces a working production image.
- `better-sqlite3` native addon compiles and works correctly inside the container.
- SQLite data directory is at `/app/data` (ready for volume mount).
- Container runs as non-root user.
- Docker health check is configured against `/health`.
- No secrets baked into the image.
- `.dockerignore` excludes unnecessary files, keeping the build context small.
- Image builds without errors on both amd64 and arm64 (standard Node Alpine supports both).

## Out of Scope

- Terraform infrastructure (separate task `T-*`)
- Pushing images to ECR (handled in Terraform/deploy task)
- CI/CD pipeline
- Docker Compose for local development
