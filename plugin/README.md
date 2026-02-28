# Food Tracking AI -- Claude Code Plugin

A Claude Code plugin for low-friction nutritional tracking. Describe
what you ate in natural language or send a photo, and get back
calculated nutritional information with confidence scores. All
nutritional math is performed deterministically by the remote MCP
server -- the LLM reasons about _what_ was eaten and _how much_.

## Prerequisites

- The Food Tracking AI MCP server must be deployed and accessible
  over HTTPS (see `server/` in the repository root)
- Claude Code installed and configured

## Setup

1. Update the server URL in `.mcp.json` to point to your deployed
   MCP server (replace `PLACEHOLDER_URL` with the actual host):

   ```json
   {
     "mcpServers": {
       "food-tracking-ai": {
         "type": "http",
         "url": "https://your-server-domain.com/mcp"
       }
     }
   }
   ```

2. Install the plugin in Claude Code by pointing to this directory:

   ```bash
   claude plugin add ./plugin
   ```

The server uses MCP OAuth 2.1 with PKCE for authentication. Claude
Code handles the browser-based OAuth flow automatically on first
connection -- no manual token configuration is needed.

## Usage

Invoke the skill with `/nutrition-tracker` or simply describe what
you ate in conversation. Examples:

- "I had two eggs and a slice of toast with butter"
- "Track a grande oat milk latte from Starbucks"
- Send a photo of a nutrition label or a plate of food

## Available MCP Tools

The plugin connects to four server-side tools:

- **search_food** -- Search for foods across USDA, Open Food Facts,
  and saved custom foods
- **get_nutrition** -- Get nutritional breakdown for a specific
  amount of a food item
- **calculate_meal** -- Calculate total nutrition for a multi-item
  meal
- **save_food** -- Save custom food data (restaurant lookups,
  nutrition labels) for future use
