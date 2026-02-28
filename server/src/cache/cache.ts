import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { FoodSource } from "../types.js";
import { getDatabase } from "./db.js";

/** TTL durations in seconds, keyed by data source. */
export const TTL = {
  usda: 30 * 24 * 60 * 60, // 30 days
  openfoodfacts: 7 * 24 * 60 * 60, // 7 days
  custom: 90 * 24 * 60 * 60, // 90 days
  search: 24 * 60 * 60, // 24 hours
} as const;

type SearchSource = FoodSource | "all";

interface CacheRow {
  cache_key: string;
  source: string;
  data: string;
  created_at: number;
  expires_at: number;
}

/** Builds the cache key for a nutrition entry. */
function nutritionKey(source: FoodSource, foodId: string): string {
  return `${source}:${foodId}`;
}

/** Normalizes a search query: lowercase, trimmed, collapsed whitespace. */
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Hashes a normalized query string for use as part of a cache key. */
function hashQuery(normalizedQuery: string): string {
  return createHash("sha256").update(normalizedQuery).digest("hex");
}

/** Builds the cache key for a search entry. */
export function searchKey(source: SearchSource, query: string): string {
  const normalized = normalizeQuery(query);
  return `${source}:${hashQuery(normalized)}`;
}

/** Returns true if the given Unix-seconds expiration timestamp is in the past. */
export function isExpired(expiresAt: number, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds >= expiresAt;
}

/** SQLite-backed cache for nutrition data and search results with TTL revalidation. */
export class Cache {
  private db: Database.Database;
  private stmts: {
    getNutrition: Database.Statement;
    setNutrition: Database.Statement;
    getSearch: Database.Statement;
    setSearch: Database.Statement;
  };

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.stmts = {
      getNutrition: this.db.prepare(
        "SELECT * FROM nutrition_cache WHERE cache_key = ?"
      ),
      setNutrition: this.db.prepare(
        `INSERT OR REPLACE INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
         VALUES (@cache_key, @source, @food_id, @data, @created_at, @expires_at)`
      ),
      getSearch: this.db.prepare(
        "SELECT * FROM search_cache WHERE cache_key = ?"
      ),
      setSearch: this.db.prepare(
        `INSERT OR REPLACE INTO search_cache (cache_key, source, query, data, created_at, expires_at)
         VALUES (@cache_key, @source, @query, @data, @created_at, @expires_at)`
      ),
    };
  }

  /** Returns cached nutrition data if present and not expired, null otherwise. */
  getNutrition(source: FoodSource, foodId: string): unknown | null {
    const row = this.stmts.getNutrition.get(
      nutritionKey(source, foodId)
    ) as CacheRow | undefined;
    if (!row || isExpired(row.expires_at)) {
      return null;
    }
    return JSON.parse(row.data);
  }

  /** Returns cached nutrition data even if expired. Null only if not present. */
  getNutritionStale(source: FoodSource, foodId: string): unknown | null {
    const row = this.stmts.getNutrition.get(
      nutritionKey(source, foodId)
    ) as CacheRow | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data);
  }

  /** Stores nutrition data with TTL based on the data source. */
  setNutrition(source: FoodSource, foodId: string, data: unknown): void {
    const now = Math.floor(Date.now() / 1000);
    this.stmts.setNutrition.run({
      cache_key: nutritionKey(source, foodId),
      source,
      food_id: foodId,
      data: JSON.stringify(data),
      created_at: now,
      expires_at: now + TTL[source],
    });
  }

  /** Returns cached search results if present and not expired, null otherwise. */
  getSearchResults(source: SearchSource, query: string): unknown | null {
    const key = searchKey(source, query);
    const row = this.stmts.getSearch.get(key) as CacheRow | undefined;
    if (!row || isExpired(row.expires_at)) {
      return null;
    }
    return JSON.parse(row.data);
  }

  /** Returns cached search results even if expired. Null only if not present. */
  getSearchResultsStale(source: SearchSource, query: string): unknown | null {
    const key = searchKey(source, query);
    const row = this.stmts.getSearch.get(key) as CacheRow | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data);
  }

  /** Stores search results with 24-hour TTL. */
  setSearchResults(source: SearchSource, query: string, data: unknown): void {
    const normalized = normalizeQuery(query);
    const now = Math.floor(Date.now() / 1000);
    this.stmts.setSearch.run({
      cache_key: searchKey(source, query),
      source,
      query: normalized,
      data: JSON.stringify(data),
      created_at: now,
      expires_at: now + TTL.search,
    });
  }
}
