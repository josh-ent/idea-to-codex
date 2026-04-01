import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { persistenceDatabasePath } from "./state-paths.js";

interface PersistenceOptions {
  stateDir?: string;
}

let persistenceDb: Database.Database | null = null;
let persistencePath = "";

export function initializePersistence(options: PersistenceOptions = {}): void {
  const dbPath = persistenceDatabasePath(options.stateDir);

  if (persistenceDb && persistencePath === dbPath) {
    return;
  }

  closePersistence();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  persistenceDb = new Database(dbPath);
  persistenceDb.pragma("journal_mode = WAL");
  persistenceDb.exec(buildSchemaSql());
  persistencePath = dbPath;
}

export function getPersistenceDatabase(): Database.Database {
  if (!persistenceDb) {
    initializePersistence();
  }

  return persistenceDb!;
}

export function getPersistenceDatabasePath(): string {
  if (!persistencePath) {
    initializePersistence();
  }

  return persistencePath;
}

export function closePersistence(): void {
  if (!persistenceDb) {
    return;
  }

  persistenceDb.close();
  persistenceDb = null;
  persistencePath = "";
}

function buildSchemaSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS log_events (",
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "  occurred_at TEXT NOT NULL,",
    "  level TEXT NOT NULL,",
    "  scope TEXT NOT NULL,",
    "  message TEXT NOT NULL,",
    "  request_id TEXT,",
    "  request_method TEXT,",
    "  request_path TEXT,",
    "  project_root TEXT,",
    "  payload_json TEXT NOT NULL,",
    "  payload_text TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS llm_usage_records (",
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "  occurred_at TEXT NOT NULL,",
    "  provider TEXT NOT NULL,",
    "  lane TEXT NOT NULL,",
    "  operation TEXT NOT NULL,",
    "  configured_model TEXT NOT NULL,",
    "  resolved_model TEXT,",
    "  project_root TEXT NOT NULL,",
    "  input_tokens INTEGER NOT NULL,",
    "  output_tokens INTEGER NOT NULL,",
    "  total_tokens INTEGER NOT NULL,",
    "  request_log_event_id INTEGER,",
    "  response_log_event_id INTEGER,",
    "  metadata_json TEXT NOT NULL",
    ");",
    "CREATE VIRTUAL TABLE IF NOT EXISTS log_events_fts USING fts5(",
    "  scope,",
    "  message,",
    "  request_id,",
    "  request_path,",
    "  project_root,",
    "  payload_text",
    ");",
    "CREATE TABLE IF NOT EXISTS intake_sessions (",
    "  id TEXT PRIMARY KEY,",
    "  scope_key TEXT NOT NULL,",
    "  project_root TEXT NOT NULL,",
    "  branch_name TEXT,",
    "  worktree_id TEXT,",
    "  scope_fallback_mode TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  current_brief_version_id TEXT,",
    "  session_revision INTEGER NOT NULL,",
    "  created_at TEXT NOT NULL,",
    "  updated_at TEXT NOT NULL,",
    "  finalized_at TEXT,",
    "  abandoned_at TEXT",
    ");",
    "CREATE UNIQUE INDEX IF NOT EXISTS intake_sessions_active_scope_idx",
    "  ON intake_sessions (scope_key)",
    "  WHERE status IN ('active', 'finalizing');",
    "CREATE TABLE IF NOT EXISTS intake_turns (",
    "  id TEXT PRIMARY KEY,",
    "  session_id TEXT NOT NULL,",
    "  turn_number INTEGER NOT NULL,",
    "  turn_kind TEXT NOT NULL,",
    "  base_brief_version_id TEXT,",
    "  result_brief_version_id TEXT,",
    "  request_payload_json TEXT NOT NULL,",
    "  llm_response_json TEXT,",
    "  created_at TEXT NOT NULL,",
    "  completed_at TEXT,",
    "  status TEXT NOT NULL,",
    "  provider TEXT,",
    "  lane TEXT,",
    "  configured_model TEXT,",
    "  resolved_model TEXT,",
    "  input_tokens INTEGER,",
    "  output_tokens INTEGER,",
    "  total_tokens INTEGER,",
    "  request_log_event_id INTEGER,",
    "  response_log_event_id INTEGER,",
    "  session_revision_before INTEGER,",
    "  session_revision_after INTEGER,",
    "  question_reconciliation_summary_json TEXT",
    ");",
    "CREATE TABLE IF NOT EXISTS intake_brief_versions (",
    "  id TEXT PRIMARY KEY,",
    "  session_id TEXT NOT NULL,",
    "  brief_version_number INTEGER NOT NULL,",
    "  created_from_turn_id TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  rendered_markdown TEXT NOT NULL,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS intake_brief_entries (",
    "  id TEXT PRIMARY KEY,",
    "  brief_version_id TEXT NOT NULL,",
    "  entry_type TEXT NOT NULL,",
    "  position INTEGER NOT NULL,",
    "  value_json TEXT NOT NULL,",
    "  rendered_markdown TEXT NOT NULL,",
    "  provenance_summary TEXT",
    ");",
    "CREATE TABLE IF NOT EXISTS intake_questions (",
    "  id TEXT PRIMARY KEY,",
    "  display_id TEXT NOT NULL,",
    "  session_id TEXT NOT NULL,",
    "  origin_turn_id TEXT NOT NULL,",
    "  current_prompt TEXT NOT NULL,",
    "  current_rationale_markdown TEXT NOT NULL,",
    "  importance TEXT NOT NULL,",
    "  tags_json TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  current_display_order INTEGER NOT NULL,",
    "  answer_text TEXT,",
    "  answer_updated_at TEXT,",
    "  superseded_by_question_id TEXT,",
    "  session_revision_seen INTEGER NOT NULL,",
    "  updated_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS intake_question_versions (",
    "  id TEXT PRIMARY KEY,",
    "  question_id TEXT NOT NULL,",
    "  display_id TEXT NOT NULL,",
    "  session_id TEXT NOT NULL,",
    "  turn_id TEXT NOT NULL,",
    "  version_number INTEGER NOT NULL,",
    "  prompt TEXT NOT NULL,",
    "  rationale_markdown TEXT NOT NULL,",
    "  importance TEXT NOT NULL,",
    "  tags_json TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  display_order INTEGER NOT NULL,",
    "  answer_text TEXT,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS intake_question_lineage (",
    "  id TEXT PRIMARY KEY,",
    "  session_id TEXT NOT NULL,",
    "  turn_id TEXT NOT NULL,",
    "  from_question_id TEXT NOT NULL,",
    "  to_question_id TEXT,",
    "  relation_type TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS provenance_entries (",
    "  id TEXT PRIMARY KEY,",
    "  owner_kind TEXT NOT NULL,",
    "  owner_id TEXT NOT NULL,",
    "  provenance_type TEXT NOT NULL,",
    "  label TEXT NOT NULL,",
    "  detail_json TEXT NOT NULL,",
    "  source_metadata_json TEXT NOT NULL,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS proposal_sessions (",
    "  id TEXT PRIMARY KEY,",
    "  intake_session_id TEXT NOT NULL,",
    "  intake_brief_version_id TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  current_input_snapshot_id TEXT,",
    "  current_pass_id TEXT,",
    "  proposal_session_revision INTEGER NOT NULL,",
    "  created_at TEXT NOT NULL,",
    "  updated_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS proposal_input_snapshots (",
    "  id TEXT PRIMARY KEY,",
    "  proposal_session_id TEXT NOT NULL,",
    "  intake_brief_version_id TEXT NOT NULL,",
    "  selected_input_manifest_json TEXT NOT NULL,",
    "  manifest_hash TEXT NOT NULL,",
    "  target_schema_version TEXT NOT NULL,",
    "  operator_options_json TEXT NOT NULL,",
    "  operator_constraints_json TEXT NOT NULL,",
    "  created_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS proposal_passes (",
    "  id TEXT PRIMARY KEY,",
    "  proposal_session_id TEXT NOT NULL,",
    "  proposal_input_snapshot_id TEXT NOT NULL,",
    "  pass_number INTEGER NOT NULL,",
    "  status TEXT NOT NULL,",
    "  llm_request_json TEXT NOT NULL,",
    "  llm_response_json TEXT,",
    "  created_at TEXT NOT NULL,",
    "  completed_at TEXT",
    ");",
    "CREATE TABLE IF NOT EXISTS proposal_draft_states (",
    "  id TEXT PRIMARY KEY,",
    "  proposal_session_id TEXT NOT NULL,",
    "  proposal_input_snapshot_id TEXT NOT NULL,",
    "  proposal_pass_id TEXT NOT NULL,",
    "  target_artifact TEXT NOT NULL,",
    "  status TEXT NOT NULL,",
    "  stale_reason TEXT,",
    "  current_proposal_record_id TEXT",
    ");",
    "CREATE INDEX IF NOT EXISTS log_events_occurred_at_idx ON log_events (occurred_at);",
    "CREATE INDEX IF NOT EXISTS log_events_level_idx ON log_events (level);",
    "CREATE INDEX IF NOT EXISTS log_events_scope_idx ON log_events (scope);",
    "CREATE INDEX IF NOT EXISTS log_events_request_id_idx ON log_events (request_id);",
    "CREATE INDEX IF NOT EXISTS log_events_project_root_idx ON log_events (project_root);",
    "CREATE INDEX IF NOT EXISTS llm_usage_records_provider_idx ON llm_usage_records (provider);",
    "CREATE INDEX IF NOT EXISTS llm_usage_records_project_root_idx ON llm_usage_records (project_root);",
    "CREATE INDEX IF NOT EXISTS llm_usage_records_occurred_at_idx ON llm_usage_records (occurred_at);",
    "CREATE INDEX IF NOT EXISTS intake_turns_session_id_idx ON intake_turns (session_id, turn_number);",
    "CREATE INDEX IF NOT EXISTS intake_brief_versions_session_id_idx ON intake_brief_versions (session_id, brief_version_number);",
    "CREATE INDEX IF NOT EXISTS intake_brief_entries_brief_version_id_idx ON intake_brief_entries (brief_version_id, position);",
    "CREATE INDEX IF NOT EXISTS intake_questions_session_id_idx ON intake_questions (session_id, current_display_order);",
    "CREATE INDEX IF NOT EXISTS intake_question_versions_question_id_idx ON intake_question_versions (question_id, version_number);",
    "CREATE INDEX IF NOT EXISTS intake_question_lineage_session_id_idx ON intake_question_lineage (session_id, turn_id);",
    "CREATE INDEX IF NOT EXISTS provenance_entries_owner_idx ON provenance_entries (owner_kind, owner_id);",
    "CREATE INDEX IF NOT EXISTS proposal_sessions_intake_session_id_idx ON proposal_sessions (intake_session_id);",
    "CREATE INDEX IF NOT EXISTS proposal_input_snapshots_session_id_idx ON proposal_input_snapshots (proposal_session_id, created_at);",
    "CREATE INDEX IF NOT EXISTS proposal_passes_session_id_idx ON proposal_passes (proposal_session_id, pass_number);",
    "CREATE INDEX IF NOT EXISTS proposal_draft_states_session_id_idx ON proposal_draft_states (proposal_session_id, status);",
  ].join("\n");
}
