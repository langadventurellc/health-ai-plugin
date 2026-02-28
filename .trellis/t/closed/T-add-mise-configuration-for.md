---
id: T-add-mise-configuration-for
title: Add mise configuration for task running and Node version management
status: done
priority: high
parent: none
prerequisites:
  - T-add-eslint-9-and-prettier
affectedFiles:
  mise.toml: Created mise.toml at repo root with min_version 2024.11.0, Node
    24.11.0 tool pin, NODE_ENV=development environment, server/node_modules/.bin
    on PATH, and 9 task definitions (build, dev, start, test, test:watch, lint,
    format, type-check, quality) all configured with dir=server.
log:
  - Starting implementation. Reviewed reference mise.toml from task-trellis-mcp,
    verified repo structure (server/ subdirectory with node_modules/.bin),
    confirmed prerequisite T-add-eslint-9-and-prettier is done (eslint,
    prettier, vitest all available in server/). Mise is installed (v2026.1.3).
    Creating mise.toml at repo root.
  - 'Created mise.toml at the repo root with Node 24.11.0 pinned, development
    environment settings, and 9 task definitions (build, dev, start, test,
    test:watch, lint, format, type-check, quality). All tasks use dir = "server"
    to run in the server subdirectory. The PATH is extended with
    server/node_modules/.bin for direct access to project binaries. Verified:
    mise install successfully installs Node 24.11.0, all tasks execute correctly
    from the repo root, task aliases (t, f, l, tc) work, and all 156 existing
    tests pass under the mise-managed Node version after rebuilding native
    modules.'
schema: v1.0
childrenIds: []
created: 2026-02-28T18:40:18.515Z
updated: 2026-02-28T18:40:18.515Z
---

## Context

The food-tracking-ai repo has no task runner or Node version management. This task adds a `mise.toml` at the repo root to pin the Node.js LTS version and define development tasks, matching the pattern used in the Task Trellis MCP project at `/Users/zach/code/task-trellis-mcp/mise.toml`.

## Implementation Requirements

### 1. Create `mise.toml` at repo root

**Settings:**

- `min_version`: `"2024.11.0"`

**Tools:**

- `node`: `"24.11.0"` (current LTS)

**Environment:**

- `NODE_ENV`: `"development"`
- `_.path`: add `server/node_modules/.bin` to PATH

**Tasks** (adapted for the `server/` subdirectory structure — commands should `cd` into `server/` or reference `server/` paths as needed):

| Task         | Command                                                      | Dependencies | Description                 |
| ------------ | ------------------------------------------------------------ | ------------ | --------------------------- |
| `build`      | `tsc` (from server/)                                         | —            | Compile TypeScript          |
| `dev`        | `tsx watch src/index.ts` (from server/)                      | —            | Dev server with hot reload  |
| `start`      | `node dist/index.js` (from server/)                          | `build`      | Start production server     |
| `test`       | `vitest run` (from server/)                                  | —            | Run tests (alias: `t`)      |
| `test:watch` | `vitest --watch` (from server/)                              | —            | Tests in watch mode         |
| `lint`       | `eslint . --fix` (from server/)                              | —            | Lint and fix (alias: `l`)   |
| `format`     | `prettier --write "src/**/*.{ts,js,json,md}"` (from server/) | —            | Format code (alias: `f`)    |
| `type-check` | `tsc --noEmit` (from server/)                                | —            | Type checking (alias: `tc`) |
| `quality`    | composite of lint, format, type-check                        | —            | All quality checks          |

Use `dir = "server"` on tasks to set working directory, matching how the template uses task-level configuration.

Reference: `/Users/zach/code/task-trellis-mcp/mise.toml`

### 2. Verify setup

Run `mise install` to install the pinned Node version, then test key tasks like `mise run build`, `mise run lint`, `mise run test` to confirm they work correctly from the repo root.

## Acceptance Criteria

- [ ] `mise.toml` exists at repo root
- [ ] Node.js 24.11.0 LTS is pinned via mise
- [ ] All tasks (build, dev, start, test, lint, format, type-check, quality) are defined and execute correctly
- [ ] Tasks run from the repo root but operate in `server/` directory
- [ ] `mise install` installs the correct Node version

## Out of Scope

- Husky / pre-commit hooks (separate task)
- Installing or configuring ESLint/Prettier themselves (prerequisite task T-add-eslint-9-and-prettier)
- Modifying existing npm scripts in `server/package.json` (mise wraps them; both can coexist)
