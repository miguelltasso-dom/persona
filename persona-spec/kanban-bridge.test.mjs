import test from 'node:test';
import assert from 'node:assert/strict';
import { KanbanBridge } from './kanban-bridge.mjs';

const scope = { teamId: 'miguel', projectId: 'launch', rootSessionId: 'root-launch',
  personaId: 'atlas', actorId: 'miguel' };
const ref = { teamId: 'miguel', projectId: 'launch', rootSessionId: 'root-launch', nativeTaskId: 'task-1' };
const task = (overrides = {}) => ({ id: 'task-1', revision: 1, subject: 'Pesquisa', description: 'Referencias',
  status: 'pending', blockedBy: [], writeScopes: [], ready: true, writeScopeWarnings: [], ...overrides });
function fixture(overrides = {}) {
  const calls = [];
  const caller = { identity: Symbol('exact live agent') };
  let current = task();
  const teams = {
    isEnabled: () => true,
    listTasks: () => [current], getTask: () => current,
    createTask: async (agent, request, signal) => {
      calls.push({ agent, request, signal }); current = task(request); return current;
    },
    updateTask: async (agent, request, signal) => {
      calls.push({ agent, request, signal });
      if (request.expectedRevision !== current.revision) throw Object.assign(new Error('stale'), { code: 'TEAM_TASK_STALE_REVISION' });
      current = task({ ...current, revision: current.revision + 1,
        status: request.action === 'claim' ? 'in_progress' : request.action === 'complete' ? 'completed' : current.status,
        ownerId: request.action === 'claim' ? 'session-atlas' : request.owner ?? current.ownerId });
      return current;
    }
  };
  const options = { teams, authorize: async () => true,
    resolveCaller: async () => ({ caller, sessionId: 'session-atlas', personaId: 'atlas', rootSessionId: 'root-launch' }),
    resolvePersona: async id => id === 'session-atlas' ? 'atlas' : id === 'session-bento' ? 'bento' : null,
    resolveTarget: async id => ({ sessionId: 'session-' + id, personaId: id, rootSessionId: 'root-launch' }), ...overrides };
  return { bridge: new KanbanBridge(options), calls, caller, teams, options,
    setTask: value => { current = value; } };
}

test('native board is projected into scoped kanban references and persistent persona labels', async () => {
  const f = fixture(); f.setTask(task({ status: 'in_progress', ownerId: 'session-atlas' }));
  const [result] = await f.bridge.list(scope);
  assert.deepEqual(result.ref, ref); assert.equal(result.ownerPersonaId, 'atlas'); assert.equal(result.column, 'doing');
});
test('dependencies produce blocked column and deleted tombstones stay out of active board', async () => {
  const f = fixture(); f.setTask(task({ ready: false }));
  assert.equal((await f.bridge.list(scope))[0].column, 'blocked');
  f.setTask(task({ status: 'deleted' })); assert.deepEqual(await f.bridge.list(scope), []);
});
test('create forwards native contract and exact caller without extra approval', async () => {
  const f = fixture(); const signal = new AbortController().signal;
  await f.bridge.create(scope, { title: 'Revisar', description: 'Revisao', blockedBy: [ref], writeScopes: ['src'] }, { signal });
  assert.equal(f.calls[0].agent, f.caller); assert.equal(f.calls[0].signal, signal);
  assert.deepEqual(f.calls[0].request, { subject: 'Revisar', description: 'Revisao', blockedBy: ['task-1'], writeScopes: ['src'] });
});
test('agent claims and completes with native revisions', async () => {
  const f = fixture();
  const claimed = await f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'claim' });
  assert.equal(claimed.revision, 2); assert.equal(claimed.column, 'doing');
  const done = await f.bridge.update(scope, { task: ref, expectedRevision: 2, action: 'complete' });
  assert.equal(done.revision, 3); assert.equal(done.column, 'done');
});
test('stale mutations are surfaced, never retried with a newer revision', async () => {
  const f = fixture();
  await f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'claim' });
  await assert.rejects(f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'complete' }), { code: 'TEAM_TASK_STALE_REVISION' });
  assert.equal(f.calls.length, 2);
});
test('tasks and dependency references cannot cross project/team/root boundaries', async () => {
  for (const delta of [{ projectId: 'private' }, { teamId: 'friends' }, { rootSessionId: 'other-root' }]) {
    const f = fixture();
    await assert.rejects(f.bridge.get(scope, { ...ref, ...delta }), { code: 'WRONG_BOARD' });
    await assert.rejects(f.bridge.create(scope, { title: 'a', description: '', blockedBy: [{ ...ref, ...delta }] }), { code: 'WRONG_BOARD' });
    assert.equal(f.calls.length, 0);
  }
});
test('forbidden and read-only scopes cannot mutate through adapter', async () => {
  const f = fixture({ authorize: async (_scope, operation) => operation === 'read' });
  assert.equal((await f.bridge.list(scope)).length, 1);
  await assert.rejects(f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'claim' }), { code: 'FORBIDDEN' });
  assert.equal(f.calls.length, 0);
});
test('invalid runtime bindings and disabled native Team mode stop execution', async () => {
  const f = fixture({ resolveCaller: async () => ({ caller: {}, sessionId: 'x', personaId: 'atlas', rootSessionId: 'other' }) });
  await assert.rejects(f.bridge.list(scope), { code: 'INVALID_BINDING' });
  const g = fixture(); g.teams.isEnabled = () => false;
  await assert.rejects(g.bridge.list(scope), { code: 'TEAM_MODE_DISABLED' });
});
test('persona reassignment maps to a live session without replacing caller by lead', async () => {
  const f = fixture();
  await f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'reassign', fields: { ownerPersonaId: 'bento' } });
  assert.equal(f.calls[0].request.owner, 'session-bento'); assert.equal(f.calls[0].agent, f.caller);
  const nativeError = Object.assign(new Error('lead only'), { code: 'TEAM_TASK_FORBIDDEN' });
  f.teams.updateTask = async () => { throw nativeError; };
  await assert.rejects(f.bridge.update(scope, { task: ref, expectedRevision: 2, action: 'reassign', fields: { ownerPersonaId: 'bento' } }), error => error === nativeError);
});
test('cross-root reassignment fails before native mutation', async () => {
  const f = fixture({ resolveTarget: async () => ({ sessionId: 'bento', personaId: 'bento', rootSessionId: 'other' }) });
  await assert.rejects(f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'reassign', fields: { ownerPersonaId: 'bento' } }), { code: 'INVALID_TARGET' });
  assert.equal(f.calls.length, 0);
});
test('native uncertain-persistence error is propagated without duplicate creation', async () => {
  const f = fixture(); let attempts = 0;
  const error = Object.assign(new Error('read before retry'), { code: 'TEAM_TASK_PERSISTENCE_UNCONFIRMED' });
  f.teams.createTask = async () => { attempts++; throw error; };
  await assert.rejects(f.bridge.create(scope, { title: 'a', description: '' }), caught => caught === error);
  assert.equal(attempts, 1);
});
test('cancellation and permission revocation during resolution prevent mutation', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.bridge.create(scope, { title: 'a', description: '' }, { signal: controller.signal }), { name: 'AbortError' });
  let permitted = true;
  const g = fixture({ authorize: async () => permitted,
    resolveTarget: async () => { permitted = false; return { personaId: 'bento', sessionId: 'bento', rootSessionId: 'root-launch' }; } });
  await assert.rejects(g.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'reassign', fields: { ownerPersonaId: 'bento' } }), { code: 'FORBIDDEN' });
  assert.equal(g.calls.length, 0);
});
test('commands cannot smuggle actor identity or invent unsupported review status', async () => {
  const f = fixture();
  assert.throws(() => f.bridge.create(scope, { title: 'a', description: '', actorId: 'lead' }), { code: 'INVALID_COMMAND' });
  assert.throws(() => f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'review' }), { code: 'INVALID_COMMAND' });
  assert.throws(() => f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'claim', fields: { owner: 'lead' } }), { code: 'INVALID_COMMAND' });
});

test('authorization revoked during post-commit persona resolution withholds result without retry', async () => {
  let permitted = true;
  const f = fixture({ authorize: async () => permitted,
    resolvePersona: async () => { permitted = false; return 'atlas'; } });
  await assert.rejects(f.bridge.update(scope, { task: ref, expectedRevision: 1, action: 'claim' }),
    { code: 'TASK_COMMITTED_RESULT_UNAVAILABLE' });
  assert.equal(f.calls.length, 1);
});

test('a lost response after native create is distinguishable from a failed mutation', async () => {
  const f = fixture();
  f.teams.createTask = async (agent, request) => {
    f.calls.push({ agent, request }); return task({ status: 'future-native-status' });
  };
  await assert.rejects(f.bridge.create(scope, { title: 'a', description: '' }), error =>
    error.code === 'TASK_COMMITTED_RESULT_UNAVAILABLE' && error.cause.code === 'UNSUPPORTED_NATIVE_STATUS');
  assert.equal(f.calls.length, 1);
});
