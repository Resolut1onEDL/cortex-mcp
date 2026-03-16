#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { injectContext } from './cli/inject.js';

function parseArgs(args: string[]): { commands: string[]; dbPath?: string; project?: string } {
  const result: { commands: string[]; dbPath?: string; project?: string } = { commands: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      result.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--project' && args[i + 1]) {
      result.project = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      result.commands.push(args[i]);
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { commands, dbPath, project } = parseArgs(process.argv.slice(2));
  const command = commands[0];
  const subcommand = commands[1];

  if (command === 'inject') {
    injectContext({ dbPath, project });
    return;
  }

  if (command === 'daemon') {
    const { startDaemon, stopDaemon, daemonStatus } = await import('./daemon/index.js');
    const { installDaemon, uninstallDaemon } = await import('./daemon/install.js');

    switch (subcommand) {
      case 'start':
      case 'run':
        await startDaemon(dbPath);
        break;
      case 'stop':
        stopDaemon();
        break;
      case 'status':
        daemonStatus();
        break;
      case 'install':
        installDaemon();
        break;
      case 'uninstall':
        uninstallDaemon();
        break;
      default:
        console.log('Usage: cortex-mcp daemon <start|stop|status|install|uninstall>');
        console.log('');
        console.log('Commands:');
        console.log('  start      Start daemon in foreground');
        console.log('  stop       Stop running daemon');
        console.log('  status     Check if daemon is running');
        console.log('  install    Install as macOS LaunchAgent (auto-start at login)');
        console.log('  uninstall  Remove LaunchAgent');
    }
    return;
  }

  if (command === 'config') {
    const { setConfig, getConfig } = await import('./daemon/config.js');
    if (subcommand === 'set' && commands[2] && commands[3]) {
      setConfig(commands[2], commands[3]);
    } else if (subcommand === 'get' || !subcommand) {
      getConfig();
    } else {
      console.log('Usage: cortex-mcp config set <key> <value>');
      console.log('       cortex-mcp config get');
      console.log('');
      console.log('Keys:');
      console.log('  telegram   Set Telegram bot (format: BOT_TOKEN/CHAT_ID)');
      console.log('  interval   Check interval in seconds (default: 30)');
    }
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
