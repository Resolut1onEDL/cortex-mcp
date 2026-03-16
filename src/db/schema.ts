export interface MemoryRow {
  id: string;
  content: string;
  type: string;
  tags: string; // JSON array
  project: string;
  metadata: string; // JSON object
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityRow {
  id: string;
  name: string;
  type: string;
  description: string;
  properties: string; // JSON object
  project: string;
  created_at: string;
  updated_at: string;
}

export interface EntityMemoryLinkRow {
  entity_id: string;
  memory_id: string;
  relation: string;
  created_at: string;
}

export interface ProjectContextRow {
  id: string;
  project: string;
  key: string;
  value: string;
  content_type: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledTaskRow {
  id: string;
  name: string;
  description: string;
  schedule: string;
  action: string; // JSON
  project: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  last_result: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface IntentionRow {
  id: string;
  title: string;
  status: string;
  context: string;
  next_action: string;
  priority: string;
  project: string;
  resolve_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntentionTriggerRow {
  id: string;
  intention_id: string;
  condition_type: string;
  condition_value: string;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
}

export interface ProjectStateRow {
  id: string;
  project: string;
  phase: string;
  phase_status: string;
  started_at: string | null;
  target_end: string | null;
  milestones: string; // JSON array
  blockers: string; // JSON array
  current_focus: string;
  anti_patterns: string; // JSON array
  metadata: string; // JSON object
  created_at: string;
  updated_at: string;
}

export interface ProjectStateHistoryRow {
  id: string;
  project: string;
  snapshot: string; // JSON
  change_summary: string;
  session_id: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  project: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  next_session_notes: string | null;
  open_items: string; // JSON array
  intentions_updated: string; // JSON array
  created_at: string;
}

export interface EntityLinkRow {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation: string;
  properties: string; // JSON
  created_at: string;
}

export interface EntityTimelineRow {
  id: string;
  entity_id: string;
  event: string;
  event_date: string;
  metadata: string; // JSON
  created_at: string;
}

export type MemoryType = 'note' | 'feedback' | 'project' | 'reference' | 'decision' | 'snippet';
export type EntityType = 'person' | 'project' | 'organization' | 'tool' | 'concept';
export type ContentType = 'text' | 'json' | 'markdown';
export type IntentionStatus = 'open' | 'waiting' | 'blocked' | 'resolved' | 'abandoned';
export type IntentionPriority = 'high' | 'medium' | 'low';
export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'paused';
export type TriggerConditionType = 'keyword' | 'date' | 'entity_update' | 'time_elapsed' | 'custom';
