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

## Status

This project is in early development. See [REQUIREMENTS.md](REQUIREMENTS.md) for the full specification.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
