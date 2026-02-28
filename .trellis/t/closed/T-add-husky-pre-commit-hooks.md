---
id: T-add-husky-pre-commit-hooks
title: Add Husky pre-commit hooks with lint-staged
status: done
priority: high
parent: none
prerequisites:
  - T-add-eslint-9-and-prettier
  - T-add-mise-configuration-for
affectedFiles:
  package.json: Created root package.json with husky, lint-staged, eslint,
    prettier devDependencies, prepare script, and lint-staged configuration
  package-lock.json: Generated lock file for root dependencies
  .husky/pre-commit: Created pre-commit hook that runs lint-staged and
    conditionally runs quality checks (lint, type-check, test) for code file
    changes
log:
  - |-
    Starting implementation. Research complete:
    - No root package.json exists yet
    - No .husky/ directory exists yet
    - .gitignore already covers node_modules/
    - mise.toml adds server/node_modules/.bin to PATH
    - ESLint 9 and Prettier are installed in server/package.json
    - Reference pre-commit hook reviewed from task-trellis-mcp project
    - This project uses `test` task (not `test:all` like the reference)
  - >-
    Implementation complete. Summary of work:


    1. Created root package.json with:
       - husky ^9.1.7 (installed as 9.1.7)
       - lint-staged ^16.1.2 (installed as 16.3.0)
       - eslint ^9.31.0 (installed as 9.39.3) - needed for lint-staged to resolve eslint binary
       - prettier ^3.6.2 (installed as 3.8.1) - needed for lint-staged to resolve prettier binary
       - "prepare": "husky" script for automatic hook setup
       - lint-staged config targeting server/src/**/*.{ts,tsx,js,jsx} and *.{md,json,yml,yaml}

    2. Created .husky/pre-commit hook:
       - Runs npx lint-staged for staged file linting/formatting
       - Conditionally runs mise run lint, type-check, test when code files are staged
       - Matches reference project pattern from task-trellis-mcp

    3. Ran npm install which installed dependencies and ran prepare script (npx
    husky)
       - git core.hooksPath set to .husky/_
       - Husky v9 internal handler (.husky/_/h) properly delegates to .husky/pre-commit

    4. Verified:
       - node_modules/ already covered by .gitignore
       - eslint runs from root against server files (eslint.config.mjs resolves plugins via createRequire)
       - prettier runs from root against server files
       - lint-staged debug run shows correct file matching and command execution
       - .husky/pre-commit is executable (chmod +x applied)
  - Added Husky pre-commit hooks with lint-staged for the food-tracking-ai repo.
    Created a root package.json with husky, lint-staged, eslint, and prettier as
    devDependencies. The lint-staged config runs eslint --fix and prettier
    --write on staged TypeScript files under server/src/, and prettier --write
    on markdown/JSON/YAML files. The .husky/pre-commit hook runs lint-staged
    first, then conditionally runs mise lint, type-check, and test when code
    files are staged. ESLint and Prettier were added to root devDeps to ensure
    lint-staged can resolve them regardless of PATH configuration (the
    eslint.config.mjs at root already handles plugin resolution from
    server/node_modules via createRequire).
schema: v1.0
childrenIds: []
created: 2026-02-28T18:40:39.072Z
updated: 2026-02-28T18:40:39.072Z
---

## Context

The food-tracking-ai repo has no git hooks for code quality enforcement. This task adds Husky for pre-commit hooks and lint-staged for incremental linting/formatting of staged files, matching the Task Trellis MCP project's setup at `/Users/zach/code/task-trellis-mcp/.husky/pre-commit`.

## Implementation Requirements

### 1. Create a root `package.json` for repo-wide tooling

Since Husky requires its hooks directory at the git root but the project's code dependencies live in `server/package.json`, create a minimal root `package.json` for repo-level dev tooling:

```json
{
  "private": true,
  "scripts": {
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^16.1.2"
  },
  "lint-staged": {
    "server/src/**/*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{md,json,yml,yaml}": ["prettier --write"]
  }
}
```

**Note:** The lint-staged paths must reference `server/src/` since it runs from the repo root. ESLint will find the root `eslint.config.mjs` automatically. Prettier must be resolvable — it's installed in `server/node_modules/`, so ensure `server/node_modules/.bin` is in PATH (handled by mise) or install prettier in root as well.

**Alternative:** If PATH resolution is problematic, install `eslint` and `prettier` in the root package.json devDependencies too, or reference them via `npx` / relative path to `server/node_modules/.bin/`.

### 2. Create `.husky/pre-commit`

```bash
#!/bin/sh

# Run lint-staged for conditional formatting
npx lint-staged

# Run additional quality checks if code files were changed
if git diff --staged --name-only | grep -E '\.(ts|tsx|js|jsx)$' > /dev/null; then
  echo "Code files detected, running quality checks..."
  mise run lint
  mise run type-check
  mise run test
fi
```

Reference: `/Users/zach/code/task-trellis-mcp/.husky/pre-commit`

### 3. Install and initialize

```bash
# From repo root:
npm install          # Install husky + lint-staged
npx husky           # Initialize .husky directory (prepare script)
```

### 4. Update `.gitignore` if needed

Ensure `node_modules/` at the root level is gitignored (it should already be covered by the existing pattern).

### 5. Verify setup

- Stage a TypeScript file change and run `git commit` to verify the pre-commit hook fires
- Confirm lint-staged runs ESLint and Prettier on staged files
- Confirm quality checks (lint, type-check, test) run when code files are staged

## Acceptance Criteria

- [ ] Root `package.json` exists with husky and lint-staged
- [ ] `.husky/pre-commit` hook exists and is executable
- [ ] `npm install` at root installs husky and sets up git hooks via `prepare` script
- [ ] Staging a `.ts` file and committing triggers: lint-staged (eslint --fix + prettier), then lint, type-check, and test
- [ ] Staging only non-code files (e.g., `.md`) triggers lint-staged (prettier only), skips quality checks
- [ ] Root `node_modules/` is gitignored

## Out of Scope

- ESLint/Prettier configuration (handled by prerequisite T-add-eslint-9-and-prettier)
- mise configuration (handled by prerequisite T-add-mise-configuration-for)
- Commitlint or commit message validation
- Other git hooks (pre-push, commit-msg, etc.)
