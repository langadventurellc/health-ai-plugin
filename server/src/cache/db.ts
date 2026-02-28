import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_DB_PATH = './data/food-cache.db';

let db: Database.Database | null = null;

/** Returns the singleton database instance, initializing it on first call. */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.',
    );
  }
  return db;
}

/** Creates the SQLite database, enables WAL mode, and creates tables if they don't exist. */
export function initializeDatabase(
  dbPath: string = process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH,
): Database.Database {
  if (db) {
    return db;
  }

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_cache (
      cache_key  TEXT PRIMARY KEY,
      source     TEXT NOT NULL,
      food_id    TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      cache_key  TEXT PRIMARY KEY,
      source     TEXT NOT NULL,
      query      TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_foods (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      brand      TEXT,
      category   TEXT,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_custom_foods_name ON custom_foods(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_custom_foods_brand ON custom_foods(brand COLLATE NOCASE);
  `);

  return db;
}

/** Closes the database connection and resets the singleton. For use in shutdown and tests. */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
