import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.cortex-mcp', 'config.json');

interface DaemonConfig {
  telegram?: {
    bot_token: string;
    chat_id: string;
  };
  check_interval_ms?: number;
}

function load(): DaemonConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function save(config: DaemonConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function setConfig(key: string, value: string): void {
  const config = load();

  if (key === 'telegram') {
    // Format: "BOT_TOKEN:CHAT_ID" or "BOT_TOKEN/CHAT_ID"
    const separator = value.includes('/') ? '/' : ':';
    const parts = value.split(separator);

    if (parts.length < 2) {
      console.error('Telegram format: BOT_TOKEN:CHAT_ID');
      console.error('Example: cortex-mcp config set telegram "7123456:AAHxxx/123456789"');
      process.exit(1);
    }

    // The bot token itself contains ":", so we need smart splitting
    // Format is: <bot_token>/<chat_id> or <number>:<hash>/<chat_id>
    // Bot token looks like: 7123456789:AAHxxxxxxxxx
    // Chat ID looks like: 123456789 or -100123456789
    // Best separator: last "/" or last ":"
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash > 0) {
      config.telegram = {
        bot_token: value.substring(0, lastSlash),
        chat_id: value.substring(lastSlash + 1),
      };
    } else {
      // Try last ":"
      const lastColon = value.lastIndexOf(':');
      config.telegram = {
        bot_token: value.substring(0, lastColon),
        chat_id: value.substring(lastColon + 1),
      };
    }

    save(config);
    console.log('Telegram configured:');
    console.log(`  Bot token: ${config.telegram.bot_token.substring(0, 10)}...`);
    console.log(`  Chat ID: ${config.telegram.chat_id}`);
    return;
  }

  if (key === 'interval') {
    const ms = parseInt(value, 10) * 1000;
    config.check_interval_ms = ms;
    save(config);
    console.log(`Check interval set to ${value}s`);
    return;
  }

  console.error(`Unknown config key: ${key}`);
  console.error('Available keys: telegram, interval');
}

export function getConfig(): void {
  const config = load();
  if (Object.keys(config).length === 0) {
    console.log('No configuration set');
    return;
  }
  console.log(JSON.stringify(config, null, 2));
}
