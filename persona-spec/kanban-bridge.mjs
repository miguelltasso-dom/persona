// Adapter to the documented ctx.agentTeams API. No second task database or
// replacement agent loop: native task commits remain the execution authority.
export class KanbanError extends Error {
  constructor(code, options) { super(code, options); this.name = 'KanbanError'; this.code = code; }
}
const fail = code => { throw new KanbanError(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const scopeFields = ['teamId', 'projectId', 'rootSessionId', 'personaId', 'actorId'];
const actions = {
  claim: [], release: [], complete: [], reopen: [], delete: [],
  edit: ['subject', 'description', 'writeScopes'],
  set_dependencies: ['blockedBy'], reassign: ['ownerPersonaId']
};
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_COMMAND');
}
function stringList(value) {
  if (!Array.isArray(value) || value.some(item => !text(item))) fail('INVALID_COMMAND');
  return [...value];
}
function taskId(value) {
  if (typeof value !== 'string' || !/^task-[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value.slice(5)))) fail('INVALID_TASK_ID');
  return value;
}
function nativeId(ref, scope) {
  if (!ref || ['teamId', 'projectId', 'rootSessionId'].some(key => ref[key] !== scope[key])) {
    fail('WRONG_BOARD');
  }
  return taskId(ref.nativeTaskId);
}

export class KanbanBridge {
  constructor({ teams, authorize, resolveCaller, resolvePersona, resolveTarget }) {
    for (const key of ['isEnabled', 'listTasks', 'getTask', 'createTask', 'updateTask']) {
      if (typeof teams?.[key] !== 'function') fail('INVALID_ADAPTER');
    }
    if ([authorize, resolveCaller, resolvePersona, resolveTarget].some(fn => typeof fn !== 'function')) {
      fail('INVALID_ADAPTER');
    }
    this.teams = teams;
    this.authorize = authorize;
    this.resolveCaller = resolveCaller;
    this.resolvePersona = resolvePersona;
    this.resolveTarget = resolveTarget;
  }

  async withCaller(scope, operation, signal, body) {
    // Scope is supplied by authenticated host/run services, never tool arguments.
    scope = structuredClone(scope);
    if (scopeFields.some(key => !text(scope?.[key]))) fail('INVALID_SCOPE');
    Object.freeze(scope);
    signal?.throwIfAborted();
    if (await this.authorize(scope, operation) !== true) fail('FORBIDDEN');
    const binding = await this.resolveCaller(scope);
    if (!binding?.caller || binding.rootSessionId !== scope.rootSessionId ||
        binding.personaId !== scope.personaId || !text(binding.sessionId)) fail('INVALID_BINDING');
    signal?.throwIfAborted();
    if (!this.teams.isEnabled(binding.caller)) fail('TEAM_MODE_DISABLED');
    const recheck = async () => {
      signal?.throwIfAborted();
      if (await this.authorize(scope, operation) !== true) fail('FORBIDDEN');
      signal?.throwIfAborted();
    };
    await recheck();
    return body(scope, binding, recheck);
  }

  async project(scope, task) {
    // Review/manual blocking need an explicit native extension. Do not infer
    // review from prose or pretend to store it in native status.
    if (!['pending', 'in_progress', 'completed', 'deleted'].includes(task.status)) fail('UNSUPPORTED_NATIVE_STATUS');
    let column = task.status === 'completed' ? 'done' : task.status === 'in_progress' ? 'doing' : 'todo';
    if (task.status === 'deleted') column = 'archived';
    else if (task.status !== 'completed' && task.ready === false) column = 'blocked';
    const ownerPersonaId = task.ownerId ? await this.resolvePersona(task.ownerId, scope) : null;
    return {
      ref: { teamId: scope.teamId, projectId: scope.projectId,
        rootSessionId: scope.rootSessionId, nativeTaskId: task.id },
      revision: task.revision, title: task.subject, description: task.description,
      nativeStatus: task.status, column, ownerPersonaId: ownerPersonaId ?? null,
      ownerSessionId: task.ownerId ?? null, ready: task.ready,
      blockedBy: task.blockedBy.map(id => ({ teamId: scope.teamId, projectId: scope.projectId,
        rootSessionId: scope.rootSessionId, nativeTaskId: id })),
      writeScopeWarnings: [...task.writeScopeWarnings]
    };
  }

  async discloseCommit(scope, committed, recheck) {
    try {
      const result = await this.project(scope, committed);
      await recheck();
      return result;
    } catch (cause) {
      // The host must not retry a committed create because response disclosure
      // failed or cancellation arrived after commit. Do not reveal task details.
      throw new KanbanError('TASK_COMMITTED_RESULT_UNAVAILABLE', { cause });
    }
  }

  list(scope, { signal } = {}) {
    return this.withCaller(scope, 'read', signal, async (scope, binding, recheck) => {
      const tasks = this.teams.listTasks(binding.caller);
      const projected = await Promise.all(tasks.filter(task => task.status !== 'deleted')
        .map(task => this.project(scope, task)));
      await recheck();
      return projected;
    });
  }

  get(scope, ref, { signal } = {}) {
    ref = structuredClone(ref);
    return this.withCaller(scope, 'read', signal, async (scope, binding, recheck) => {
      const result = await this.project(scope, this.teams.getTask(binding.caller, nativeId(ref, scope)));
      await recheck();
      return result;
    });
  }

  create(scope, command, { signal } = {}) {
    command = structuredClone(command);
    keys(command, ['title', 'description', 'blockedBy', 'writeScopes']);
    if (!text(command.title) || typeof command.description !== 'string') fail('INVALID_COMMAND');
    return this.withCaller(scope, 'write', signal, async (scope, binding, recheck) => {
      const request = { subject: command.title, description: command.description };
      if (command.blockedBy !== undefined) {
        if (!Array.isArray(command.blockedBy)) fail('INVALID_COMMAND');
        request.blockedBy = command.blockedBy.map(ref => nativeId(ref, scope));
      }
      if (command.writeScopes !== undefined) request.writeScopes = stringList(command.writeScopes);
      await recheck();
      // No automatic retry: dsh can report a visible task with unconfirmed persistence.
      const committed = await this.teams.createTask(binding.caller, request, signal);
      // The mutation is committed even if a later read loses authorization.
      // Return its task value only after disclosure has been checked again.
      return this.discloseCommit(scope, committed, recheck);
    });
  }

  update(scope, command, { signal } = {}) {
    command = structuredClone(command);
    keys(command, ['task', 'expectedRevision', 'action', 'fields']);
    if (!Object.hasOwn(actions, command.action) || !Number.isInteger(command.expectedRevision) ||
        command.expectedRevision < 1) fail('INVALID_COMMAND');
    const fields = command.fields ?? {};
    keys(fields, actions[command.action]);
    return this.withCaller(scope, 'write', signal, async (scope, binding, recheck) => {
      const request = { taskId: nativeId(command.task, scope), expectedRevision: command.expectedRevision,
        action: command.action };
      for (const key of ['subject', 'description']) {
        if (fields[key] !== undefined) {
          if (typeof fields[key] !== 'string' || (key === 'subject' && !text(fields[key]))) fail('INVALID_COMMAND');
          request[key] = fields[key];
        }
      }
      if (fields.writeScopes !== undefined) request.writeScopes = stringList(fields.writeScopes);
      if (command.action === 'set_dependencies') {
        if (!Array.isArray(fields.blockedBy)) fail('INVALID_COMMAND');
        request.blockedBy = fields.blockedBy.map(ref => nativeId(ref, scope));
      }
      if (command.action === 'reassign') {
        if (!text(fields.ownerPersonaId)) fail('INVALID_COMMAND');
        const target = await this.resolveTarget(fields.ownerPersonaId, scope);
        if (!target || target.rootSessionId !== scope.rootSessionId ||
            target.personaId !== fields.ownerPersonaId || !text(target.sessionId)) fail('INVALID_TARGET');
        request.owner = target.sessionId;
      }
      await recheck();
      // Native dsh validates ownership, DAG, readiness, lead-only reassignment,
      // expected revision and cancellation. Never replace caller with the Lead.
      const committed = await this.teams.updateTask(binding.caller, request, signal);
      return this.discloseCommit(scope, committed, recheck);
    });
  }
}
