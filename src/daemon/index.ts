#!/usr/bin/env node

import { getDb } from '../db/connection.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { IntentionService } from '../services/intention.service.js';
import { notify, loadConfig } from './notifier.js';
import { writeFileSync, readFileSync, existsSync, unlinkSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PID_FILE = join(homedir(), '.cortex-mcp', 'daemon.pid');
const LOG_FILE = join(homedir(), '.cortex-mcp', 'daemon.log');
const DEFAULT_INTERVAL = 30_000; // 30 seconds

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Fallback
  }
}

function writePid(): void {
  writeFileSync(PID_FILE, String(process.pid));
}

function removePid(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Already gone
  }
}

export function getDaemonPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    // Check if process is alive
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process dead, clean up stale PID
    removePid();
    return null;
  }
}

async function checkDueTasks(scheduler: SchedulerService): Promise<void> {
  const dueTasks = scheduler.getDueTasks();

  for (const task of dueTasks) {
    const action = JSON.parse(task.action) as { type: string; params?: Record<string, unknown> };

    if (action.type === 'reminder') {
      const message = (action.params?.message as string) || task.name;
      await notify({
        title: 'Cortex Reminder',
        message,
        subtitle: task.name !== message ? task.name : undefined,
      });
    } else {
      // For non-reminder tasks, just notify that they're due
      await notify({
        title: 'Cortex Task Due',
        message: `Task "${task.name}" is due`,
        subtitle: action.type,
      });
    }

    // Mark as run
    scheduler.markRun(task.id, { notified_at: new Date().toISOString() });
    log(`Task executed: ${task.name} (${task.id})`);
  }
}

async function checkIntentionTriggers(intentions: IntentionService): Promise<void> {
  const triggered = intentions.checkTriggers();

  for (const item of triggered) {
    const reasons = item.fired_triggers.map(t => t.reason).join(', ');
    await notify({
      title: 'Cortex Intention',
      message: item.intention.title,
      subtitle: reasons,
    });
    log(`Intention triggered: ${item.intention.title} (${item.intention.id})`);
  }
}

async function tick(scheduler: SchedulerService, intentions: IntentionService): Promise<void> {
  try {
    await checkDueTasks(scheduler);
    await checkIntentionTriggers(intentions);
  } catch (error) {
    log(`Tick error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function startDaemon(dbPath?: string): Promise<void> {
  const existingPid = getDaemonPid();
  if (existingPid) {
    console.log(`Daemon already running (PID: ${existingPid})`);
    process.exit(0);
  }

  const db = getDb(dbPath);
  const scheduler = new SchedulerService(db);
  const intentions = new IntentionService(db);
  const config = loadConfig();
  const interval = config.check_interval_ms || DEFAULT_INTERVAL;

  writePid();
  log(`Daemon started (PID: ${process.pid}, interval: ${interval}ms)`);
  console.log(`Cortex daemon started (PID: ${process.pid})`);
  console.log(`Checking every ${interval / 1000}s`);
  console.log(`Log: ${LOG_FILE}`);

  // Graceful shutdown
  const shutdown = () => {
    log('Daemon stopping');
    removePid();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Initial check
  await tick(scheduler, intentions);

  // Main loop
  setInterval(() => tick(scheduler, intentions), interval);
}

export function stopDaemon(): void {
  const pid = getDaemonPid();
  if (!pid) {
    console.log('Daemon is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    removePid();
    console.log(`Daemon stopped (PID: ${pid})`);
  } catch {
    removePid();
    console.log('Daemon process not found, cleaned up PID file');
  }
}

export function daemonStatus(): void {
  const pid = getDaemonPid();
  if (pid) {
    console.log(`Daemon running (PID: ${pid})`);
  } else {
    console.log('Daemon is not running');
  }
}
