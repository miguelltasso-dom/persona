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

/** Shipped product + event + vault + routine layout (schema v1). */
export const PERSONA_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `${V1_PRODUCT}\n${V1_EVENTS}\n${V1_VAULT}\n${V1_ROUTINES}`,
  },
]
