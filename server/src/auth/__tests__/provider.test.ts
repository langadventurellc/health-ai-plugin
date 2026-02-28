import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { SqliteOAuthServerProvider } from '../provider.js';
import { initializeAuthTables } from '../db.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

let db: Database.Database;
let provider: SqliteOAuthServerProvider;

const TEST_CLIENT: OAuthClientInformationFull = {
  client_id: 'test-client-id',
  client_id_issued_at: Math.floor(Date.now() / 1000),
  redirect_uris: ['http://localhost:3000/callback'],
};

const OTHER_CLIENT: OAuthClientInformationFull = {
  client_id: 'other-client-id',
  client_id_issued_at: Math.floor(Date.now() / 1000),
  redirect_uris: ['http://localhost:3000/callback'],
};

/** Insert an auth code directly into the database for testing. */
function insertAuthCode(
  overrides: Partial<{
    code: string;
    clientId: string;
    codeChallenge: string;
    redirectUri: string;
    scopes: string[];
    expiresAt: number;
  }> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const code = overrides.code ?? 'test-auth-code';
  db.prepare(
    `INSERT INTO oauth_authorization_codes
     (code, client_id, code_challenge, redirect_uri, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    overrides.clientId ?? TEST_CLIENT.client_id,
    overrides.codeChallenge ?? 'test-challenge',
    overrides.redirectUri ?? 'http://localhost:3000/callback',
    JSON.stringify(overrides.scopes ?? ['mcp:tools']),
    overrides.expiresAt ?? now + 600,
    now,
  );
  return code;
}

/** Insert a token directly into the database for testing. */
function insertToken(
  overrides: Partial<{
    token: string;
    tokenType: string;
    clientId: string;
    scopes: string[];
    expiresAt: number;
    revoked: boolean;
  }> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const token = overrides.token ?? 'test-token';
  db.prepare(
    `INSERT INTO oauth_tokens
     (token, token_type, client_id, scopes, expires_at, created_at, revoked)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    overrides.tokenType ?? 'access',
    overrides.clientId ?? TEST_CLIENT.client_id,
    JSON.stringify(overrides.scopes ?? ['mcp:tools']),
    overrides.expiresAt ?? now + 3600,
    now,
    overrides.revoked ? 1 : 0,
  );
  return token;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  initializeAuthTables(db);
  provider = new SqliteOAuthServerProvider(db);
});

afterEach(() => {
  db.close();
});

describe('ClientsStore', () => {
  it('returns undefined for unregistered client', async () => {
    const result = await provider.clientsStore.getClient('nonexistent');
    expect(result).toBeUndefined();
  });

  it('registers and retrieves a client', async () => {
    // The SDK pre-populates client_id and client_id_issued_at on the
    // object before calling registerClient. We replicate that by
    // spreading those fields into the metadata object.
    const { client_id, client_id_issued_at, ...metadata } = TEST_CLIENT;
    const clientInput = Object.assign(metadata, {
      client_id,
      client_id_issued_at,
    });
    provider.clientsStore.registerClient!(clientInput);

    const result = await provider.clientsStore.getClient(TEST_CLIENT.client_id);
    expect(result).toBeDefined();
    expect(result!.client_id).toBe(TEST_CLIENT.client_id);
    expect(result!.redirect_uris).toEqual(TEST_CLIENT.redirect_uris);
  });
});

describe('verifyAccessToken', () => {
  it('returns AuthInfo for a valid access token', async () => {
    const token = insertToken({ scopes: ['mcp:tools'] });

    const authInfo = await provider.verifyAccessToken(token);

    expect(authInfo.token).toBe(token);
    expect(authInfo.clientId).toBe(TEST_CLIENT.client_id);
    expect(authInfo.scopes).toEqual(['mcp:tools']);
    expect(authInfo.expiresAt).toBeDefined();
  });

  it('rejects a nonexistent token', async () => {
    await expect(provider.verifyAccessToken('nonexistent')).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('rejects an expired access token', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    insertToken({ token: 'expired-token', expiresAt: pastTime });

    await expect(provider.verifyAccessToken('expired-token')).rejects.toThrow(
      'expired',
    );
  });

  it('rejects a revoked access token', async () => {
    insertToken({ token: 'revoked-token', revoked: true });

    await expect(provider.verifyAccessToken('revoked-token')).rejects.toThrow(
      'revoked',
    );
  });

  it('rejects a refresh token used as an access token', async () => {
    insertToken({ token: 'refresh-only', tokenType: 'refresh' });

    await expect(provider.verifyAccessToken('refresh-only')).rejects.toThrow(
      InvalidTokenError,
    );
  });
});

describe('Authorization code flow with PKCE', () => {
  it('exchanges a valid auth code for tokens', async () => {
    const code = insertAuthCode({
      codeChallenge: 'test-challenge-value',
      scopes: ['mcp:tools'],
    });

    const challenge = await provider.challengeForAuthorizationCode(
      TEST_CLIENT,
      code,
    );
    expect(challenge).toBe('test-challenge-value');

    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);

    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.token_type).toBe('bearer');
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.scope).toBe('mcp:tools');

    // The issued access token should be verifiable
    const authInfo = await provider.verifyAccessToken(tokens.access_token);
    expect(authInfo.clientId).toBe(TEST_CLIENT.client_id);
    expect(authInfo.scopes).toEqual(['mcp:tools']);
  });

  it('auth code is single-use (cannot be exchanged twice)', async () => {
    const code = insertAuthCode();

    await provider.exchangeAuthorizationCode(TEST_CLIENT, code);

    await expect(
      provider.exchangeAuthorizationCode(TEST_CLIENT, code),
    ).rejects.toThrow('not found');
  });

  it('rejects exchange if auth code belongs to a different client', async () => {
    const code = insertAuthCode({ clientId: TEST_CLIENT.client_id });

    await expect(
      provider.exchangeAuthorizationCode(OTHER_CLIENT, code),
    ).rejects.toThrow('not issued to this client');
  });

  it('rejects exchange of an expired auth code', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    const code = insertAuthCode({ code: 'expired-code', expiresAt: pastTime });

    await expect(
      provider.exchangeAuthorizationCode(TEST_CLIENT, code),
    ).rejects.toThrow('expired');
  });

  it('rejects challengeForAuthorizationCode for expired code', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    insertAuthCode({ code: 'expired-challenge', expiresAt: pastTime });

    await expect(
      provider.challengeForAuthorizationCode(TEST_CLIENT, 'expired-challenge'),
    ).rejects.toThrow('expired');
  });

  it('rejects challengeForAuthorizationCode for nonexistent code', async () => {
    await expect(
      provider.challengeForAuthorizationCode(TEST_CLIENT, 'no-such-code'),
    ).rejects.toThrow('not found');
  });
});

describe('Refresh token flow', () => {
  it('exchanges a valid refresh token for new tokens', async () => {
    // Set up via auth code exchange to get a refresh token
    const code = insertAuthCode({ scopes: ['mcp:tools'] });
    const original = await provider.exchangeAuthorizationCode(
      TEST_CLIENT,
      code,
    );

    const refreshed = await provider.exchangeRefreshToken(
      TEST_CLIENT,
      original.refresh_token!,
    );

    expect(refreshed.access_token).toBeDefined();
    expect(refreshed.refresh_token).toBeDefined();
    expect(refreshed.token_type).toBe('bearer');
    expect(refreshed.expires_in).toBe(3600);

    // New access token should be different from the original
    expect(refreshed.access_token).not.toBe(original.access_token);

    // New access token should be valid
    const authInfo = await provider.verifyAccessToken(refreshed.access_token);
    expect(authInfo.clientId).toBe(TEST_CLIENT.client_id);
  });

  it('rotates the refresh token (old one is revoked)', async () => {
    const code = insertAuthCode();
    const original = await provider.exchangeAuthorizationCode(
      TEST_CLIENT,
      code,
    );

    const refreshed = await provider.exchangeRefreshToken(
      TEST_CLIENT,
      original.refresh_token!,
    );

    // Old refresh token should be revoked
    await expect(
      provider.exchangeRefreshToken(TEST_CLIENT, original.refresh_token!),
    ).rejects.toThrow('revoked');

    // New refresh token should work
    const reRefreshed = await provider.exchangeRefreshToken(
      TEST_CLIENT,
      refreshed.refresh_token!,
    );
    expect(reRefreshed.access_token).toBeDefined();
  });

  it('rejects an expired refresh token', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 1;
    insertToken({
      token: 'expired-refresh',
      tokenType: 'refresh',
      expiresAt: pastTime,
    });

    await expect(
      provider.exchangeRefreshToken(TEST_CLIENT, 'expired-refresh'),
    ).rejects.toThrow('expired');
  });

  it('rejects a revoked refresh token', async () => {
    insertToken({
      token: 'revoked-refresh',
      tokenType: 'refresh',
      revoked: true,
    });

    await expect(
      provider.exchangeRefreshToken(TEST_CLIENT, 'revoked-refresh'),
    ).rejects.toThrow('revoked');
  });

  it('rejects refresh token belonging to a different client', async () => {
    insertToken({
      token: 'other-refresh',
      tokenType: 'refresh',
      clientId: OTHER_CLIENT.client_id,
    });

    await expect(
      provider.exchangeRefreshToken(TEST_CLIENT, 'other-refresh'),
    ).rejects.toThrow('not issued to this client');
  });
});

describe('revokeToken', () => {
  it('revokes an existing token', async () => {
    const token = insertToken({ token: 'to-revoke' });

    await provider.revokeToken(TEST_CLIENT, { token });

    await expect(provider.verifyAccessToken(token)).rejects.toThrow('revoked');
  });

  it('does nothing when revoking a nonexistent token', async () => {
    // Should not throw per spec
    await expect(
      provider.revokeToken(TEST_CLIENT, { token: 'nonexistent' }),
    ).resolves.toBeUndefined();
  });
});

describe('authorize', () => {
  it('redirects with code and state parameters', async () => {
    let redirectedUrl = '';
    const mockRes = {
      redirect: (url: string) => {
        redirectedUrl = url;
      },
    } as unknown as import('express').Response;

    await provider.authorize(
      TEST_CLIENT,
      {
        redirectUri: 'http://localhost:3000/callback',
        codeChallenge: 'test-pkce-challenge',
        state: 'test-state-123',
        scopes: ['mcp:tools'],
      },
      mockRes,
    );

    const url = new URL(redirectedUrl);
    expect(url.origin + url.pathname).toBe('http://localhost:3000/callback');
    expect(url.searchParams.get('code')).toBeDefined();
    expect(url.searchParams.get('state')).toBe('test-state-123');

    // The generated code should be exchangeable
    const code = url.searchParams.get('code')!;
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);
    expect(tokens.access_token).toBeDefined();
  });

  it('redirects without state when state is not provided', async () => {
    let redirectedUrl = '';
    const mockRes = {
      redirect: (url: string) => {
        redirectedUrl = url;
      },
    } as unknown as import('express').Response;

    await provider.authorize(
      TEST_CLIENT,
      {
        redirectUri: 'http://localhost:3000/callback',
        codeChallenge: 'challenge',
      },
      mockRes,
    );

    const url = new URL(redirectedUrl);
    expect(url.searchParams.has('state')).toBe(false);
    expect(url.searchParams.has('code')).toBe(true);
  });
});
