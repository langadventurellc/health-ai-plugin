import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type Database from 'better-sqlite3';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { SqliteClientsStore } from './clients-store.js';

/** Expiry durations in seconds. */
const EXPIRY = {
  authCode: 10 * 60, // 10 minutes
  accessToken: 60 * 60, // 1 hour
  refreshToken: 30 * 24 * 60 * 60, // 30 days
} as const;

interface AuthCodeRow {
  code: string;
  client_id: string;
  code_challenge: string;
  redirect_uri: string;
  scopes: string;
  expires_at: number;
}

interface TokenRow {
  token: string;
  token_type: string;
  client_id: string;
  scopes: string;
  expires_at: number;
  revoked: number;
}

/**
 * SQLite-backed OAuthServerProvider. Single-user v1: auto-approves all authorization requests.
 *
 * Methods are async to satisfy the OAuthServerProvider interface but use synchronous
 * better-sqlite3 operations internally, so they contain no await expressions.
 */
/* eslint-disable @typescript-eslint/require-await */
export class SqliteOAuthServerProvider implements OAuthServerProvider {
  private readonly _clientsStore: SqliteClientsStore;

  constructor(private readonly db: Database.Database) {
    this._clientsStore = new SqliteClientsStore(db);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(
    _client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const code = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    this.db
      .prepare(
        `INSERT INTO oauth_authorization_codes
         (code, client_id, code_challenge, redirect_uri, scopes, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        _client.client_id,
        params.codeChallenge,
        params.redirectUri,
        JSON.stringify(params.scopes ?? []),
        now + EXPIRY.authCode,
        now,
      );

    const targetUrl = new URL(params.redirectUri);
    targetUrl.searchParams.set('code', code);
    if (params.state !== undefined) {
      targetUrl.searchParams.set('state', params.state);
    }

    res.redirect(targetUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const row = this.db
      .prepare(
        'SELECT code_challenge, expires_at FROM oauth_authorization_codes WHERE code = ?',
      )
      .get(authorizationCode) as
      | Pick<AuthCodeRow, 'code_challenge' | 'expires_at'>
      | undefined;

    if (!row) {
      throw new InvalidGrantError('Authorization code not found');
    }

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at <= now) {
      this.db
        .prepare('DELETE FROM oauth_authorization_codes WHERE code = ?')
        .run(authorizationCode);
      throw new InvalidGrantError('Authorization code has expired');
    }

    return row.code_challenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = this.db
      .prepare('SELECT * FROM oauth_authorization_codes WHERE code = ?')
      .get(authorizationCode) as AuthCodeRow | undefined;

    if (!row) {
      throw new InvalidGrantError('Authorization code not found');
    }

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at <= now) {
      this.db
        .prepare('DELETE FROM oauth_authorization_codes WHERE code = ?')
        .run(authorizationCode);
      throw new InvalidGrantError('Authorization code has expired');
    }

    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError(
        'Authorization code was not issued to this client',
      );
    }

    const scopes: string[] = JSON.parse(row.scopes) as string[];
    const accessToken = randomUUID();
    const refreshToken = randomUUID();

    const issueTokens = this.db.transaction(() => {
      // Delete the used authorization code (single-use)
      this.db
        .prepare('DELETE FROM oauth_authorization_codes WHERE code = ?')
        .run(authorizationCode);

      const insertToken = this.db.prepare(
        `INSERT INTO oauth_tokens
         (token, token_type, client_id, scopes, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      insertToken.run(
        accessToken,
        'access',
        client.client_id,
        row.scopes,
        now + EXPIRY.accessToken,
        now,
      );

      insertToken.run(
        refreshToken,
        'refresh',
        client.client_id,
        row.scopes,
        now + EXPIRY.refreshToken,
        now,
      );
    });

    issueTokens();

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: EXPIRY.accessToken,
      scope: scopes.join(' '),
      refresh_token: refreshToken,
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const row = this.db
      .prepare(
        "SELECT * FROM oauth_tokens WHERE token = ? AND token_type = 'refresh'",
      )
      .get(refreshToken) as TokenRow | undefined;

    if (!row) {
      throw new InvalidGrantError('Refresh token not found');
    }

    if (row.revoked) {
      throw new InvalidGrantError('Refresh token has been revoked');
    }

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at <= now) {
      throw new InvalidGrantError('Refresh token has expired');
    }

    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError(
        'Refresh token was not issued to this client',
      );
    }

    const tokenScopes: string[] =
      scopes ?? (JSON.parse(row.scopes) as string[]);
    const scopesJson = JSON.stringify(tokenScopes);

    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();

    const rotateTokens = this.db.transaction(() => {
      const insertToken = this.db.prepare(
        `INSERT INTO oauth_tokens
         (token, token_type, client_id, scopes, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      // Generate new access token
      insertToken.run(
        newAccessToken,
        'access',
        client.client_id,
        scopesJson,
        now + EXPIRY.accessToken,
        now,
      );

      // Rotate refresh token: revoke old, issue new
      this.db
        .prepare('UPDATE oauth_tokens SET revoked = 1 WHERE token = ?')
        .run(refreshToken);

      insertToken.run(
        newRefreshToken,
        'refresh',
        client.client_id,
        scopesJson,
        now + EXPIRY.refreshToken,
        now,
      );
    });

    rotateTokens();

    return {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: EXPIRY.accessToken,
      scope: tokenScopes.join(' '),
      refresh_token: newRefreshToken,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = this.db
      .prepare(
        "SELECT * FROM oauth_tokens WHERE token = ? AND token_type = 'access'",
      )
      .get(token) as TokenRow | undefined;

    if (!row) {
      throw new InvalidTokenError('Access token not found');
    }

    if (row.revoked) {
      throw new InvalidTokenError('Access token has been revoked');
    }

    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at <= now) {
      throw new InvalidTokenError('Access token has expired');
    }

    return {
      token,
      clientId: row.client_id,
      scopes: JSON.parse(row.scopes) as string[],
      expiresAt: row.expires_at,
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    // Per spec: if token doesn't exist, do nothing
    this.db
      .prepare('UPDATE oauth_tokens SET revoked = 1 WHERE token = ?')
      .run(request.token);
  }
}
