#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { injectContext } from './cli/inject.js';

function parseArgs(args: string[]): { command?: string; dbPath?: string; project?: string } {
  const result: { command?: string; dbPath?: string; project?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      result.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--project' && args[i + 1]) {
      result.project = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--') && !result.command) {
      result.command = args[i];
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { command, dbPath, project } = parseArgs(process.argv.slice(2));

  if (command === 'inject') {
    injectContext({ dbPath, project });
    return;
  }

  const server = createServer(dbPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Cortex MCP failed to start:', error);
  process.exit(1);
});
