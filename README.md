# Health AI Plugin

A low-friction nutritional tracking system for Claude Code. Describe what you ate via text or photos and get back calculated nutritional information with confidence scores.

## How It Works

Two components work together:

1. **Remote MCP Server** - Handles nutritional data lookups (USDA FoodData Central + Open Food Facts), caching, unit conversion, and deterministic math calculations
2. **Claude Code Plugin** - A skill that guides the conversation: asks clarifying questions, interprets images, and presents results with confidence scoring

The LLM reasons about *what* you ate and *how much*. The MCP server does the *calculations* - no nutritional math relies on LLM probability.

## Examples

- "How many calories in my coffee with milk and sugar?"
- "I had a protein shake - two scoops of Gold Standard, 330g whole milk, half a banana"
- "Made spaghetti with half a box of pasta, a pound of ground beef, and a jar of Rao's marinara"
- [photo of nutrition label] "Had two scoops of this with milk"
- "Had a Big Mac and medium fries"

## Setup

### MCP Server

```bash
cd server
cp .env.example .env
# Edit .env and add your USDA API key (free from https://fdc.nal.usda.gov/api-key-signup)
npm install
npm run dev
```

The server starts on `http://localhost:3000` with a health check at `/health` and MCP endpoint at `/mcp`.

### Running Tests

```bash
cd server
npm test
```

## Status

In active development. The MCP server core is implemented with `search_food` and `get_nutrition` tools, SQLite caching, and USDA/Open Food Facts integration. See [REQUIREMENTS.md](REQUIREMENTS.md) for the full specification.

**Implemented:**
- MCP server with Streamable HTTP transport
- Food search across USDA and Open Food Facts with cross-source deduplication
- Nutritional lookup with weight-based unit conversion (g, kg, oz, lb)
- SQLite cache with TTL revalidation and graceful degradation

**Planned:**
- `calculate_meal` and `save_food` tools
- Volume and descriptive unit conversion
- OAuth 2.1 authentication
- Claude Code plugin with `nutrition-tracker` skill
- AWS deployment

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
