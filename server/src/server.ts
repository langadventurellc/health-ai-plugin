import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Cache } from './cache/cache.js';
import { UsdaClient } from './clients/usda.js';
import { OpenFoodFactsClient } from './clients/openfoodfacts.js';
import { handleSearchFood } from './tools/search-food.js';
import { handleGetNutrition } from './tools/get-nutrition.js';
import { handleCalculateMeal } from './tools/calculate-meal.js';

const pkg: { version: string } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as { version: string };

/** Creates and configures the MCP server with all tool registrations. */
export function createMcpServer(cache: Cache): McpServer {
  const server = new McpServer({
    name: 'food-tracking-ai',
    version: pkg.version,
  });

  const usda = new UsdaClient(cache);
  const off = new OpenFoodFactsClient(cache);

  registerTools(server, { usda, off, cache });

  return server;
}

interface ToolDeps {
  usda: UsdaClient;
  off: OpenFoodFactsClient;
  cache: Cache;
}

function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'search_food',
    {
      description:
        'Search for foods across USDA, Open Food Facts, and saved custom foods',
      inputSchema: {
        query: z.string().describe('Search query for food name or description'),
        source: z
          .enum(['usda', 'openfoodfacts', 'all'])
          .optional()
          .default('all')
          .describe('Data source to search'),
      },
    },
    async ({ query, source }) => {
      try {
        const response = await handleSearchFood(
          { usda: deps.usda, off: deps.off, cache: deps.cache },
          { query, source },
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown error during food search';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message, results: [] }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'get_nutrition',
    {
      description:
        'Get nutritional breakdown for a specific amount of a specific food. Supports weight units (g, kg, oz, lb), volume units (cup, tbsp, tsp, fl_oz, mL, L) when density data is available, and descriptive sizes (piece, medium, large, small, slice) when portion data is available.',
      inputSchema: {
        foodId: z.string().describe('Source-specific food identifier'),
        source: z
          .enum(['usda', 'openfoodfacts', 'custom'])
          .describe('Which data source the food ID comes from'),
        amount: z.number().positive().describe('Amount of food'),
        unit: z
          .enum([
            'g',
            'kg',
            'oz',
            'lb',
            'cup',
            'tbsp',
            'tsp',
            'fl_oz',
            'mL',
            'L',
            'piece',
            'medium',
            'large',
            'small',
            'slice',
          ])
          .describe(
            'Unit of measurement. Weight units always work. Volume units require density data. Descriptive sizes require portion data.',
          ),
      },
    },
    async ({ foodId, source, amount, unit }) => {
      try {
        const result = await handleGetNutrition(
          { usda: deps.usda, off: deps.off },
          { foodId, source, amount, unit },
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown error retrieving nutrition data';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  const unitEnum = z.enum([
    'g',
    'kg',
    'oz',
    'lb',
    'cup',
    'tbsp',
    'tsp',
    'fl_oz',
    'mL',
    'L',
    'piece',
    'medium',
    'large',
    'small',
    'slice',
  ]);

  server.registerTool(
    'calculate_meal',
    {
      description:
        'Calculate total nutrition for a meal by summing nutrients across multiple food items. Each item is looked up individually and totals are computed deterministically.',
      inputSchema: {
        items: z
          .array(
            z.object({
              foodId: z.string().describe('Source-specific food identifier'),
              source: z
                .enum(['usda', 'openfoodfacts', 'custom'])
                .describe('Which data source the food ID comes from'),
              amount: z.number().positive().describe('Amount of food'),
              unit: unitEnum.describe('Unit of measurement'),
            }),
          )
          .min(1)
          .describe('Array of food items in the meal'),
      },
    },
    async ({ items }) => {
      try {
        const result = await handleCalculateMeal(
          { usda: deps.usda, off: deps.off },
          { items },
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown error calculating meal nutrition';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
