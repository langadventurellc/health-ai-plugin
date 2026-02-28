import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { Cache, TTL, isExpired, searchKey } from "../cache.js";
import { initializeDatabase, closeDatabase } from "../db.js";

let db: Database.Database;
let cache: Cache;

beforeEach(() => {
  // Close any prior connection so the singleton can be re-initialized
  closeDatabase();
  // Use in-memory database for fast, isolated tests
  db = initializeDatabase(":memory:");
  cache = new Cache(db);
});

afterEach(() => {
  closeDatabase();
});

describe("isExpired", () => {
  it("returns false when expiration is in the future", () => {
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600;
    expect(isExpired(futureEpoch)).toBe(false);
  });

  it("returns true when expiration is in the past", () => {
    const pastEpoch = Math.floor(Date.now() / 1000) - 1;
    expect(isExpired(pastEpoch)).toBe(true);
  });

  it("returns true when expiration equals current time", () => {
    const nowSec = 1700000000;
    expect(isExpired(nowSec, nowSec)).toBe(true);
  });
});

describe("Nutrition cache", () => {
  it("returns null on cache miss", () => {
    expect(cache.getNutrition("usda", "99999")).toBeNull();
  });

  it("stores and retrieves nutrition data", () => {
    const data = { calories: 200, protein_g: 25 };
    cache.setNutrition("usda", "12345", data);
    expect(cache.getNutrition("usda", "12345")).toEqual(data);
  });

  it("returns null for expired entries via getNutrition", () => {
    // Insert a row that is already expired
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("usda:expired1", "usda", "expired1", '{"cal":100}', now - 100, now - 1);

    expect(cache.getNutrition("usda", "expired1")).toBeNull();
  });

  it("returns expired entries via getNutritionStale", () => {
    const now = Math.floor(Date.now() / 1000);
    const data = { cal: 100 };
    db.prepare(
      `INSERT INTO nutrition_cache (cache_key, source, food_id, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("usda:stale1", "usda", "stale1", JSON.stringify(data), now - 100, now - 1);

    expect(cache.getNutrition("usda", "stale1")).toBeNull();
    expect(cache.getNutritionStale("usda", "stale1")).toEqual(data);
  });

  it("returns null from getNutritionStale when entry does not exist", () => {
    expect(cache.getNutritionStale("usda", "nope")).toBeNull();
  });
});

describe("Source-specific TTL", () => {
  it("applies 30-day TTL for USDA entries", () => {
    cache.setNutrition("usda", "u1", { x: 1 });
    const row = db
      .prepare("SELECT * FROM nutrition_cache WHERE cache_key = ?")
      .get("usda:u1") as { created_at: number; expires_at: number };
    expect(row.expires_at - row.created_at).toBe(TTL.usda);
  });

  it("applies 7-day TTL for Open Food Facts entries", () => {
    cache.setNutrition("openfoodfacts", "off1", { x: 1 });
    const row = db
      .prepare("SELECT * FROM nutrition_cache WHERE cache_key = ?")
      .get("openfoodfacts:off1") as { created_at: number; expires_at: number };
    expect(row.expires_at - row.created_at).toBe(TTL.openfoodfacts);
  });

  it("applies 90-day TTL for custom entries", () => {
    cache.setNutrition("custom", "c1", { x: 1 });
    const row = db
      .prepare("SELECT * FROM nutrition_cache WHERE cache_key = ?")
      .get("custom:c1") as { created_at: number; expires_at: number };
    expect(row.expires_at - row.created_at).toBe(TTL.custom);
  });
});

describe("Search cache", () => {
  it("returns null on cache miss", () => {
    expect(cache.getSearchResults("all", "nonexistent")).toBeNull();
  });

  it("stores and retrieves search results", () => {
    const results = [{ id: "1", name: "Chicken" }];
    cache.setSearchResults("usda", "chicken breast", results);
    expect(cache.getSearchResults("usda", "chicken breast")).toEqual(results);
  });

  it("returns null for expired search entries", () => {
    const now = Math.floor(Date.now() / 1000);
    const key = searchKey("all", "old query");
    db.prepare(
      `INSERT INTO search_cache (cache_key, source, query, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(key, "all", "old query", "[]", now - 100, now - 1);

    expect(cache.getSearchResults("all", "old query")).toBeNull();
  });

  it("returns expired search entries via getSearchResultsStale", () => {
    const now = Math.floor(Date.now() / 1000);
    const data = [{ id: "1" }];
    const key = searchKey("usda", "stale search");
    db.prepare(
      `INSERT INTO search_cache (cache_key, source, query, data, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(key, "usda", "stale search", JSON.stringify(data), now - 100, now - 1);

    expect(cache.getSearchResults("usda", "stale search")).toBeNull();
    expect(cache.getSearchResultsStale("usda", "stale search")).toEqual(data);
  });

  it("applies 24-hour TTL for search results", () => {
    cache.setSearchResults("all", "test query", []);
    const key = searchKey("all", "test query");
    const row = db
      .prepare("SELECT * FROM search_cache WHERE cache_key = ?")
      .get(key) as { created_at: number; expires_at: number };
    expect(row.expires_at - row.created_at).toBe(TTL.search);
  });
});

describe("Search query normalization", () => {
  it("produces the same cache key for different casings and whitespace", () => {
    const variations = [
      "Chicken Breast",
      "chicken breast",
      "  chicken breast  ",
      "CHICKEN   BREAST",
      " Chicken  Breast ",
    ];

    // Store with one variation
    cache.setSearchResults("usda", variations[0], [{ id: "1" }]);

    // All variations should hit the same cache entry
    for (const query of variations) {
      const result = cache.getSearchResults("usda", query);
      expect(result).toEqual([{ id: "1" }]);
    }
  });

  it("produces different cache keys for different queries", () => {
    expect(searchKey("usda", "chicken")).not.toBe(searchKey("usda", "beef"));
  });

  it("produces different cache keys for different sources with the same query", () => {
    expect(searchKey("usda", "chicken")).not.toBe(
      searchKey("openfoodfacts", "chicken")
    );
  });
});

describe("Database initialization", () => {
  it("creates tables on initialization", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('nutrition_cache', 'search_cache')"
      )
      .all() as { name: string }[];

    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(["nutrition_cache", "search_cache"]);
  });

  it("enables WAL journal mode for file-based databases", () => {
    // In-memory databases always report "memory" for journal_mode,
    // so we test with a temp file to verify WAL is set correctly.
    const tmpDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    const tmpPath = join(tmpDir, "test.db");

    try {
      closeDatabase();
      const fileDb = initializeDatabase(tmpPath);
      const result = fileDb.pragma("journal_mode") as { journal_mode: string }[];
      expect(result[0].journal_mode).toBe("wal");
      closeDatabase();
    } finally {
      // Re-initialize in-memory DB for remaining tests
      db = initializeDatabase(":memory:");
      cache = new Cache(db);

      // Clean up temp files
      rmSync(tmpDir, { recursive: true });
    }
  });
});
