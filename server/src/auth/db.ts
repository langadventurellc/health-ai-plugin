import type Database from 'better-sqlite3';

/** Creates OAuth auth tables in the given SQLite database. Idempotent. */
export function initializeAuthTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id   TEXT PRIMARY KEY,
      client_data TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      code          TEXT PRIMARY KEY,
      client_id     TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      redirect_uri  TEXT NOT NULL,
      scopes        TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      token      TEXT PRIMARY KEY,
      token_type TEXT NOT NULL,
      client_id  TEXT NOT NULL,
      scopes     TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked    INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client_id
      ON oauth_tokens(client_id);
  `);
}
