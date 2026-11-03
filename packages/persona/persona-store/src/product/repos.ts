/**
 * Product repositories: workspace, member, project, persona, participation, channel, dm.
 */

import { parsePersona, type Persona } from '@deepseek-ai/dsh-persona-core'
import type { SQLOutputValue } from 'node:sqlite'
import { PERSONAL_PROJECT_NAME } from '../constants.ts'
import { StoreError } from '../errors.ts'
import { integer, jsonValue, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'
import type {
  Channel,
  CreateChannelInput,
  CreateDmInput,
  CreateMemberInput,
  CreateProjectInput,
  CreateWorkspaceInput,
  DirectMessage,
  Member,
  Participation,
  Project,
  StoredPersona,
  Workspace,
} from './types.ts'

/** Clock used to stamp created/updated instants. */
export type ProductClock = () => string

/**
 * CRUD over the product tables. All writes go through {@link PersonaStore.tx}.
 * List methods return newest first.
 */
export class ProductRepos {
  readonly store: PersonaStore
  readonly now: ProductClock

  /**
   * @param store - Open Persona store.
   * @param now - Instant factory; defaults to `Date#toISOString`.
   */
  constructor(store: PersonaStore, now: ProductClock = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * Insert a workspace and its unique personal project ("Pessoal").
   * @param input - Workspace id/name and the personal project id.
   * @returns The workspace and the personal project.
   */
  createWorkspace(input: CreateWorkspaceInput): { workspace: Workspace; personal: Project } {
    const now = this.now()
    return this.store.tx((db) => {
      run(db, 'INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [input.id, input.name, now, now])
      run(db, 'INSERT INTO project (id, workspace_id, name, description, kind, root_path, created_at, updated_at) VALUES (?, ?, ?, \'\', \'personal\', NULL, ?, ?)', [input.personalProjectId, input.id, PERSONAL_PROJECT_NAME, now, now])
      return {
        workspace: { id: input.id, name: input.name, createdAt: now, updatedAt: now },
        personal: {
          id: input.personalProjectId,
          workspaceId: input.id,
          name: PERSONAL_PROJECT_NAME,
          description: '',
          kind: 'personal',
          createdAt: now,
          updatedAt: now,
        },
      }
    })
  }

  /**
   * @param id - Workspace id.
   * @returns The workspace or `undefined`.
   */
  getWorkspace(id: string): Workspace | undefined {
    const row = this.store.db.prepare(
      'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM workspace WHERE id = ?',
    ).get(id)
    return row === undefined ? undefined : readWorkspace(row)
  }

  /**
   * @returns Workspaces, newest first.
   */
  listWorkspaces(): Workspace[] {
    return this.store.db.prepare(
      'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM workspace ORDER BY created_at DESC, id DESC',
    ).all().map(readWorkspace)
  }

  /**
   * Update workspace name. Keeps rowid via ON CONFLICT.
   * @param id - Workspace id.
   * @param name - New name.
   * @returns The updated workspace.
   */
  updateWorkspace(id: string, name: string): Workspace {
    const current = this.getWorkspace(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at', [id, name, current.createdAt, now])
    })
    return { ...current, name, updatedAt: now }
  }

  /**
   * Create a shared project. Personal projects are created only by {@link ProductRepos.createWorkspace}.
   * @param input - Project fields.
   * @returns The inserted project.
   */
  createProject(input: CreateProjectInput): Project {
    if (this.getWorkspace(input.workspaceId) === undefined) {
      throw new StoreError('not-found', input.workspaceId)
    }
    const now = this.now()
    const description = input.description ?? ''
    this.store.tx((db) => {
      run(db, 'INSERT INTO project (id, workspace_id, name, description, kind, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, \'shared\', ?, ?, ?)', [input.id, input.workspaceId, input.name, description, input.rootPath ?? null, now, now])
    })
    return projectFrom({
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      description,
      kind: 'shared',
      createdAt: now,
      updatedAt: now,
      ...(input.rootPath === undefined ? {} : { rootPath: input.rootPath }),
    })
  }

  /**
   * @param id - Project id.
   * @returns The project or `undefined`.
   */
  getProject(id: string): Project | undefined {
    const row = this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, name, description, kind,
              root_path AS rootPath, created_at AS createdAt, updated_at AS updatedAt
       FROM project WHERE id = ?`,
    ).get(id)
    return row === undefined ? undefined : readProject(row)
  }

  /**
   * @param workspaceId - Workspace to list.
   * @returns Projects, newest first.
   */
  listProjects(workspaceId: string): Project[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, name, description, kind,
              root_path AS rootPath, created_at AS createdAt, updated_at AS updatedAt
       FROM project WHERE workspace_id = ? ORDER BY created_at DESC, id DESC`,
    ).all(workspaceId).map(readProject)
  }

  /**
   * Update a project's mutable fields. Refuses changing `kind`.
   * @param id - Project id.
   * @param patch - Name, description, and/or root path.
   * @returns The updated project.
   */
  updateProject(id: string, patch: { name?: string; description?: string; rootPath?: string | null }): Project {
    const current = this.getProject(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const now = this.now()
    const name = patch.name ?? current.name
    const description = patch.description ?? current.description
    const rootPath = patch.rootPath === undefined ? current.rootPath : (patch.rootPath ?? undefined)
    this.store.tx((db) => {
      run(db, 'INSERT INTO project (id, workspace_id, name, description, kind, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, root_path = excluded.root_path, updated_at = excluded.updated_at', [id, current.workspaceId, name, description, current.kind, rootPath ?? null, current.createdAt, now])
    })
    return projectFrom({
      id, workspaceId: current.workspaceId, name, description, kind: current.kind,
      createdAt: current.createdAt, updatedAt: now,
      ...(rootPath === undefined ? {} : { rootPath }),
    })
  }

  /**
   * Delete a shared project. The personal project cannot be removed.
   * @param id - Project id.
   */
  deleteProject(id: string): void {
    const current = this.getProject(id)
    if (current === undefined) throw new StoreError('not-found', id)
    if (current.kind === 'personal') throw new StoreError('constraint', 'personal-project')
    this.store.tx((db) => {
      run(db, 'DELETE FROM project WHERE id = ?', [id])
    })
  }

  /**
   * @param input - Member fields.
   * @returns The inserted member.
   */
  createMember(input: CreateMemberInput): Member {
    if (this.getWorkspace(input.workspaceId) === undefined) {
      throw new StoreError('not-found', input.workspaceId)
    }
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO member (id, workspace_id, display_name, handle, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [input.id, input.workspaceId, input.displayName, input.handle, input.role, now])
    })
    return { ...input, createdAt: now }
  }

  /**
   * @param id - Member id.
   * @returns The member or `undefined`.
   */
  getMember(id: string): Member | undefined {
    const row = this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, display_name AS displayName, handle, role, created_at AS createdAt
       FROM member WHERE id = ?`,
    ).get(id)
    return row === undefined ? undefined : readMember(row)
  }

  /**
   * @param workspaceId - Workspace to list.
   * @returns Members, newest first.
   */
  listMembers(workspaceId: string): Member[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, display_name AS displayName, handle, role, created_at AS createdAt
       FROM member WHERE workspace_id = ? ORDER BY created_at DESC, id DESC`,
    ).all(workspaceId).map(readMember)
  }

  /**
   * Update member display name, handle, or role.
   * @param id - Member id.
   * @param patch - Fields to change.
   * @returns The updated member.
   */
  updateMember(id: string, patch: { displayName?: string; handle?: string; role?: Member['role'] }): Member {
    const current = this.getMember(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next: Member = {
      ...current,
      displayName: patch.displayName ?? current.displayName,
      handle: patch.handle ?? current.handle,
      role: patch.role ?? current.role,
    }
    this.store.tx((db) => {
      run(db, 'INSERT INTO member (id, workspace_id, display_name, handle, role, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, handle = excluded.handle, role = excluded.role', [next.id, next.workspaceId, next.displayName, next.handle, next.role, next.createdAt])
    })
    return next
  }

  /**
   * Persist a persona after validating Forge's schema. Coordination is unique per project.
   * @param persona - Domain persona.
   * @param projectId - Tenant project.
   * @returns The stored persona.
   */
  createPersona(persona: Persona, projectId: string): StoredPersona {
    const parsed = parsePersona(persona)
    if (this.getProject(projectId) === undefined) throw new StoreError('not-found', projectId)
    this.assertCoordinationUnique(projectId, parsed, undefined)
    this.writePersona(parsed, projectId)
    return { ...parsed, projectId }
  }

  /**
   * @param id - Persona id.
   * @returns The stored persona or `undefined`.
   */
  getPersona(id: string): StoredPersona | undefined {
    const row = this.store.db.prepare('SELECT * FROM persona WHERE id = ?').get(id)
    return row === undefined ? undefined : personaFrom(row)
  }

  /**
   * @param projectId - Tenant project.
   * @returns Personas, newest first.
   */
  listPersonas(projectId: string): StoredPersona[] {
    return this.store.db.prepare(
      'SELECT * FROM persona WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    ).all(projectId).map(personaFrom)
  }

  /**
   * Replace a persona (ON CONFLICT keeps rowid). Coordination stays unique per project.
   * @param persona - Full replacement.
   * @param projectId - Tenant project.
   * @returns The stored persona.
   */
  updatePersona(persona: Persona, projectId: string): StoredPersona {
    const parsed = parsePersona(persona)
    const current = this.getPersona(parsed.id)
    if (current === undefined) throw new StoreError('not-found', parsed.id)
    if (current.projectId !== projectId) throw new StoreError('conflict', 'project-mismatch')
    this.assertCoordinationUnique(projectId, parsed, parsed.id)
    this.writePersona(parsed, projectId)
    return { ...parsed, projectId }
  }

  /**
   * @param id - Persona id.
   */
  deletePersona(id: string): void {
    if (this.getPersona(id) === undefined) throw new StoreError('not-found', id)
    this.store.tx((db) => {
      run(db, 'DELETE FROM persona WHERE id = ?', [id])
    })
  }

  /**
   * Add a participation. Idempotent on the primary key.
   * @param input - Participation fields.
   * @returns The participation.
   */
  addParticipation(input: Omit<Participation, 'createdAt'>): Participation {
    if (this.getPersona(input.personaId) === undefined) throw new StoreError('not-found', input.personaId)
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO participation (persona_id, project_id, kind, target_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(persona_id, kind, target_id) DO NOTHING', [input.personaId, input.projectId, input.kind, input.targetId, now])
    })
    const row = this.store.db.prepare(
      `SELECT persona_id AS personaId, project_id AS projectId, kind, target_id AS targetId, created_at AS createdAt
       FROM participation WHERE persona_id = ? AND kind = ? AND target_id = ?`,
    ).get(input.personaId, input.kind, input.targetId)
    if (row === undefined) throw new StoreError('not-found', input.personaId)
    return readParticipation(row)
  }

  /**
   * @param personaId - Persona to list.
   * @returns Participations, newest first.
   */
  listParticipations(personaId: string): Participation[] {
    return this.store.db.prepare(
      `SELECT persona_id AS personaId, project_id AS projectId, kind, target_id AS targetId, created_at AS createdAt
       FROM participation WHERE persona_id = ? ORDER BY created_at DESC, target_id DESC`,
    ).all(personaId).map(readParticipation)
  }

  /**
   * @param personaId - Persona.
   * @param kind - Participation kind.
   * @param targetId - Project or channel id.
   */
  removeParticipation(personaId: string, kind: Participation['kind'], targetId: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM participation WHERE persona_id = ? AND kind = ? AND target_id = ?', [personaId, kind, targetId])
    })
  }

  /**
   * @param input - Channel fields.
   * @returns The inserted channel.
   */
  createChannel(input: CreateChannelInput): Channel {
    if (this.getProject(input.projectId) === undefined) throw new StoreError('not-found', input.projectId)
    const now = this.now()
    const topic = input.topic ?? ''
    this.store.tx((db) => {
      run(db, 'INSERT INTO channel (id, workspace_id, project_id, name, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)', [input.id, input.workspaceId, input.projectId, input.name, topic, now])
    })
    return { id: input.id, workspaceId: input.workspaceId, projectId: input.projectId, name: input.name, topic, createdAt: now }
  }

  /**
   * @param id - Channel id.
   * @returns The channel or `undefined`.
   */
  getChannel(id: string): Channel | undefined {
    const row = this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, project_id AS projectId, name, topic, created_at AS createdAt
       FROM channel WHERE id = ?`,
    ).get(id)
    return row === undefined ? undefined : readChannel(row)
  }

  /**
   * @param projectId - Tenant project.
   * @returns Channels, newest first.
   */
  listChannels(projectId: string): Channel[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, project_id AS projectId, name, topic, created_at AS createdAt
       FROM channel WHERE project_id = ? ORDER BY created_at DESC, id DESC`,
    ).all(projectId).map(readChannel)
  }

  /**
   * @param id - Channel id.
   * @param patch - Name and/or topic.
   * @returns The updated channel.
   */
  updateChannel(id: string, patch: { name?: string; topic?: string }): Channel {
    const current = this.getChannel(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next: Channel = {
      ...current,
      name: patch.name ?? current.name,
      topic: patch.topic ?? current.topic,
    }
    this.store.tx((db) => {
      run(db, 'INSERT INTO channel (id, workspace_id, project_id, name, topic, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, topic = excluded.topic', [next.id, next.workspaceId, next.projectId, next.name, next.topic, next.createdAt])
    })
    return next
  }

  /**
   * @param id - Channel id.
   */
  deleteChannel(id: string): void {
    if (this.getChannel(id) === undefined) throw new StoreError('not-found', id)
    this.store.tx((db) => {
      run(db, 'DELETE FROM channel WHERE id = ?', [id])
    })
  }

  /**
   * Create a DM. Participants are ordered so (a,b) and (b,a) collide on the unique pair.
   * @param input - DM fields.
   * @returns The inserted (or existing) DM.
   */
  createDm(input: CreateDmInput): DirectMessage {
    if (this.getProject(input.projectId) === undefined) throw new StoreError('not-found', input.projectId)
    if (input.participantA === input.participantB) throw new StoreError('invalid-input', 'same-participant')
    const [participantA, participantB] = input.participantA < input.participantB
      ? [input.participantA, input.participantB]
      : [input.participantB, input.participantA]
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO dm (id, workspace_id, project_id, participant_a, participant_b, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, participant_a, participant_b) DO NOTHING', [input.id, input.workspaceId, input.projectId, participantA, participantB, now])
    })
    const row = this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
              participant_a AS participantA, participant_b AS participantB, created_at AS createdAt
       FROM dm WHERE project_id = ? AND participant_a = ? AND participant_b = ?`,
    ).get(input.projectId, participantA, participantB)
    if (row === undefined) throw new StoreError('not-found', input.id)
    return readDm(row)
  }

  /**
   * @param id - DM id.
   * @returns The DM or `undefined`.
   */
  getDm(id: string): DirectMessage | undefined {
    const row = this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
              participant_a AS participantA, participant_b AS participantB, created_at AS createdAt
       FROM dm WHERE id = ?`,
    ).get(id)
    return row === undefined ? undefined : readDm(row)
  }

  /**
   * @param projectId - Tenant project.
   * @returns DMs, newest first.
   */
  listDms(projectId: string): DirectMessage[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
              participant_a AS participantA, participant_b AS participantB, created_at AS createdAt
       FROM dm WHERE project_id = ? ORDER BY created_at DESC, id DESC`,
    ).all(projectId).map(readDm)
  }

  private writePersona(persona: Persona, projectId: string): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO persona (id, workspace_id, project_id, name, avatar_json, title, description, personality, instructions, runner_json, tools_json, skills_json, limits_json, schedule_json, reports_to, system_roles_json, can_recruit, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_json = excluded.avatar_json, title = excluded.title, description = excluded.description, personality = excluded.personality, instructions = excluded.instructions, runner_json = excluded.runner_json, tools_json = excluded.tools_json, skills_json = excluded.skills_json, limits_json = excluded.limits_json, schedule_json = excluded.schedule_json, reports_to = excluded.reports_to, system_roles_json = excluded.system_roles_json, can_recruit = excluded.can_recruit, updated_at = excluded.updated_at', [
        persona.id, persona.workspaceId, projectId, persona.name, JSON.stringify(persona.avatar),
        persona.title, persona.description, persona.personality, persona.instructions,
        JSON.stringify(persona.runner), JSON.stringify(persona.tools), JSON.stringify(persona.skills),
        JSON.stringify(persona.limits), persona.schedule === undefined ? null : JSON.stringify(persona.schedule),
        persona.reportsTo ?? null, JSON.stringify(persona.systemRoles), persona.canRecruit ? 1 : 0,
        persona.createdAt, persona.updatedAt, persona.createdBy,
      ])
    })
  }

  private assertCoordinationUnique(projectId: string, persona: Persona, exceptId: string | undefined): void {
    if (!persona.systemRoles.includes('coordination')) return
    const holders = this.listPersonas(projectId).filter(item =>
      item.systemRoles.includes('coordination') && item.id !== exceptId)
    if (holders.length > 0) throw new StoreError('constraint', 'COORDINATION_NOT_UNIQUE')
  }
}

function readWorkspace(row: Record<string, SQLOutputValue>): Workspace {
  return { id: text(row, 'id'), name: text(row, 'name'), createdAt: text(row, 'createdAt'), updatedAt: text(row, 'updatedAt') }
}

function readMember(row: Record<string, SQLOutputValue>): Member {
  const role = text(row, 'role')
  if (role !== 'owner' && role !== 'member' && role !== 'guest') throw new StoreError('constraint', 'role')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    displayName: text(row, 'displayName'),
    handle: text(row, 'handle'),
    role,
    createdAt: text(row, 'createdAt'),
  }
}

function readProject(row: Record<string, SQLOutputValue>): Project {
  const kind = text(row, 'kind')
  if (kind !== 'personal' && kind !== 'shared') throw new StoreError('constraint', 'kind')
  const rootPath = optionalText(row, 'rootPath')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    name: text(row, 'name'),
    description: text(row, 'description'),
    kind,
    createdAt: text(row, 'createdAt'),
    updatedAt: text(row, 'updatedAt'),
    ...(rootPath === undefined ? {} : { rootPath }),
  }
}

function readParticipation(row: Record<string, SQLOutputValue>): Participation {
  const kind = text(row, 'kind')
  if (kind !== 'project' && kind !== 'channel') throw new StoreError('constraint', 'kind')
  return {
    personaId: text(row, 'personaId'),
    projectId: text(row, 'projectId'),
    kind,
    targetId: text(row, 'targetId'),
    createdAt: text(row, 'createdAt'),
  }
}

function readChannel(row: Record<string, SQLOutputValue>): Channel {
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    projectId: text(row, 'projectId'),
    name: text(row, 'name'),
    topic: text(row, 'topic'),
    createdAt: text(row, 'createdAt'),
  }
}

function readDm(row: Record<string, SQLOutputValue>): DirectMessage {
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    projectId: text(row, 'projectId'),
    participantA: text(row, 'participantA'),
    participantB: text(row, 'participantB'),
    createdAt: text(row, 'createdAt'),
  }
}

function personaFrom(row: Record<string, SQLOutputValue>): StoredPersona {
  const scheduleJson = optionalText(row, 'schedule_json')
  const reportsTo = optionalText(row, 'reports_to')
  const parsed = parsePersona({
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    name: text(row, 'name'),
    avatar: jsonValue(text(row, 'avatar_json')),
    title: text(row, 'title'),
    description: text(row, 'description'),
    personality: text(row, 'personality'),
    instructions: text(row, 'instructions'),
    runner: jsonValue(text(row, 'runner_json')),
    tools: jsonValue(text(row, 'tools_json')),
    skills: jsonValue(text(row, 'skills_json')),
    limits: jsonValue(text(row, 'limits_json')),
    systemRoles: jsonValue(text(row, 'system_roles_json')),
    canRecruit: integer(row, 'can_recruit') === 1,
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    createdBy: text(row, 'created_by'),
    ...(scheduleJson === undefined ? {} : { schedule: jsonValue(scheduleJson) }),
    ...(reportsTo === undefined ? {} : { reportsTo }),
  })
  return { ...parsed, projectId: text(row, 'project_id') }
}

function projectFrom(row: {
  id: string
  workspaceId: string
  name: string
  description: string
  kind: Project['kind']
  createdAt: string
  updatedAt: string
  rootPath?: string
}): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    kind: row.kind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.rootPath === undefined ? {} : { rootPath: row.rootPath }),
  }
}
