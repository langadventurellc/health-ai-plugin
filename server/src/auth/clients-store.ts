import type Database from 'better-sqlite3';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

type RegisterClientInput = Omit<
  OAuthClientInformationFull,
  'client_id' | 'client_id_issued_at'
>;

/** SQLite-backed store for dynamically registered OAuth clients. */
export class SqliteClientsStore implements OAuthRegisteredClientsStore {
  constructor(private readonly db: Database.Database) {}

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = this.db
      .prepare('SELECT client_data FROM oauth_clients WHERE client_id = ?')
      .get(clientId) as { client_data: string } | undefined;

    if (!row) return undefined;
    return JSON.parse(row.client_data) as OAuthClientInformationFull;
  }

  registerClient(client: RegisterClientInput): OAuthClientInformationFull {
    // The SDK's clientRegistrationHandler pre-populates client_id and
    // client_id_issued_at on the object before calling this method, so we
    // cast to access those runtime-present fields.
    const fullClient = client as OAuthClientInformationFull;
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        'INSERT OR REPLACE INTO oauth_clients (client_id, client_data, created_at) VALUES (?, ?, ?)',
      )
      .run(fullClient.client_id, JSON.stringify(fullClient), now);
    return fullClient;
  }
}
