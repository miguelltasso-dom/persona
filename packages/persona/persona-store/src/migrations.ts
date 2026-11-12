/**
 * Immutable adjacent migrations `vN → vN+1` (D-007).
 */

/** One schema step. `version` is the `user_version` after this step succeeds. */
export interface Migration {
  readonly version: number
  readonly sql: string
}

const V1_PRODUCT = `
CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE member (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'guest')),
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, handle)
) STRICT;

CREATE INDEX member_workspace ON member (workspace_id);

CREATE TABLE project (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
  root_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX project_workspace ON project (workspace_id);
CREATE UNIQUE INDEX project_one_personal ON project (workspace_id) WHERE kind = 'personal';

CREATE TABLE persona (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL,
  avatar_json TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  personality TEXT NOT NULL,
  instructions TEXT NOT NULL,
  runner_json TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  skills_json TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  schedule_json TEXT,
  reports_to TEXT REFERENCES persona(id),
  system_roles_json TEXT NOT NULL,
  can_recruit INTEGER NOT NULL CHECK (can_recruit IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
) STRICT;

CREATE INDEX persona_workspace ON persona (workspace_id);
CREATE INDEX persona_project ON persona (project_id);

CREATE TABLE participation (
  persona_id TEXT NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id),
  kind TEXT NOT NULL CHECK (kind IN ('project', 'channel')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (persona_id, kind, target_id)
) STRICT;

CREATE TABLE channel (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (project_id, name)
) STRICT;

CREATE INDEX channel_workspace ON channel (workspace_id);
CREATE INDEX channel_project ON channel (project_id);

CREATE TABLE dm (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  participant_a TEXT NOT NULL,
  participant_b TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (participant_a < participant_b),
  UNIQUE (project_id, participant_a, participant_b)
) STRICT;

CREATE INDEX dm_workspace ON dm (workspace_id);
CREATE INDEX dm_project ON dm (project_id);
`

const V1_EVENTS = `
CREATE TABLE stream (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'dm', 'thread', 'routine')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, kind, owner_id)
) STRICT;

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL REFERENCES stream(id),
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_at_utc INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  UNIQUE (stream_id, seq)
) STRICT;

CREATE INDEX event_stream_seq ON event (stream_id, seq);
CREATE INDEX event_workspace_time ON event (workspace_id, occurred_at_utc);

CREATE VIRTUAL TABLE event_fts USING fts5(
  body,
  content='event',
  content_rowid='rowid'
);

CREATE TRIGGER event_ai AFTER INSERT ON event BEGIN
  INSERT INTO event_fts(rowid, body) VALUES (new.rowid, new.body);
END;
CREATE TRIGGER event_ad AFTER DELETE ON event BEGIN
  INSERT INTO event_fts(event_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
CREATE TRIGGER event_au AFTER UPDATE ON event BEGIN
  INSERT INTO event_fts(event_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
  INSERT INTO event_fts(rowid, body) VALUES (new.rowid, new.body);
END;

CREATE TABLE stream_cursor (
  stream_id TEXT PRIMARY KEY REFERENCES stream(id),
  last_seq INTEGER NOT NULL
) STRICT;
`

const V1_VAULT = `
CREATE TABLE vault_record (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  kind TEXT NOT NULL CHECK (kind IN ('brief', 'constraint', 'decision', 'memory')),
  body TEXT NOT NULL,
  fact_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  source_ids_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  visibility_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1)
) STRICT;

CREATE INDEX vault_record_workspace ON vault_record (workspace_id, kind, status);

CREATE TABLE vault_document (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1)
) STRICT;

CREATE VIRTUAL TABLE vault_document_fts USING fts5(
  title,
  body,
  content='vault_document',
  content_rowid='rowid'
);

CREATE TRIGGER vault_document_ai AFTER INSERT ON vault_document BEGIN
  INSERT INTO vault_document_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER vault_document_ad AFTER DELETE ON vault_document BEGIN
  INSERT INTO vault_document_fts(vault_document_fts, rowid, title, body)
    VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER vault_document_au AFTER UPDATE ON vault_document BEGIN
  INSERT INTO vault_document_fts(vault_document_fts, rowid, title, body)
    VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO vault_document_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TABLE vault_version (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('record', 'document')),
  target_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (target_kind, target_id, revision)
) STRICT;
`

const V1_ROUTINES = `
CREATE TABLE routine (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL,
  rrule TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  silence_start TEXT,
  silence_end TEXT,
  catch_up TEXT NOT NULL CHECK (catch_up IN ('skip', 'run_once', 'run_all')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX routine_workspace ON routine (workspace_id);

CREATE TABLE routine_run (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  routine_id TEXT NOT NULL REFERENCES routine(id),
  scheduled_for TEXT NOT NULL,
  lease_until TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'leased', 'done', 'failed', 'cancelled')),
  attempt INTEGER NOT NULL DEFAULT 0,
  UNIQUE (routine_id, scheduled_for)
) STRICT;
`

const V2_ENGINE = `
CREATE TABLE engine_trigger (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE TABLE engine_disposition (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE TABLE engine_thread (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  pending_len INTEGER NOT NULL,
  evaluating INTEGER NOT NULL CHECK (evaluating IN (0, 1)),
  body TEXT NOT NULL,
  PRIMARY KEY (project_id, key)
) STRICT;

CREATE TABLE engine_ticket (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  stage TEXT NOT NULL,
  stage_action TEXT,
  ended INTEGER NOT NULL CHECK (ended IN (0, 1)),
  undelivered_len INTEGER NOT NULL,
  assignment_state TEXT,
  body TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE TABLE engine_decision (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE TABLE engine_effect (
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  payload TEXT NOT NULL,
  seq INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  due INTEGER NOT NULL,
  PRIMARY KEY (project_id, kind, key)
) STRICT;

CREATE TABLE engine_effect_seq (
  project_id TEXT NOT NULL PRIMARY KEY,
  last_seq INTEGER NOT NULL
) STRICT;

CREATE TABLE engine_outbox (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  conversation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'dropped')),
  body TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE TABLE engine_outbox_pass (
  project_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (project_id, seq)
) STRICT;
`

const V3_SYNC = `
CREATE TABLE sync_envelope (
  workspace_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  classification TEXT NOT NULL,
  at TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0 CHECK (shared IN (0, 1)),
  body TEXT NOT NULL,
  PRIMARY KEY (workspace_id, stream_id, seq)
) STRICT;

CREATE UNIQUE INDEX sync_envelope_idem ON sync_envelope (idempotency_key);
CREATE INDEX sync_envelope_stream ON sync_envelope (stream_id, seq);

CREATE TABLE invite (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  body TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX invite_token ON invite (workspace_id, token);

CREATE TABLE invite_actor (
  workspace_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (workspace_id, actor_id)
) STRICT;

CREATE TABLE invite_vault (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
) STRICT;

CREATE TABLE invite_memory (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
) STRICT;

CREATE TABLE import_batch (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  rolled_back INTEGER NOT NULL CHECK (rolled_back IN (0, 1)),
  body TEXT NOT NULL
) STRICT;
`

const V4_PROACTIVITY = `
CREATE TABLE autonomy (
  project_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('asked', 'propose', 'act')),
  proposal_budget INTEGER NOT NULL,
  token_budget INTEGER NOT NULL,
  execution_budget INTEGER NOT NULL,
  silence_start TEXT,
  silence_end TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, persona_id)
) STRICT;

CREATE TABLE visit (
  project_id TEXT NOT NULL PRIMARY KEY,
  last_seen_at TEXT NOT NULL
) STRICT;

CREATE TABLE initiative_fire (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  title TEXT NOT NULL,
  ticket_id TEXT,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE INDEX initiative_fire_project_at ON initiative_fire (project_id, at);

CREATE TABLE watchdog_audit (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE INDEX watchdog_audit_project_at ON watchdog_audit (project_id, at);

CREATE TABLE attention_spend (
  project_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  day TEXT NOT NULL,
  proposals INTEGER NOT NULL,
  PRIMARY KEY (project_id, persona_id, day)
) STRICT;
`

const V5_SCREENS = `
CREATE TABLE screen_doc (
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, kind, id)
) STRICT;

CREATE INDEX screen_doc_kind ON screen_doc (project_id, kind, updated_at);
`

const V6_RETENTION = `
CREATE TABLE retention_record (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived_at INTEGER,
  body TEXT NOT NULL
) STRICT;

CREATE INDEX retention_record_kind ON retention_record (kind, archived_at);

CREATE TABLE retention_index (
  key TEXT PRIMARY KEY,
  record_id TEXT NOT NULL
) STRICT;

CREATE TABLE retention_cache (
  record_id TEXT PRIMARY KEY
) STRICT;
`

const V7_USAGE = `
CREATE TABLE usage_record (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  persona_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  window TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('measured', 'estimate', 'official', 'unavailable')),
  at TEXT NOT NULL
) STRICT;

CREATE INDEX usage_record_project_at ON usage_record (project_id, at);
CREATE INDEX usage_record_persona_at ON usage_record (project_id, persona_id, at);

CREATE TABLE usage_quota (
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('measured', 'estimate', 'official', 'unavailable')),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, provider)
) STRICT;
`

const V8_BOARD = `
CREATE TABLE project_workflow (
  project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE workflow_column (
  project_id TEXT NOT NULL REFERENCES project_workflow(project_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('todo', 'doing', 'review', 'needs_you', 'done')),
  color TEXT,
  icon TEXT,
  wip INTEGER,
  ord INTEGER NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE INDEX workflow_column_ord ON workflow_column (project_id, ord);

CREATE TABLE workflow_field (
  project_id TEXT NOT NULL REFERENCES project_workflow(project_id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'link', 'number', 'date', 'select')),
  options_json TEXT,
  ord INTEGER NOT NULL,
  PRIMARY KEY (project_id, id)
) STRICT;

CREATE INDEX workflow_field_ord ON workflow_field (project_id, ord);

CREATE TABLE sprint (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planejado', 'ativo', 'encerrado')),
  starts_at TEXT,
  ends_at TEXT,
  goal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX sprint_project ON sprint (project_id, status);

CREATE TABLE sprint_ticket (
  sprint_id TEXT NOT NULL REFERENCES sprint(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (sprint_id, ticket_id)
) STRICT;

CREATE TABLE ticket_seat (
  ticket_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  column_id TEXT,
  sprint_id TEXT REFERENCES sprint(id) ON DELETE SET NULL,
  blocked INTEGER NOT NULL CHECK (blocked IN (0, 1)),
  campos_json TEXT
) STRICT;

CREATE INDEX ticket_seat_project ON ticket_seat (project_id);
`

const V9_MEDIA = `
CREATE TABLE blob_object (
  hash TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('attachment', 'avatar')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE attachment (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  stream_kind TEXT NOT NULL CHECK (stream_kind IN ('channel', 'dm')),
  owner_id TEXT NOT NULL,
  message_id TEXT,
  hash TEXT NOT NULL REFERENCES blob_object(hash),
  name TEXT NOT NULL,
  credential_warning INTEGER NOT NULL CHECK (credential_warning IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX attachment_message ON attachment (message_id);
CREATE INDEX attachment_project ON attachment (project_id);
CREATE INDEX attachment_hash ON attachment (hash);
`

const V10_CARD = `
CREATE TABLE persona_speak (
  persona_id TEXT PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('everyone', 'members')),
  principals_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE persona_charge (
  persona_id TEXT PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE,
  responsible_human_id TEXT NOT NULL,
  substitute_human_id TEXT,
  sector_id TEXT,
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT;
`

const V11_GOVERNANCE = `
CREATE TABLE sector (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, name)
) STRICT;

CREATE INDEX sector_workspace ON sector (workspace_id);

CREATE TABLE away_window (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  human_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('away', 'absent')),
  starts_at TEXT NOT NULL,
  until_at TEXT NOT NULL
) STRICT;

CREATE INDEX away_window_workspace ON away_window (workspace_id, human_id);

CREATE TABLE routine_charge (
  routine_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  executor_persona_id TEXT,
  responsible_human_id TEXT,
  sector_id TEXT,
  requires_approval INTEGER NOT NULL CHECK (requires_approval IN (0, 1)),
  approval_kind TEXT,
  autonomy TEXT,
  cadence TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX routine_charge_workspace ON routine_charge (workspace_id);

CREATE TABLE governance_delegate (
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  routine_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, routine_id)
) STRICT;

CREATE TABLE governance_audit (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  body TEXT NOT NULL
) STRICT;

CREATE INDEX governance_audit_workspace ON governance_audit (workspace_id, at);

INSERT INTO persona_charge (persona_id, responsible_human_id, confirmed, updated_at)
SELECT p.id, m.id, 1, '2026-11-03T00:00:00.000Z'
  FROM persona p
  JOIN member m ON m.workspace_id = p.workspace_id AND m.role = 'owner'
 WHERE NOT EXISTS (SELECT 1 FROM persona_charge c WHERE c.persona_id = p.id);
`

/** Adjacent shipped layout: v1 product… v10 card, v11 governance. */
const V12_CHAT = `
ALTER TABLE event ADD COLUMN reply_to_id TEXT;
ALTER TABLE event ADD COLUMN edited_at TEXT;

CREATE TABLE event_reaction (
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  sticker_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, actor_id, sticker_id)
) STRICT;

CREATE INDEX event_reaction_project ON event_reaction (project_id);

CREATE TABLE stream_pin (
  stream_id TEXT NOT NULL REFERENCES stream(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  pinned_by TEXT NOT NULL,
  pinned_at TEXT NOT NULL,
  PRIMARY KEY (stream_id, event_id)
) STRICT;

CREATE INDEX stream_pin_project ON stream_pin (project_id);

CREATE TABLE event_audit (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('edit', 'delete', 'pin', 'unpin', 'react', 'unreact')),
  at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX event_audit_event ON event_audit (event_id, at);
CREATE INDEX event_audit_project ON event_audit (project_id);
CREATE INDEX event_stream_alive_seq ON event (stream_id, seq) WHERE deleted = 0;
`

const V13_VAULT_CHUNKS = `
ALTER TABLE vault_document ADD COLUMN mime TEXT NOT NULL DEFAULT 'text/plain';
ALTER TABLE vault_document ADD COLUMN filename TEXT NOT NULL DEFAULT '';
ALTER TABLE vault_document ADD COLUMN hash TEXT NOT NULL DEFAULT '';
ALTER TABLE vault_document ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE vault_chunk (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES vault_document(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  locator TEXT NOT NULL,
  body TEXT NOT NULL,
  UNIQUE (document_id, chunk_index)
) STRICT;

CREATE INDEX vault_chunk_project ON vault_chunk (project_id, document_id);

CREATE VIRTUAL TABLE vault_chunk_fts USING fts5(
  body,
  content='vault_chunk',
  content_rowid='rowid'
);

CREATE TRIGGER vault_chunk_ai AFTER INSERT ON vault_chunk BEGIN
  INSERT INTO vault_chunk_fts(rowid, body) VALUES (new.rowid, new.body);
END;
CREATE TRIGGER vault_chunk_ad AFTER DELETE ON vault_chunk BEGIN
  INSERT INTO vault_chunk_fts(vault_chunk_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
END;
CREATE TRIGGER vault_chunk_au AFTER UPDATE ON vault_chunk BEGIN
  INSERT INTO vault_chunk_fts(vault_chunk_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
  INSERT INTO vault_chunk_fts(rowid, body) VALUES (new.rowid, new.body);
END;
`

const V14_WAVE2 = `
CREATE TABLE conversation_topic (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  stream_kind TEXT NOT NULL CHECK (stream_kind IN ('channel', 'dm')),
  owner_id TEXT NOT NULL,
  color_index INTEGER NOT NULL CHECK (color_index >= 0 AND color_index <= 6),
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, stream_kind, owner_id, color_index)
) STRICT;

CREATE INDEX conversation_topic_stream ON conversation_topic (project_id, stream_kind, owner_id);

CREATE TABLE topic_read (
  topic_id TEXT NOT NULL REFERENCES conversation_topic(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_id, actor_id)
) STRICT;

ALTER TABLE event ADD COLUMN topic_id TEXT;

CREATE TABLE provider_account (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  home_dir TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('ok', 'limit', 'error', 'checking')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX provider_account_workspace ON provider_account (workspace_id, provider);

CREATE TABLE account_policy (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  scope TEXT NOT NULL CHECK (scope IN ('workspace', 'persona')),
  scope_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('fixed', 'next', 'split', 'ask')),
  account_ids_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, scope, scope_id, provider)
) STRICT;

ALTER TABLE usage_record ADD COLUMN account_id TEXT;

CREATE TABLE teach_artifact (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  persona_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recording', 'processing', 'draft', 'discarded')),
  filename TEXT NOT NULL,
  hash TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  transcript TEXT NOT NULL DEFAULT '',
  skill_draft_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX teach_artifact_persona ON teach_artifact (project_id, persona_id);
`

const V15_SECOND_BRAIN = `
CREATE TABLE brain_page (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  kind TEXT NOT NULL CHECK (kind IN ('company','person','client','project','process','rule','decision','permission','tool','glossary','learning')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  visibility_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  confirmed_at TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','superseded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, slug)
) STRICT;

CREATE INDEX brain_page_project_kind ON brain_page (project_id, kind, updated_at);

CREATE VIRTUAL TABLE brain_page_fts USING fts5(
  title, body, kind,
  content='brain_page',
  content_rowid='rowid'
);

CREATE TRIGGER brain_page_ai AFTER INSERT ON brain_page BEGIN
  INSERT INTO brain_page_fts(rowid, title, body, kind) VALUES (new.rowid, new.title, new.body, new.kind);
END;
CREATE TRIGGER brain_page_ad AFTER DELETE ON brain_page BEGIN
  INSERT INTO brain_page_fts(brain_page_fts, rowid, title, body, kind) VALUES ('delete', old.rowid, old.title, old.body, old.kind);
END;
CREATE TRIGGER brain_page_au AFTER UPDATE ON brain_page BEGIN
  INSERT INTO brain_page_fts(brain_page_fts, rowid, title, body, kind) VALUES ('delete', old.rowid, old.title, old.body, old.kind);
  INSERT INTO brain_page_fts(rowid, title, body, kind) VALUES (new.rowid, new.title, new.body, new.kind);
END;

CREATE TABLE brain_link (
  from_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES project(id),
  to_slug TEXT NOT NULL,
  PRIMARY KEY (from_id, to_slug)
) STRICT;

CREATE INDEX brain_link_project ON brain_link (project_id, to_slug);

CREATE TABLE brain_version (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES project(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  editor_kind TEXT NOT NULL CHECK (editor_kind IN ('person','persona')),
  editor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (page_id, revision)
) STRICT;

CREATE INDEX brain_version_page ON brain_version (page_id, revision);

CREATE TABLE brain_grant (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  grantor_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  validity TEXT NOT NULL CHECK (validity IN ('once','7d','until-revoke')),
  expires_at TEXT,
  revoked_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX brain_grant_persona ON brain_grant (project_id, persona_id, revoked_at);
`

const V16_TEAM_MANAGER = `
CREATE TABLE team_manager_mandate (
  persona_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX team_manager_mandate_workspace ON team_manager_mandate (workspace_id);

CREATE TABLE team_manager_plan (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  team_manager_id TEXT NOT NULL,
  action TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'applied', 'commented', 'rejected')),
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX team_manager_plan_scope ON team_manager_plan (workspace_id, scope_key, status);

CREATE TABLE team_manager_audit (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  team_manager_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;

CREATE INDEX team_manager_audit_workspace ON team_manager_audit (workspace_id, at);
`

const V17_TOKEN_OPT = `
CREATE TABLE topic_summary (
  topic_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_seq INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX topic_summary_project ON topic_summary (project_id);

CREATE TABLE batch_cursor (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('librarian', 'initiative')),
  last_at TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX batch_cursor_project ON batch_cursor (project_id, kind);

CREATE TABLE provider_limit_pool (
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  body_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, provider)
) STRICT;
`

const V18_TURN_LEDGER = `
CREATE TABLE turn_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  engine TEXT NOT NULL,
  account_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN (
    'triage', 'reply', 'execution', 'initiative', 'librarian', 'watchdog', 'evaluation'
  )),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cache_read_tokens INTEGER NOT NULL CHECK (cache_read_tokens >= 0),
  cache_write_tokens INTEGER NOT NULL CHECK (cache_write_tokens >= 0),
  layer_system INTEGER NOT NULL CHECK (layer_system >= 0),
  layer_tools INTEGER NOT NULL CHECK (layer_tools >= 0),
  layer_required INTEGER NOT NULL CHECK (layer_required >= 0),
  layer_subject INTEGER NOT NULL CHECK (layer_subject >= 0),
  layer_recall INTEGER NOT NULL CHECK (layer_recall >= 0),
  layer_message INTEGER NOT NULL CHECK (layer_message >= 0),
  ticket_id TEXT,
  origin TEXT CHECK (origin IN ('measured', 'estimate') OR origin IS NULL),
  at TEXT NOT NULL
) STRICT;

CREATE INDEX turn_ledger_project_at ON turn_ledger (project_id, at);
CREATE INDEX turn_ledger_persona_at ON turn_ledger (project_id, persona_id, at);
CREATE INDEX turn_ledger_ticket ON turn_ledger (ticket_id);

ALTER TABLE usage_record ADD COLUMN kind TEXT;
ALTER TABLE usage_record ADD COLUMN cache_read_tokens INTEGER;
ALTER TABLE usage_record ADD COLUMN cache_write_tokens INTEGER;
`

const V19_QUOTA_ACCOUNT = `
CREATE TABLE usage_quota_account (
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('measured', 'estimate', 'official', 'unavailable')),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, provider, account_id)
) STRICT;

INSERT INTO usage_quota_account (project_id, provider, account_id, origin, body, updated_at)
SELECT project_id, provider, '', origin, body, updated_at FROM usage_quota;

DROP TABLE usage_quota;
ALTER TABLE usage_quota_account RENAME TO usage_quota;
`

/** OPT-9: wall time of a measured turn, in ms. NULL = the runner did not report it (old rows stay NULL; nothing is back-filled). */
const V20_LEDGER_DURATION = `
ALTER TABLE turn_ledger ADD COLUMN duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0);
`

/**
 * P1-7: the person's current 'while you were away' window, kept so it survives a restart and stays stable: where it starts
 * (`window_since`) and when it was opened (`window_opened_at`), so how long they were away is known at the moment they came back.
 */
const V21_AWAY_WINDOW = `
ALTER TABLE visit ADD COLUMN window_since TEXT;
ALTER TABLE visit ADD COLUMN window_opened_at TEXT;
`

/**
 * ISO-2 (D-081): the connector of the person's CLI a persona may use. A POINTER with a level, never a command, URL or token. Kept
 * apart from persona.tools (its highest level decides the persona's effective tool level). The log only grows and outlives the persona.
 */
/** CV-6 / contracts/team-channels.md: kind, origin, archive, name lock; members of a channel the person made; pins per person. Additive. */
const V24_TEAM_CHANNELS = `
ALTER TABLE channel ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('general', 'team', 'directorate', 'custom'));
ALTER TABLE channel ADD COLUMN source_id TEXT;
ALTER TABLE channel ADD COLUMN archived_at TEXT;
ALTER TABLE channel ADD COLUMN archived_reason TEXT CHECK (archived_reason IS NULL OR archived_reason IN ('team-gone', 'directorate-gone', 'by-person'));
ALTER TABLE channel ADD COLUMN name_locked INTEGER NOT NULL DEFAULT 0 CHECK (name_locked IN (0, 1));
UPDATE channel SET kind = 'general' WHERE name = 'geral';
CREATE UNIQUE INDEX channel_team_source ON channel (project_id, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE channel_member (
  channel_id TEXT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
  member_kind TEXT NOT NULL CHECK (member_kind IN ('persona', 'human')),
  member_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, member_kind, member_id)
) STRICT;

CREATE TABLE channel_pin (
  channel_id TEXT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  pinned_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, member_id)
) STRICT;
`

/** HT-6/D-084: a persona can be RETIRED ("aposentada"): she leaves the team, her history stays, her name and face are free again. Reversible. */
const V23_PERSONA_RETIRED = `
ALTER TABLE persona ADD COLUMN retired_at TEXT;
CREATE INDEX persona_retired ON persona (project_id, retired_at);
`

const V22_CONNECTOR_GRANTS = `
CREATE TABLE connector_grant (
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL REFERENCES persona(id) ON DELETE CASCADE,
  cli TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  name TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('read', 'write')),
  confirm_send TEXT NOT NULL DEFAULT 'ask' CHECK (confirm_send IN ('ask', 'never')),
  confirm_pay TEXT NOT NULL DEFAULT 'ask' CHECK (confirm_pay IN ('ask', 'never')),
  confirm_delete TEXT NOT NULL DEFAULT 'ask' CHECK (confirm_delete IN ('ask', 'never')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, persona_id, cli, connector_id)
) STRICT;

CREATE INDEX connector_grant_persona ON connector_grant (persona_id);

CREATE TABLE connector_grant_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  cli TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant', 'change', 'revoke')),
  access TEXT CHECK (access IS NULL OR access IN ('read', 'write')),
  confirm_json TEXT,
  actor_id TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;

CREATE INDEX connector_grant_log_persona ON connector_grant_log (workspace_id, persona_id, at);

-- D-085: the MODE a call ran in (native | answer-only | needed), as the runner reports it. NULL = not reported; old rows stay NULL (nothing is back-filled).
ALTER TABLE turn_ledger ADD COLUMN env_mode TEXT CHECK (env_mode IS NULL OR env_mode IN ('native', 'answer-only', 'needed'));

-- The authorization of a connector for ONE Task, from the person's own words. It never carries over to another Task.
CREATE TABLE ticket_connector_auth (
  ticket_id TEXT NOT NULL,
  cli TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('request', 'once')),
  message_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (ticket_id, cli, connector_id)
) STRICT;
`

/** D-096: WHY a call ran in the mode it did (a code). NULL = not reported; old rows stay NULL. */
const V25_ENV_MODE_REASON = `
ALTER TABLE turn_ledger ADD COLUMN env_mode_reason TEXT CHECK (env_mode_reason IS NULL OR length(env_mode_reason) BETWEEN 1 AND 40);
`

/** Item 22 (H22): equipes montadas pela pessoa, categorias que agrupam canais, posição do canal. Aditiva: nada existente muda; o canal sem categoria é o de sempre. */
const V26_EQUIPES_CATEGORIAS = `
CREATE TABLE equipe (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  icon TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (project_id, name)
) STRICT;

CREATE UNIQUE INDEX equipe_source ON equipe (project_id, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX equipe_project ON equipe (project_id, position);

CREATE TABLE equipe_member (
  equipe_id TEXT NOT NULL REFERENCES equipe(id) ON DELETE CASCADE,
  persona_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (equipe_id, persona_id)
) STRICT;

CREATE TABLE channel_category (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, name)
) STRICT;

CREATE INDEX channel_category_project ON channel_category (project_id, position);

ALTER TABLE channel ADD COLUMN category_id TEXT REFERENCES channel_category(id) ON DELETE SET NULL;
ALTER TABLE channel ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
`

export const PERSONA_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `${V1_PRODUCT}\n${V1_EVENTS}\n${V1_VAULT}\n${V1_ROUTINES}`,
  },
  {
    version: 2,
    sql: V2_ENGINE,
  },
  {
    version: 3,
    sql: V3_SYNC,
  },
  {
    version: 4,
    sql: V4_PROACTIVITY,
  },
  {
    version: 5,
    sql: V5_SCREENS,
  },
  {
    version: 6,
    sql: V6_RETENTION,
  },
  {
    version: 7,
    sql: V7_USAGE,
  },
  {
    version: 8,
    sql: V8_BOARD,
  },
  {
    version: 9,
    sql: V9_MEDIA,
  },
  {
    version: 10,
    sql: V10_CARD,
  },
  {
    version: 11,
    sql: V11_GOVERNANCE,
  },
  {
    version: 12,
    sql: V12_CHAT,
  },
  {
    version: 13,
    sql: V13_VAULT_CHUNKS,
  },
  {
    version: 14,
    sql: V14_WAVE2,
  },
  {
    version: 15,
    sql: V15_SECOND_BRAIN,
  },
  {
    version: 16,
    sql: V16_TEAM_MANAGER,
  },
  {
    version: 17,
    sql: V17_TOKEN_OPT,
  },
  {
    version: 18,
    sql: V18_TURN_LEDGER,
  },
  {
    version: 19,
    sql: V19_QUOTA_ACCOUNT,
  },
  {
    version: 20,
    sql: V20_LEDGER_DURATION,
  },
  {
    version: 21,
    sql: V21_AWAY_WINDOW,
  },
  {
    version: 22,
    sql: V22_CONNECTOR_GRANTS,
  },
  {
    version: 23,
    sql: V23_PERSONA_RETIRED,
  },
  {
    version: 24,
    sql: V24_TEAM_CHANNELS,
  },
  {
    version: 25,
    sql: V25_ENV_MODE_REASON,
  },
  {
    version: 26,
    sql: V26_EQUIPES_CATEGORIAS,
  },
]
