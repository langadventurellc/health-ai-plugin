---
id: T-add-eslint-9-and-prettier
title: Add ESLint 9 and Prettier configuration
status: done
priority: high
parent: none
prerequisites: []
affectedFiles:
  eslint.config.mjs: 'Created ESLint 9 flat config at repo root. Uses
    createRequire to resolve ESLint packages from server/node_modules.
    Configures: ignore patterns, typescript-eslint with projectService, sonarjs
    recommended rules, relaxed test file rules, and prettier integration as the
    last config.'
  server/package.json: 'Added devDependencies: eslint ^9.31.0, typescript-eslint
    ^8.38.0, @typescript-eslint/eslint-plugin ^8.38.0, eslint-config-prettier
    ^10.1.8, eslint-plugin-sonarjs ^3.0.4, prettier ^3.6.2. Added scripts: lint
    (eslint --config ../eslint.config.mjs src --fix) and format (prettier
    --write src/**/*.{ts,js,json,md}).'
  server/package-lock.json: Updated with newly installed ESLint and Prettier dependencies.
  server/src/cache/__tests__/cache.test.ts: Reformatted by Prettier.
  server/src/cache/cache.ts: Reformatted by Prettier.
  server/src/cache/db.ts: Reformatted by Prettier.
  server/src/clients/__tests__/openfoodfacts.test.ts: Reformatted by Prettier.
  server/src/clients/__tests__/usda.test.ts: Reformatted by Prettier.
  server/src/clients/openfoodfacts.ts: Reformatted by Prettier.
  server/src/clients/usda.ts: Reformatted by Prettier.
  server/src/index.ts: Reformatted by Prettier.
  server/src/server.ts: Reformatted by Prettier.
  server/src/tools/__tests__/get-nutrition.test.ts: Reformatted by Prettier.
  server/src/tools/__tests__/search-food.test.ts: Reformatted by Prettier.
  server/src/tools/get-nutrition.ts: Reformatted by Prettier.
  server/src/tools/search-food.ts: Reformatted by Prettier.
log:
  - 'Starting implementation. Reviewed reference config at
    /Users/zach/code/task-trellis-mcp/eslint.config.mjs, current
    server/package.json, and tsconfig.json. Plan: (1) Create eslint.config.mjs
    at repo root adapted from reference, (2) Add devDependencies and scripts to
    server/package.json, (3) Run npm install and npm run lint to verify.'
  - Added ESLint 9 flat config and Prettier to the food-tracking-ai project.
    Created eslint.config.mjs at the repo root using createRequire to resolve
    packages from server/node_modules (since packages are installed in server/
    but the config lives at the repo root). The config matches the Task Trellis
    MCP reference minus the @langadventurellc/tsla-linter custom plugin. Added
    all required devDependencies and lint/format scripts to server/package.json.
    Both npm run lint and npm run format execute successfully, and all 156
    existing tests continue to pass.
schema: v1.0
childrenIds: []
created: 2026-02-28T18:40:01.252Z
updated: 2026-02-28T18:40:01.252Z
---

## Context

The food-tracking-ai repo currently has no linting or formatting setup. This task adds ESLint 9 (flat config) and Prettier, matching the Task Trellis MCP project's configuration at `/Users/zach/code/task-trellis-mcp` — minus the `@langadventurellc/tsla-linter` custom plugin.

## Implementation Requirements

### 1. Create `eslint.config.mjs` at repo root

Use ESLint 9 flat config format matching the template. The config should:

- **Ignore patterns:** `node_modules/**`, `coverage/**`, `dist/**`, `server/dist/**`
- **TypeScript files (`server/src/**/\*.ts`):\*\*
  - Enable `typescript-eslint` with `projectService: true`
  - `@typescript-eslint/no-unused-vars`: error (ignore vars starting with `_`)
  - `prefer-const`: error
  - `no-var`: error
  - `no-console`: warn (allow `warn` and `error`)
  - `max-lines`: warn (600 line limit, blank lines excluded)
  - `eslint-plugin-sonarjs`: recommended rules with `sonarjs/deprecation: warn`
- **Test files (`*.test.ts`, `**/**tests**/**`):**
  - Relax rules: `no-console` off, `max-lines` off
  - Disable strict TypeScript rules (`no-explicit-any`, unsafe operations, etc.)
- **Prettier integration:** `eslint-config-prettier` as last config to disable formatting rules

Reference: `/Users/zach/code/task-trellis-mcp/eslint.config.mjs`

### 2. Install devDependencies in `server/package.json`

Add the following devDependencies:

- `eslint` ^9.31.0
- `typescript-eslint` ^8.38.0
- `@typescript-eslint/eslint-plugin` ^8.38.0
- `eslint-config-prettier` ^10.1.8
- `eslint-plugin-sonarjs` ^3.0.4
- `prettier` ^3.6.2

### 3. Add npm scripts to `server/package.json`

- `"lint": "eslint . --fix"` (note: ESLint will find the root config automatically)
- `"format": "prettier --write \"src/**/*.{ts,js,json,md}\""`

### 4. Verify setup

Run `cd server && npm install` and then `npm run lint` to confirm ESLint runs without configuration errors. Fix any existing lint violations or adjust rules as needed.

**Important note on module system:** This project uses ESM (`"type": "module"` in server/package.json, `NodeNext` module resolution in tsconfig.json). The `eslint.config.mjs` extension ensures ESM compatibility regardless.

## Acceptance Criteria

- [ ] `eslint.config.mjs` exists at repo root with flat config matching template (minus tsla-linter plugin)
- [ ] All ESLint and Prettier devDependencies are installed in `server/package.json`
- [ ] `npm run lint` and `npm run format` scripts work from `server/`
- [ ] ESLint runs successfully against `server/src/**/*.ts`
- [ ] Prettier formats code correctly
- [ ] Test files have relaxed linting rules

## Out of Scope

- Husky / pre-commit hooks (separate task)
- mise configuration (separate task)
- Custom linter plugins (`@langadventurellc/tsla-linter`)
- Fixing all pre-existing lint violations (just ensure config loads and runs; violations can be addressed separately)
