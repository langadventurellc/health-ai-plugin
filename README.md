# Health AI Plugin

A low-friction nutritional tracking system for Claude Code. Describe what you ate via text or photos and get back calculated nutritional information with confidence scores.

## How It Works

Two components work together:

1. **Remote MCP Server** - Handles nutritional data lookups (USDA FoodData Central + Open Food Facts), caching, unit conversion, and deterministic math calculations
2. **Claude Code Plugin** - A skill that guides the conversation: asks clarifying questions, interprets images, and presents results with confidence scoring

The LLM reasons about _what_ you ate and _how much_. The MCP server does the _calculations_ - no nutritional math relies on LLM probability.

## Examples

- "How many calories in my coffee with milk and sugar?"
- "I had a protein shake - two scoops of Gold Standard, 330g whole milk, half a banana"
- "Made spaghetti with half a box of pasta, a pound of ground beef, and a jar of Rao's marinara"
- [photo of nutrition label] "Had two scoops of this with milk"
- "Had a Big Mac and medium fries"

## Setup

### Prerequisites

- [mise](https://mise.jdx.dev/) for Node version management and task running

### Getting Started

```bash
mise install                # Install Node 24.11.0
npm install                 # Root: install git hooks (husky + lint-staged)
cd server
cp .env.example .env        # Add your USDA API key (free from https://fdc.nal.usda.gov/api-key-signup)
npm install                 # Server: install project dependencies
```

Both `npm install` steps are required -- root installs repo-wide tooling (git hooks), `server/` installs project dependencies.

### Running

```bash
mise run dev                # Dev server with hot reload (from repo root)
# or
cd server && npm run dev    # Equivalent
```

The server starts on `http://localhost:3000` with a health check at `/health` and MCP endpoint at `/mcp`.

### Plugin Install

1. Update `plugin/.mcp.json` with your deployed server URL (replace `PLACEHOLDER_URL`)
2. Install the plugin:

```bash
claude plugin add ./plugin
```

OAuth authentication is handled automatically by Claude Code on first connection.

### Running Tests

```bash
mise run test               # From repo root
# or
cd server && npm test       # Equivalent
```

### Code Quality

Pre-commit hooks automatically run ESLint, Prettier, type checking, and tests on staged files. To run manually:

```bash
mise run quality            # Lint + format + type-check
mise run lint               # ESLint --fix
mise run format             # Prettier --write
mise run type-check         # tsc --noEmit
```

### Deployment

The server deploys to AWS ECS Fargate via a GitHub Actions workflow (manual trigger). See [`infra/README.md`](infra/README.md) for full setup instructions including Terraform provisioning, GitHub Actions variable configuration, and operational commands.

```bash
mise run deploy            # Opens the deploy workflow in GitHub
```

## Status

In active development. The MCP server core is implemented with `search_food`, `get_nutrition`, `calculate_meal`, and `save_food` tools, SQLite caching, and USDA/Open Food Facts integration. See [REQUIREMENTS.md](REQUIREMENTS.md) for the full specification.

**Implemented:**

- MCP server with Streamable HTTP transport
- Food search across USDA and Open Food Facts with cross-source deduplication
- Nutritional lookup with unit conversion: weight (g, kg, oz, lb), volume (cup, tbsp, tsp, fl_oz, mL, L), and descriptive sizes (piece, slice, small, medium, large)
- Meal calculation (`calculate_meal`) with deterministic nutrient summing and coverage reporting
- SQLite cache with TTL revalidation and graceful degradation
- Custom food storage (`save_food`) for restaurant items and nutrition labels, with 90-day TTL and upsert semantics
- MCP OAuth 2.1 authentication with PKCE, dynamic client registration, and bearer token middleware
- Claude Code plugin with `nutrition-tracker` skill (see `plugin/README.md` for setup)
- AWS deployment on ECS Fargate with HTTPS, EFS persistence, and GitHub Actions CI/CD (see [`infra/README.md`](infra/README.md))

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
