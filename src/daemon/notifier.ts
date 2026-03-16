import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface NotifyOptions {
  title: string;
  message: string;
  subtitle?: string;
}

const CONFIG_PATH = join(homedir(), '.cortex-mcp', 'config.json');

interface DaemonConfig {
  telegram?: {
    bot_token: string;
    chat_id: string;
  };
  voice?: boolean;
  check_interval_ms?: number;
}

export function loadConfig(): DaemonConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export async function notify(options: NotifyOptions): Promise<void> {
  const config = loadConfig();

  // macOS notification banner + sound
  sendMacOSNotification(options);

  // Voice announcement (works even with Focus Mode on)
  if (config.voice !== false) {
    sendVoiceNotification(options);
  }

  // Optionally send Telegram
  if (config.telegram?.bot_token && config.telegram?.chat_id) {
    await sendTelegramNotification(options, config.telegram.bot_token, config.telegram.chat_id);
  }
}

function sendMacOSNotification(options: NotifyOptions): void {
  const title = options.title.replace(/"/g, '\\"');
  const message = options.message.replace(/"/g, '\\"');
  const subtitle = options.subtitle ? `subtitle "${options.subtitle.replace(/"/g, '\\"')}"` : '';

  const script = `display notification "${message}" with title "${title}" ${subtitle} sound name "Glass"`;

  try {
    execSync('osascript', { input: script, timeout: 5000 });
  } catch {
    // Notification failed silently — don't crash daemon
  }
}

function sendVoiceNotification(options: NotifyOptions): void {
  try {
    const text = `${options.title}. ${options.message}`;
    execSync('osascript', { input: `say "${text.replace(/"/g, '\\"')}"`, timeout: 10000 });
  } catch {
    // Voice failed silently
  }
}

async function sendTelegramNotification(
  options: NotifyOptions,
  botToken: string,
  chatId: string,
): Promise<void> {
  const text = options.subtitle
    ? `*${options.title}*\n_${options.subtitle}_\n\n${options.message}`
    : `*${options.title}*\n\n${options.message}`;

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch {
    // Telegram failed silently — don't crash daemon
  }
}
