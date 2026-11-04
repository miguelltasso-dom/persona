CREATE TABLE IF NOT EXISTS sync_envelope (
  workspace_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  classification TEXT NOT NULL,
  at TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  PRIMARY KEY (workspace_id, stream_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS sync_envelope_idem ON sync_envelope (idempotency_key);
CREATE INDEX IF NOT EXISTS sync_envelope_stream ON sync_envelope (stream_id, seq);

CREATE TABLE IF NOT EXISTS invite (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  body TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS invite_token ON invite (workspace_id, token);

CREATE TABLE IF NOT EXISTS webhook_delivery (
  source TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_device_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (source, delivery_id)
);

CREATE TABLE IF NOT EXISTS member (
  actor_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  invite_id TEXT,
  revoked_at INTEGER,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_workspace ON member (workspace_id, revoked_at);
CREATE INDEX IF NOT EXISTS member_invite ON member (invite_id);
