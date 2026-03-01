---
id: E-food-tracking-ai
title: Food Tracking AI
status: done
priority: high
parent: none
prerequisites: []
affectedFiles:
  server/package.json:
    'Created with all dependencies: @modelcontextprotocol/sdk,
    express, zod, better-sqlite3, and dev dependencies (typescript, tsx,
    @types/*). ESM module with dev/build/start scripts.; Added vitest dev
    dependency and test script'
  server/tsconfig.json: TypeScript config targeting ES2022, NodeNext module
    resolution, strict mode, output to dist/
  server/src/index.ts: 'Entry point: Express app with health check, Streamable
    HTTP transport on /mcp (POST/GET/DELETE), stateful session management with
    per-session transport+server pairs; Added Cache import and shared cache
    instance creation. Passes cache to createMcpServer for each session.; Added
    imports for mcpAuthRouter, requireBearerAuth, getDatabase, and
    SqliteOAuthServerProvider. Moved initializeDatabase() to top of module.
    Created provider instance and configured mcpAuthRouter with rate limiting
    disabled. Applied bearerAuth middleware to all three MCP routes
    (POST/GET/DELETE /mcp). Added ISSUER_URL constant derived from env var with
    localhost fallback.'
  server/src/server.ts: 'McpServer factory with placeholder search_food and
    get_nutrition tool stubs using zod input schemas; Replaced placeholder tool
    stubs with real implementations. createMcpServer now accepts Cache
    parameter, creates API clients internally, and registers tools with
    dependency injection. Added error handling that returns isError: true on
    failures.; Expanded get_nutrition Zod schema unit enum to include all 15
    unit types, updated description to mention volume and descriptive unit
    support; Imported handleCalculateMeal and registered calculate_meal tool
    with Zod schema (items array with min(1), each item has foodId, source,
    amount, unit), following existing error handling pattern; Added
    CustomFoodStore import and instantiation in createMcpServer, added store to
    ToolDeps interface, registered save_food tool with Zod input schema; Updated
    all three handler calls (handleSearchFood, handleGetNutrition,
    handleCalculateMeal) to pass deps.store.'
  server/src/types.ts: "Shared TypeScript interfaces: FoodSearchResult,
    NutrientValue, NutrientBreakdown, NutritionResult; Added optional portions
    (PortionData[]) and densityGPerMl fields to NutritionData interface; Added
    StorageMode type ('per-100g' | 'per-serving') and optional storageMode field
    to NutritionData interface"
  server/.env.example:
    'Documents required env vars: USDA_API_KEY and PORT; Added
    ISSUER_URL env var with description and default value for local
    development.'
  server/src/cache/db.ts: 'Created database initialization module: singleton
    pattern, WAL mode, schema creation for nutrition_cache and search_cache
    tables, configurable path via SQLITE_DB_PATH env var; Added custom_foods
    table with id, name, brand, category, data, created_at, expires_at columns
    and case-insensitive indexes on name and brand; Modified: Added import and
    call to initializeAuthTables so auth tables are created alongside cache
    tables during database initialization'
  server/src/cache/cache.ts:
    Created Cache class with get/set/stale operations for
    nutrition and search data, TTL constants, query normalization with SHA-256
    hashing, isExpired helper, prepared statements
  server/src/cache/__tests__/cache.test.ts: Created 21 unit tests covering TTL
    expiration, stale retrieval, cache hit/miss, query normalization,
    source-specific TTL, WAL mode, and table creation
  server/src/clients/types.ts:
    'Created shared types: NutritionData interface with
    foodId, source, name, servingSize, and nutrients map (NutrientValue with
    value+available flag). FoodSearchResult interface with id, source, name,
    brand, matchScore.; Added re-export of PortionData from conversion/types.ts;
    Re-exported StorageMode type from ../types.ts'
  server/src/clients/usda.ts: Created UsdaClient class with searchFoods and
    getNutrition methods. Includes USDA nutrient ID-to-key mapping,
    normalizeSearchResults and normalizeNutrition pure functions (exported for
    testing), cache-through reads, stale-cache fallback on API failure, 10s HTTP
    timeout.; Added UsdaFoodPortion interface, foodPortions to
    UsdaFoodDetailResponse, extractPortionData helper, and updated
    normalizeNutrition to extract portion data and derive density
  server/src/clients/openfoodfacts.ts: Created OpenFoodFactsClient class with
    searchFoods and getNutrition methods. Includes OFF nutriment key mapping,
    sodium g-to-mg conversion, User-Agent header, normalizeSearchResults and
    normalizeNutrition pure functions, cache-through reads, stale-cache
    fallback, 10s HTTP timeout.
  server/src/clients/__tests__/usda.test.ts:
    '10 unit tests: search normalization,
    result limit, nutrition normalization with available/unavailable flags,
    sparse data handling, cache hit/miss/stale integration with mocked fetch.'
  server/src/clients/__tests__/openfoodfacts.test.ts: '14 unit tests: search
    normalization with name filtering, result limit, nutrition normalization,
    sodium conversion, sparse/empty/undefined nutriments handling, cache
    hit/miss/stale integration, product-not-found handling.'
  server/src/tools/search-food.ts: "Created search_food tool handler with
    deduplication logic: normalizeName, wordOverlap, isDuplicate,
    deduplicateResults, and handleSearchFood. Searches sources in parallel,
    deduplicates across USDA and OFF, caches combined results, handles partial
    failures with warnings.; Added CustomFoodStore import and store to
    SearchFoodDeps. When source='all', custom foods are searched fresh via
    store.search() and prepended to results, both when hitting cache and when
    fetching live USDA/OFF results. Custom foods skip cross-source
    deduplication."
  server/src/tools/get-nutrition.ts:
    "Created get_nutrition tool handler with unit
    conversion and nutrient scaling: toGrams, scaleNutrient, scaleNutrients, and
    handleGetNutrition. Converts weight units to grams, scales per-100g
    nutrients, rounds to 1 decimal, builds serving description.; Removed
    UNIT_TO_GRAMS/toGrams (moved to conversion module), added NutritionUnit type
    with all 15 units, updated handleGetNutrition to use convertToGrams with
    food context, improved buildServingDescription for non-weight units; Added
    CustomFoodStore import and store to GetNutritionDeps. Added
    scalePerServing() for per-serving custom foods (ratio-based scaling with
    unit validation). Replaced the 'Unsupported source: custom' error with
    actual custom food retrieval supporting both per-100g and per-serving
    storage modes."
  server/src/tools/__tests__/search-food.test.ts: "13 unit tests covering: name
    normalization, word overlap calculation, cross-source duplicate detection,
    deduplication with overlapping results, single-source search, partial source
    failure, and combined cache hits.; Added CustomFoodStore to imports and
    deps. Added 3 tests: custom foods appear in source='all' results, excluded
    from source-specific searches, and appear even when USDA/OFF results come
    from cache."
  server/src/tools/__tests__/get-nutrition.test.ts: "16 unit tests covering:
    toGrams conversion for all supported units, scaleNutrient with
    available/unavailable nutrients, scaleNutrients for 150g/oz/lb amounts,
    handleGetNutrition end-to-end with USDA food, error on missing food, error
    on custom source, and oz unit conversion.; Removed toGrams tests (covered by
    conversion module tests), added MILK_NUTRITION and BANANA_NUTRITION
    fixtures, added 4 integration tests for volume unit with density, volume
    unit without density (error), descriptive unit with portions, descriptive
    unit without portions (error); Added CustomFoodStore to imports and deps.
    Replaced 'throws for custom source' test with 5 new tests: per-100g custom
    food scaling, per-100g with different weight unit, per-serving ratio
    scaling, incompatible unit error for per-serving foods, and custom food not
    found error."
  server/src/conversion/types.ts: Created PortionData and FoodConversionContext
    types for unit conversion context
  server/src/conversion/units.ts: Created standalone conversion module with
    weightToGrams, volumeToMl, convertToGrams, and unit type detection functions
  server/src/conversion/__tests__/units.test.ts: Created 26 unit tests covering
    weight, volume, volume-to-weight, descriptive size, and error cases
  server/src/tools/calculate-meal.ts: Created handler with handleCalculateMeal
    function, supporting types (MealItem, CalculateMealParams,
    CalculateMealResponse, NutrientCoverage), and helper functions (leastFresh,
    collectNutrientKeys, aggregateNutrient, determineCoverage, sumNutrients);
    Added CustomFoodStore import and store to CalculateMealDeps, enabling
    handleGetNutrition to receive the store dependency transitively.
  server/src/tools/__tests__/calculate-meal.test.ts: 'Created 4 tests: two-item
    meal summing, partial coverage detection, error propagation with clear item
    identification, and single-item identity verification; Added CustomFoodStore
    to imports and deps (via makeDeps). Added 1 test: meal with mixed USDA and
    custom food items computes correct totals.'
  server/src/clients/custom-store.ts: 'New module: CustomFoodStore class with
    save(), get(), search() methods; SaveFoodInput interface;
    generateCustomFoodId helper; per-100g normalization for weight-based
    servings'
  server/src/clients/__tests__/custom-store.test.ts: 'New test file: 16 tests
    covering ID generation, save/retrieve round-trip, upsert behavior, TTL
    expiration, search by name/brand, per-100g normalization, and per-serving
    storage'
  server/src/tools/save-food.ts: 'New file: save_food tool handler with
    validateNutrients validation and handleSaveFood function that delegates to
    CustomFoodStore.save()'
  server/src/tools/__tests__/save-food.test.ts: 'New file: 4 unit tests covering
    successful save, negative calorie validation, NaN validation, and upsert
    behavior'
  server/src/auth/db.ts: 'New file: initializeAuthTables function creating
    oauth_clients, oauth_authorization_codes, and oauth_tokens tables with index
    on client_id'
  server/src/auth/clients-store.ts: 'New file: SqliteClientsStore implementing
    OAuthRegisteredClientsStore with getClient and registerClient backed by
    SQLite'
  server/src/auth/provider.ts: 'New file: SqliteOAuthServerProvider implementing
    OAuthServerProvider interface with all required methods - authorize,
    challengeForAuthorizationCode, exchangeAuthorizationCode,
    exchangeRefreshToken, verifyAccessToken, revokeToken'
  server/src/auth/__tests__/provider.test.ts: 'New file: 22 unit tests covering
    token validation, PKCE flow, refresh token flow, auth code expiry, token
    revocation, and authorize redirect behavior'
  plugin/.claude-plugin/plugin.json: 'Created plugin metadata: name
    "food-tracking-ai", version "1.0.0", description of the plugin'
  plugin/.mcp.json: Created MCP server configuration with type "http" and
    placeholder URL pointing to /mcp endpoint, using mcpServers wrapper matching
    Claude Code plugin conventions
  plugin/README.md: 'Created documentation covering: what the plugin does,
    prerequisites (deployed server + Claude Code), setup (URL replacement in
    .mcp.json and plugin install command), OAuth 2.1 authentication note, usage
    examples (slash command and natural language), and list of four available
    MCP tools'
  plugin/skills/nutrition-tracker/SKILL.md: 'Created placeholder with TODO
    comment; full content deferred to sibling task T-write-skillmd-conversation;
    Replaced placeholder with complete skill definition (337 lines). Covers:
    conversation flow, input parsing, clarifying questions with defaults table,
    food search/lookup workflow with exact tool parameters, image handling
    (labels/food photos/combined), restaurant food flow with save_food caching,
    response format with confidence score examples, confidence scoring scale and
    factors, and general behavioral guidelines.'
  Dockerfile:
    'Created 3-stage multi-stage Dockerfile: build (TypeScript compile),
    deps (production-only npm ci with native addon), production (clean Alpine
    with dist/ and node_modules/ copied in, non-root user, health check,
    /app/data directory)'
  .dockerignore:
    Created comprehensive .dockerignore excluding node_modules, dist,
    .git, .env files, documentation, tests, plugin/, trellis, IDE configs,
    database files, and other non-essential files
  infra/main.tf: Provider config (hashicorp/aws ~> 5.0), local backend, name_prefix local
  infra/variables.tf: 'Input variables: aws_region, domain_name, hosted_zone_id,
    usda_api_key (sensitive), github_repo'
  infra/outputs.tf: 'Outputs: server_url, ecr_repository_url, alb_dns_name,
    github_actions_role_arn; Added ecs_cluster_name and ecs_service_name outputs
    for GitHub Actions workflow configuration.'
  infra/vpc.tf: VPC with 2 public + 2 private subnets, IGW, single NAT gateway, route tables
  infra/security-groups.tf: ALB (HTTP/HTTPS in, port 3000 to ECS), ECS (from ALB
    only, all egress), EFS (NFS from ECS only)
  infra/ecr.tf: ECR repository with scan-on-push and lifecycle policy (keep last 10 images)
  infra/efs.tf:
    Encrypted EFS, mount targets in private subnets, access point with
    UID/GID 1000
  infra/alb.tf: ACM cert with DNS validation, ALB, target group (health check on
    /health), HTTPS + HTTP->HTTPS listeners, Route53 alias
  infra/ecs.tf:
    ECS cluster, CloudWatch log group (30d retention), task definition
    (0.5 vCPU, 1GB, EFS mount, secrets), service (desired 1, min healthy 100%)
  infra/iam.tf: Task execution role (ECR pull, logs, secrets read), task role
    (minimal), GitHub Actions OIDC provider + IAM role (ECR push, ECS deploy,
    PassRole)
  infra/secrets.tf: Secrets Manager secret for USDA API key
  .gitignore: 'Added Terraform exclusions: .terraform/, *.tfstate, *.tfstate.*,
    terraform.tfvars'
  infra/.terraform.lock.hcl: Auto-generated provider lock file (hashicorp/aws v5.100.0)
  .github/workflows/deploy.yml: Created GitHub Actions deploy workflow with
    workflow_dispatch trigger, OIDC auth via
    aws-actions/configure-aws-credentials@v6, ECR login, Docker build+push (SHA
    + latest tags), ECS force-new-deployment with wait, and health check
    verification. All config via GitHub Actions variables.
  infra/README.md: Created comprehensive deployment documentation covering
    prerequisites, architecture overview, first-time Terraform setup, GitHub
    Actions variable mapping table, deployment instructions, plugin
    configuration, Terraform variables reference, and useful commands (logs, ECS
    debugging, tear down).
  mise.toml:
    Added deploy task that opens the GitHub Actions deploy workflow page
    in the browser using gh CLI.
log:
  - 'Auto-completed: All child features are complete'
schema: v1.0
childrenIds:
  - F-aws-deployment
  - F-claude-code-plugin-and-skill
  - F-custom-food-storage
  - F-mcp-oauth-21-authentication
  - F-mcp-server-core-and-food-data
  - F-unit-conversion-and-meal
created: 2026-02-28T16:46:47.998Z
updated: 2026-02-28T16:46:47.998Z
---

## Overview

A low-friction nutritional tracking system that lets users describe what they ate (via text or photos) and get back calculated nutritional information. Two components work together through Claude Code:

1. **Remote MCP Server** (TypeScript/Node.js on AWS) - Nutritional data lookups, caching, and deterministic math calculations
2. **Claude Code Plugin** - Skill(s) that guide the LLM conversation: clarifying questions, image interpretation, confidence scoring

### Core Principle

The LLM reasons about _what_ was eaten and _how much_. The MCP server does the _calculations_. No nutritional math should rely on LLM probability - all final numbers must be computed deterministically by the MCP server.

## Components

### Remote MCP Server

- **Stack:** TypeScript / Node.js, Streamable HTTP transport, deployed on AWS
- **Authentication:** MCP OAuth 2.1 with PKCE
- **Cache:** SQLite with TTL-based revalidation
- **Data Sources:**
  - USDA FoodData Central (primary - 300K+ foods, 150+ nutrients)
  - Open Food Facts (secondary - branded/packaged products)

#### MCP Tools

- `search_food` - Search across data sources + cached custom foods
- `get_nutrition` - Nutritional breakdown for a specific food/amount with unit conversion
- `calculate_meal` - Deterministic sum of nutrients across multiple items
- `save_food` - Cache nutrition data from web searches/labels for consistent repeat lookups (90-day TTL)

#### Unit Conversion

Handles volume (cups, tbsp, tsp, fl oz, mL), weight (g, oz, lb, kg), and descriptive sizes ("1 medium banana"). Volume-to-weight requires per-food density data.

### Claude Code Plugin

- Plugin with `nutrition-tracker` skill (SKILL.md)
- Guides conversation: parse input → identify gaps → ask clarifying questions (max 2-3) → search → calculate → present results
- Image handling via Claude's built-in vision (nutrition labels + food photos)
- Restaurant food: LLM web searches, then caches via `save_food` for consistency
- Confidence scoring: 0-100% with labels (High/Good/Moderate/Low) + explanation

## Requirements Reference

Full requirements document: `REQUIREMENTS.md` in the project root.

## Acceptance Criteria

- Remote MCP server deployed on AWS, accessible via Streamable HTTP over HTTPS
- MCP OAuth 2.1 authentication implemented and required for all tool calls
- `search_food` returns results from USDA, Open Food Facts, and cached custom foods
- `get_nutrition` returns per-amount nutritional breakdowns with unit conversion
- `calculate_meal` sums nutrients deterministically across multiple items
- `save_food` stores custom nutrition data with 90-day TTL, appears in future searches
- SQLite caching with TTL revalidation (30 days USDA, 7 days Open Food Facts, 90 days custom)
- Claude Code plugin installable with SKILL.md guiding conversation flow
- Plugin connects to remote MCP server via `.mcp.json`
- End-to-end: user describes meal in text → calculated nutrition with confidence score
- End-to-end: user sends nutrition label photo → correct data extraction and calculation
- Confidence scores present and reasonable across input scenarios

## Non-Goals (v1)

- No daily/weekly tracking or totals
- No meal planning or dietary recommendations
- No user accounts or persistent meal history
- No barcode scanning integration
- No fitness tracker integration
- No rate limiting (fast follow after auth)

## Technical Notes

- Greenfield project - no existing codebase
- USDA API key required (free, from fdc.nal.usda.gov)
- Open Food Facts API requires no key
- System should degrade gracefully when external APIs unavailable
- Estimated scale: ~5-6 features
