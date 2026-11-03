import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContext, recall } from './context.mjs';

const scope = { workspaceId: 'team', projectId: 'launch', agentId: 'atlas',
  actorId: 'miguel', audienceId: 'channel-launch', policyRevision: '1' };
const record = (id, overrides = {}) => ({ id, workspaceId: 'team', projectId: 'launch',
  revision: 1, kind: 'memory', status: 'active', body: id, sourceIds: [], ...overrides });
const countTokens = text => text.length; // Exact synthetic budget unit, NOT a model tokenizer.
const compile = (records, options = {}) => compileContext({ scope,
  snapshot: { revision: 's1', requiredIds: [], records }, budgetTokens: 10000,
  countTokens, authorize: async () => true, ...options });

test('cross-project and cross-agent memories excluded before permissive authorization', async () => {
  const result = await compile([record('ok'), record('foreign-project', { projectId: 'private' }),
    record('foreign-agent', { agentId: 'nina' })]);
  assert.deepEqual(result.manifest.records.map(r => r.id), ['ok']);
});
test('DM memory unavailable in channel and derived summary inherits denial', async () => {
  const result = await compile([record('dm'), record('summary', { sourceIds: ['dm'] }), record('ok')],
    { authorize: async record => record.id !== 'dm' });
  assert.deepEqual(result.manifest.records.map(r => r.id), ['ok']);
});
test('missing and cyclic provenance fails closed', async () => {
  const result = await compile([record('missing', { sourceIds: ['absent'] }),
    record('a', { sourceIds: ['b'] }), record('b', { sourceIds: ['a'] })]);
  assert.equal(result.manifest.records.length, 0);
});
test('required decision cannot be silently dropped for token budget', async () => {
  const snapshot = { revision: 's1', requiredIds: ['rule'],
    records: [record('rule', { kind: 'decision', body: 'Long rule '.repeat(100) })] };
  await assert.rejects(compile([], { snapshot, budgetTokens: 100 }), { code: 'REQUIRED_CONTEXT_OVERFLOW' });
});
test('inaccessible, revoked or absent required facts block execution', async () => {
  for (const records of [[], [record('rule', { status: 'revoked' })]]) {
    await assert.rejects(compile([], { snapshot: { revision: 's1', requiredIds: ['rule'], records } }),
      { code: 'REQUIRED_CONTEXT_UNAVAILABLE' });
  }
  await assert.rejects(compile([], { snapshot: { revision: 's1', requiredIds: ['rule'], records: [record('rule')] },
    authorize: async () => false }), { code: 'REQUIRED_CONTEXT_UNAVAILABLE' });
});
test('conflicting authoritative decisions block execution', async () => {
  await assert.rejects(compile([], { snapshot: { revision: 's1', requiredIds: ['a', 'b'], records: [
    record('a', { kind: 'decision', factKey: 'publishing', body: 'approval' }),
    record('b', { kind: 'decision', factKey: 'publishing', body: 'automatic' })] } }), { code: 'CONTEXT_CONFLICT' });
});
test('optional learned memory cannot override required decision', async () => {
  const result = await compile([], { snapshot: { revision: 's1', requiredIds: ['rule'], records: [
    record('rule', { kind: 'decision', factKey: 'publish', body: 'approval' }),
    record('old', { factKey: 'publish', body: 'automatic', relevance: 99 })] } });
  assert.deepEqual(result.manifest.records.map(r => r.id), ['rule']);
});
test('deterministic context preserves identity across model changes', async () => {
  const a = await compile([record('b'), record('a')]);
  const b = await compile([record('a'), record('b')]);
  assert.equal(a.text, b.text);
  assert.equal(a.cacheKey, b.cacheKey);
  assert.equal(a.manifest.agentId, 'atlas');
  // Runtime model selection deliberately has no field in persona identity/context.
});
test('policy revision and destination isolate cache entries', async () => {
  const a = await compile([record('ok')]);
  for (const changed of [{ policyRevision: '2' }, { audienceId: 'dm-miguel' }, { actorId: 'friend' }]) {
    const b = await compile([record('ok')], { scope: { ...scope, ...changed } });
    assert.notEqual(a.cacheKey, b.cacheKey);
  }
});
test('optional records respect budget with mandatory records preserved', async () => {
  const snapshot = { revision: 's1', requiredIds: ['rule'], records: [record('rule', { kind: 'decision' }),
    record('big', { body: 'x'.repeat(5000), relevance: 9 }), record('small')] };
  const result = await compile([], { snapshot, budgetTokens: 400 });
  assert.ok(result.manifest.tokenCount <= 400);
  assert.ok(result.manifest.records.some(r => r.id === 'rule'));
  assert.ok(!result.manifest.records.some(r => r.id === 'big'));
});
test('input mutation during authorization cannot alter assembled snapshot', async () => {
  const mutable = record('rule');
  const result = await compile([mutable], { authorize: async () => { mutable.body = 'injected'; return true; } });
  assert.equal(JSON.parse(result.text).records[0].body, 'rule');
});
test('recall returns exact authorized subject/date events with stable cursor', async () => {
  const event = (sequence, overrides = {}) => ({ ...record('e' + sequence), sequence,
    subjectId: 'planning', occurredAt: '2026-11-03T13:00:00Z', type: 'message', ...overrides });
  const events = [event(1, { body: 'Original wording' }), event(2, { projectId: 'private' }),
    event(3, { subjectId: 'other' }), event(4, { body: 'DM secret' }), event(5),
    event(6, { occurredAt: '2026-11-02T13:00:00Z' }), event(7, { type: 'tool_trace' })];
  const options = { scope, events, subjectId: 'planning', since: '2026-11-03T00:00:00Z',
    until: '2026-11-03T23:59:59Z', authorize: async event => event.id !== 'e4', limit: 1 };
  const first = await recall(options);
  assert.equal(first.events[0].body, 'Original wording');
  const next = await recall({ ...options, afterSequence: first.nextSequence });
  assert.deepEqual(next.events.map(e => e.id), ['e5']);
});
test('recall rejects ambiguous timezones', async () => {
  await assert.rejects(recall({ scope, events: [], subjectId: 'a', since: '2026-11-03T12:00:00',
    authorize: async () => true }), { code: 'INVALID_TIMESTAMP' });
});
test('duplicate snapshot identifiers and invalid tokenizer fail visibly', async () => {
  await assert.rejects(compile([record('a'), record('a')]), { code: 'INVALID_SNAPSHOT' });
  await assert.rejects(compile([], { countTokens: () => NaN }), { code: 'INVALID_TOKEN_COUNT' });
});
