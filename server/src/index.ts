import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createMcpServer } from './server.js';
import { Cache } from './cache/cache.js';
import { initializeDatabase, getDatabase, closeDatabase } from './cache/db.js';
import { SqliteOAuthServerProvider } from './auth/provider.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const ISSUER_URL = new URL(
  process.env.ISSUER_URL ?? `http://localhost:${PORT}`,
);
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

// Initialize SQLite database (includes auth tables) before setting up the app
initializeDatabase();

const provider = new SqliteOAuthServerProvider(getDatabase());

const app = express();
app.disable('x-powered-by');
app.use(express.json());

// Mount OAuth endpoints only when auth is enabled
if (AUTH_ENABLED) {
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: ISSUER_URL,
      authorizationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false },
      revocationOptions: { rateLimit: false },
    }),
  );
}

const authMiddleware: express.RequestHandler = AUTH_ENABLED
  ? requireBearerAuth({ verifier: provider })
  : (_req, _res, next) => next();

// Track active transports by session ID for stateful connections
const transports = new Map<string, StreamableHTTPServerTransport>();

/** Health check endpoint. */
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * MCP Streamable HTTP: POST handles initialization and all subsequent messages.
 * A new transport+server pair is created for each session on initialization.
 */
app.post('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
    return;
  }

  if (sessionId && !transports.has(sessionId)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // No session ID: only initialization requests may create a new session
  if (!isInitializeRequest(req.body)) {
    res
      .status(400)
      .json({ error: 'Bad Request: No valid session ID provided' });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
  };

  const server = createMcpServer(cache);
  await server.connect(transport);

  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP initialization:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

/** MCP Streamable HTTP: GET opens an SSE stream for server-initiated messages. */
app.get('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  const transport = transports.get(sessionId)!;
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP SSE request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

/** MCP Streamable HTTP: DELETE terminates a session. */
app.delete('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  const transport = transports.get(sessionId)!;
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP session termination:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Shared cache instance used by all sessions (database initialized above)
const cache = new Cache();

const server = app.listen(PORT, () => {
  console.warn(`Food Tracking AI MCP server listening on port ${PORT}`);
  console.warn(`Authentication: ${AUTH_ENABLED ? 'enabled' : 'disabled'}`);
  console.warn(`Health check: http://localhost:${PORT}/health`);
  console.warn(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

/** Graceful shutdown: close all active transports then exit. */
async function shutdown(): Promise<void> {
  console.warn('\nShutting down...');

  const closePromises = Array.from(transports.values()).map((transport) =>
    transport.close().catch((error: unknown) => {
      console.error('Error closing transport:', error);
    }),
  );
  await Promise.all(closePromises);
  transports.clear();

  closeDatabase();

  server.close(() => {
    console.warn('Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
