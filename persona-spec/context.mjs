import { createHash } from 'node:crypto';

// Integration boundary: scope, snapshot and authorize must come from trusted
// application services, never from model arguments or client-supplied membership.
export class ContextError extends Error {
  constructor(code) { super(code); this.name = 'ContextError'; this.code = code; }
}
const fail = code => { throw new ContextError(code); };
const nonempty = value => typeof value === 'string' && value.length > 0;
const rank = { constraint: 0, decision: 1, brief: 2, task: 3, skill: 4, memory: 5 };

function checkScope(scope) {
  for (const key of ['workspaceId', 'projectId', 'agentId', 'actorId', 'audienceId', 'policyRevision']) {
    if (!nonempty(scope?.[key])) fail('INVALID_SCOPE');
  }
}

function localScopeMatches(record, scope) {
  return record.workspaceId === scope.workspaceId &&
    record.projectId === scope.projectId &&
    (!record.agentId || record.agentId === scope.agentId);
}

function indexSnapshot(snapshot) {
  if (!nonempty(snapshot?.revision) || !Array.isArray(snapshot.records) ||
      !Array.isArray(snapshot.requiredIds)) fail('INVALID_SNAPSHOT');
  const index = new Map();
  for (const record of snapshot.records) {
    if (!nonempty(record.id) || index.has(record.id) ||
        !Number.isInteger(record.revision) || record.revision < 1 ||
        typeof record.body !== 'string' || !Object.hasOwn(rank, record.kind) ||
        !Array.isArray(record.sourceIds) || record.sourceIds.some(id => !nonempty(id))) {
      fail('INVALID_SNAPSHOT');
    }
    index.set(record.id, record);
  }
  if (snapshot.requiredIds.some(id => !nonempty(id))) fail('INVALID_SNAPSHOT');
  return index;
}

function policyReader(index, scope, authorize) {
  const checked = new Map();
  async function readable(id, path = new Set()) {
    if (path.has(id)) return false;
    if (checked.has(id)) return checked.get(id);
    const record = index.get(id);
    if (!record || record.status !== 'active' || !localScopeMatches(record, scope)) return false;
    // authorize must include current actor AND recipient/audience grants, including
    // whether an agent may disclose a DM-derived memory in this destination.
    if (await authorize(record, scope) !== true) { checked.set(id, false); return false; }
    const next = new Set(path); next.add(id);
    for (const sourceId of record.sourceIds) {
      if (!await readable(sourceId, next)) { checked.set(id, false); return false; }
    }
    checked.set(id, true);
    return true;
  }
  return readable;
}

function render(records) {
  // Deliberately stable ordering/serialization for provider prompt caching.
  // This is data. The caller wraps it under its trusted instruction hierarchy.
  return JSON.stringify({ format: 'persona-context-v1', records: records.map(record => ({
    id: record.id, revision: record.revision, kind: record.kind,
    body: record.body, sourceIds: [...record.sourceIds].sort()
  })) });
}

export async function compileContext({ scope, snapshot, budgetTokens, countTokens, authorize }) {
  checkScope(scope);
  if (!Number.isInteger(budgetTokens) || budgetTokens < 1 ||
      typeof countTokens !== 'function' || typeof authorize !== 'function') fail('INVALID_OPTIONS');
  // Freeze the input view before the first await. Concurrent edits belong to the
  // next snapshot, not to a partially assembled prompt.
  scope = structuredClone(scope);
  snapshot = structuredClone(snapshot);
  const index = indexSnapshot(snapshot);
  const readable = policyReader(index, scope, authorize);
  const selected = [];
  const requiredIds = [...new Set(snapshot.requiredIds)].sort();
  for (const id of requiredIds) {
    if (!await readable(id)) fail('REQUIRED_CONTEXT_UNAVAILABLE');
    selected.push(index.get(id));
  }
  const order = (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id);
  selected.sort(order);
  // A semantic key represents one authoritative fact, e.g. publish.policy.
  // Conflicting mandatory facts must be resolved by the application/user.
  const facts = new Map();
  for (const record of selected) {
    if (!record.factKey) continue;
    if (facts.has(record.factKey) && facts.get(record.factKey) !== record.body) fail('CONTEXT_CONFLICT');
    facts.set(record.factKey, record.body);
  }
  function tokens(records) {
    const count = countTokens(render(records));
    if (!Number.isInteger(count) || count < 0) fail('INVALID_TOKEN_COUNT');
    return count;
  }
  if (tokens(selected) > budgetTokens) fail('REQUIRED_CONTEXT_OVERFLOW');
  const candidates = [...index.values()].filter(record => !requiredIds.includes(record.id));
  candidates.sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) ||
    (Number.isFinite(b.relevance) ? b.relevance : 0) -
    (Number.isFinite(a.relevance) ? a.relevance : 0) || order(a, b));
  for (const record of candidates) {
    if (!await readable(record.id)) continue;
    // An optional memory cannot override an authoritative fact already loaded.
    if (record.factKey && facts.has(record.factKey) && facts.get(record.factKey) !== record.body) continue;
    const next = [...selected, record];
    if (tokens(next) <= budgetTokens) {
      selected.push(record);
      if (record.factKey) facts.set(record.factKey, record.body);
    }
  }
  const manifest = {
    version: 1, workspaceId: scope.workspaceId, projectId: scope.projectId,
    agentId: scope.agentId, actorId: scope.actorId, audienceId: scope.audienceId,
    policyRevision: scope.policyRevision, snapshotRevision: snapshot.revision,
    requiredIds, records: selected.map(({ id, revision }) => ({ id, revision })),
    tokenCount: tokens(selected)
  };
  const cacheKey = createHash('sha256').update(JSON.stringify(manifest)).update(render(selected)).digest('hex');
  return { text: render(selected), manifest, cacheKey };
}

// Reference recall filter over a bounded storage result. It does not load an
// entire transcript or perform semantic search. Storage must query within scope.
export async function recall({ scope, events, subjectId, since, until, afterSequence = 0,
  limit = 50, authorize }) {
  checkScope(scope);
  if (!nonempty(subjectId) || !Array.isArray(events) || typeof authorize !== 'function' ||
      !Number.isInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isInteger(afterSequence) || afterSequence < 0) fail('INVALID_RECALL');
  const timestamp = value => {
    // Explicit offset required; no machine-local date interpretation.
    if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
        !Number.isFinite(Date.parse(value))) fail('INVALID_TIMESTAMP');
    return Date.parse(value);
  };
  const from = since === undefined ? -Infinity : timestamp(since);
  const to = until === undefined ? Infinity : timestamp(until);
  if (from > to) fail('INVALID_TIME_RANGE');
  scope = structuredClone(scope);
  events = structuredClone(events);
  const seen = new Set();
  const rows = [];
  for (const event of events.sort((a, b) => a.sequence - b.sequence)) {
    if (!Number.isInteger(event.sequence) || event.sequence < 1 || seen.has(event.sequence)) fail('INVALID_EVENTS');
    seen.add(event.sequence);
    if (event.sequence <= afterSequence || event.subjectId !== subjectId ||
        !localScopeMatches(event, scope) || event.deleted === true) continue;
    const at = timestamp(event.occurredAt);
    if (at < from || at > to || await authorize(event, scope) !== true) continue;
    if (!['message', 'decision', 'artifact', 'handoff'].includes(event.type)) continue;
    if (!nonempty(event.id) || typeof event.body !== 'string') fail('INVALID_EVENTS');
    rows.push({ id: event.id, sequence: event.sequence, occurredAt: event.occurredAt,
      subjectId: event.subjectId, type: event.type, body: event.body });
    if (rows.length === limit) break;
  }
  return { events: rows, nextSequence: rows.at(-1)?.sequence ?? afterSequence };
}
