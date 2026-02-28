import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Cache } from './cache/cache.js';
import { getDatabase } from './cache/db.js';
import { CustomFoodStore, type SaveFoodInput } from './clients/custom-store.js';
import { UsdaClient } from './clients/usda.js';
import { OpenFoodFactsClient } from './clients/openfoodfacts.js';
import { handleSearchFood } from './tools/search-food.js';
import { handleGetNutrition } from './tools/get-nutrition.js';
import { handleCalculateMeal } from './tools/calculate-meal.js';
import { handleSaveFood } from './tools/save-food.js';

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
  const store = new CustomFoodStore(getDatabase());

  registerTools(server, { usda, off, cache, store });

  return server;
}

interface ToolDeps {
  usda: UsdaClient;
  off: OpenFoodFactsClient;
  cache: Cache;
  store: CustomFoodStore;
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
          {
            usda: deps.usda,
            off: deps.off,
            cache: deps.cache,
            store: deps.store,
          },
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
          { usda: deps.usda, off: deps.off, store: deps.store },
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
          { usda: deps.usda, off: deps.off, store: deps.store },
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

  server.registerTool(
    'save_food',
    {
      description:
        'Save custom food nutrition data (from restaurant lookups, nutrition labels, etc.) for consistent future retrieval. If a food with the same name and brand already exists, it will be updated.',
      inputSchema: {
        name: z.string().min(1).describe('Name of the food item'),
        brand: z.string().optional().describe('Brand or restaurant name'),
        category: z
          .string()
          .optional()
          .describe('Food category (e.g., "fast food", "bakery")'),
        servingSize: z
          .object({
            amount: z.number().positive().describe('Serving size amount'),
            unit: z
              .string()
              .describe('Serving size unit (e.g., "g", "cup", "piece")'),
          })
          .describe('The serving size that the nutrient values correspond to'),
        nutrients: z
          .object({
            calories: z
              .number()
              .finite()
              .nonnegative()
              .describe('Calories (kcal)'),
            protein_g: z
              .number()
              .finite()
              .nonnegative()
              .describe('Protein in grams'),
            total_carbs_g: z
              .number()
              .finite()
              .nonnegative()
              .describe('Total carbohydrates in grams'),
            total_fat_g: z
              .number()
              .finite()
              .nonnegative()
              .describe('Total fat in grams'),
            fiber_g: z
              .number()
              .finite()
              .nonnegative()
              .optional()
              .describe('Dietary fiber in grams'),
            sugar_g: z
              .number()
              .finite()
              .nonnegative()
              .optional()
              .describe('Sugar in grams'),
            saturated_fat_g: z
              .number()
              .finite()
              .nonnegative()
              .optional()
              .describe('Saturated fat in grams'),
            sodium_mg: z
              .number()
              .finite()
              .nonnegative()
              .optional()
              .describe('Sodium in milligrams'),
            cholesterol_mg: z
              .number()
              .finite()
              .nonnegative()
              .optional()
              .describe('Cholesterol in milligrams'),
          })
          .passthrough()
          .describe('Nutrient values for the specified serving size'),
      },
    },
    async ({ name, brand, category, servingSize, nutrients }) => {
      try {
        const result = await handleSaveFood(
          { store: deps.store },
          {
            name,
            brand,
            category,
            servingSize,
            nutrients: nutrients as SaveFoodInput['nutrients'],
          },
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
          error instanceof Error ? error.message : 'Unknown error saving food';
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
