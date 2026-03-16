import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const PLIST_NAME = 'com.cortex-mcp.daemon';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);
const LOG_DIR = join(homedir(), '.cortex-mcp');

function getNodePath(): string {
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim();
  } catch {
    return '/usr/local/bin/node';
  }
}

function getDaemonScript(): string {
  // Try to find the installed bin path
  try {
    const binPath = execSync('which cortex-mcp', { encoding: 'utf-8' }).trim();
    return binPath;
  } catch {
    // Fallback to relative path from package
    return join(__dirname, '..', '..', 'dist', 'index.js');
  }
}

export function installDaemon(): void {
  const nodePath = getNodePath();
  const script = getDaemonScript();

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${script}</string>
    <string>daemon</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/daemon.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/daemon.stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>`;

  writeFileSync(PLIST_PATH, plist);
  console.log(`LaunchAgent installed: ${PLIST_PATH}`);

  try {
    execSync(`launchctl load ${PLIST_PATH}`, { stdio: 'inherit' });
    console.log('Daemon loaded and will start at login');
  } catch {
    console.log('Run manually: launchctl load ' + PLIST_PATH);
  }
}

export function uninstallDaemon(): void {
  if (!existsSync(PLIST_PATH)) {
    console.log('LaunchAgent not installed');
    return;
  }

  try {
    execSync(`launchctl unload ${PLIST_PATH}`, { stdio: 'inherit' });
  } catch {
    // May not be loaded
  }

  unlinkSync(PLIST_PATH);
  console.log('LaunchAgent uninstalled');
}
