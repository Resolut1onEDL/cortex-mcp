export interface MemoryRow {
  id: string;
  content: string;
  type: string;
  tags: string; // JSON array
  project: string;
  metadata: string; // JSON object
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

export type MemoryType = 'note' | 'feedback' | 'project' | 'reference' | 'decision' | 'snippet';
export type EntityType = 'person' | 'project' | 'organization' | 'tool' | 'concept';
export type ContentType = 'text' | 'json' | 'markdown';
