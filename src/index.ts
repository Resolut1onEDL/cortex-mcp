#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

function parseArgs(args: string[]): { dbPath?: string } {
  const result: { dbPath?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      result.dbPath = args[i + 1];
      i++;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { dbPath } = parseArgs(process.argv.slice(2));
  const server = createServer(dbPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Cortex MCP failed to start:', error);
  process.exit(1);
});
