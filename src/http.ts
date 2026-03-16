#!/usr/bin/env node

import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

function parseArgs(args: string[]): { port: number; dbPath?: string } {
  const result: { port: number; dbPath?: string } = { port: 3001 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--db-path' && args[i + 1]) {
      result.dbPath = args[i + 1];
      i++;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { port, dbPath } = parseArgs(process.argv.slice(2));

  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
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

      const server = createServer(dbPath);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res);
    } else {
      res.status(400).json({ error: 'Invalid or missing session ID' });
    }
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      res.status(400).json({ error: 'Invalid or missing session ID' });
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', sessions: transports.size });
  });

  app.listen(port, '0.0.0.0', () => {
    console.log(`Cortex MCP HTTP server running on http://0.0.0.0:${port}/mcp`);
    console.log(`Health check: http://localhost:${port}/health`);
  });
}

main().catch((error) => {
  console.error('Cortex MCP HTTP server failed to start:', error);
  process.exit(1);
});
