/**
 * The hub's own tables, in the Durable Object's SQLite (there is NO D1: the DO already holds log, roster, invites and keys next to the code that uses them).
 * One statement per entry, each on a single line.
 */

/** Invite, webhook, roster, join request, key wrap, key epoch and replay tables. */
export const EDGE_STATEMENTS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS invite (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, revoked_at INTEGER, body TEXT NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS invite_token ON invite (workspace_id, token)',
  'CREATE TABLE IF NOT EXISTS webhook_delivery (source TEXT NOT NULL, delivery_id TEXT NOT NULL, workspace_id TEXT NOT NULL, owner_device_id TEXT NOT NULL, received_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (source, delivery_id))',
  'CREATE TABLE IF NOT EXISTS member (actor_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, invite_id TEXT, revoked_at INTEGER, body TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS member_workspace ON member (workspace_id, revoked_at)',
  'CREATE INDEX IF NOT EXISTS member_invite ON member (invite_id)',
  // F2: a person asks to join through an invite link; they are NOT a member until the owner approves.
  'CREATE TABLE IF NOT EXISTS join_request (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, invite_id TEXT NOT NULL, actor_id TEXT NOT NULL, decided_at INTEGER, body TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS join_request_invite ON join_request (invite_id)',
  // The channel key sealed for one member (opaque to the hub) and the channel's current key epoch.
  'CREATE TABLE IF NOT EXISTS key_wrap (workspace_id TEXT NOT NULL, channel_id TEXT NOT NULL, epoch INTEGER NOT NULL, recipient_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (workspace_id, channel_id, epoch, recipient_id))',
  'CREATE INDEX IF NOT EXISTS key_wrap_recipient ON key_wrap (channel_id, recipient_id)',
  'CREATE TABLE IF NOT EXISTS channel_epoch (workspace_id TEXT NOT NULL, channel_id TEXT NOT NULL, epoch INTEGER NOT NULL, rotated_by TEXT NOT NULL, rotated_at INTEGER NOT NULL, PRIMARY KEY (workspace_id, channel_id))',
  // Request signatures already seen (anti-replay): in SQLite so a hibernation does not forget them.
  'CREATE TABLE IF NOT EXISTS seen_sig (sig TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)',
]
