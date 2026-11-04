/**
 * Synthetic tenant for host scale benches. Bulk SQL — never goes through ingest.
 */

import type { DatabaseSync } from 'node:sqlite'
import { run } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Counts Atlas asked for. */
export const SCALE = {
  projects: 10,
  personas: 30,
  tasks: 1_000,
  messages: 10_000,
} as const

const CLOCK = '2026-11-03T15:00:00.000Z'
const TICKET_BODY = JSON.stringify({
  id: 't',
  title: 'Tarefa de carga',
  decisionId: 'd',
  mandate: {
    strength: 'explicit',
    policyVersion: 'v1',
    basis: { via: 'listed' },
    actor: { source: 'channel', id: 'ana' },
    scope: 'small',
  },
  channels: [],
  assignments: [],
  inputs: [],
  undelivered: [],
  createdAt: CLOCK,
  updatedAt: CLOCK,
  origin: { triggerId: 'e', triggerIds: ['e'] },
})

/**
 * Fill one workspace: 10 projects, 30 personas, 10k messages, 1k tickets.
 * @param store - Open file-backed store (WAL).
 */
export function seedScaleWorkspace(store: PersonaStore): { workspaceId: string; projectId: string; channelId: string } {
  const workspaceId = 'scale-ws'
  const firstProject = 'scale-p0'
  const firstChannel = 'scale-ch0'
  store.tx((db) => {
    run(db, 'INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      workspaceId, 'Escala', CLOCK, CLOCK,
    ])
    run(db, 'INSERT INTO member (id, workspace_id, display_name, handle, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      'ana', workspaceId, 'Ana', 'ana', 'owner', CLOCK,
    ])
    for (let p = 0; p < SCALE.projects; p += 1) {
      const projectId = `scale-p${p}`
      const kind = p === 0 ? 'personal' : 'shared'
      run(db, 'INSERT INTO project (id, workspace_id, name, description, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        projectId, workspaceId, `Projeto ${p}`, '', kind, CLOCK, CLOCK,
      ])
      const channelId = `scale-ch${p}`
      run(db, 'INSERT INTO channel (id, workspace_id, project_id, name, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        channelId, workspaceId, projectId, 'geral', '', CLOCK,
      ])
      const streamId = `channel:${channelId}`
      run(db, 'INSERT INTO stream (id, workspace_id, project_id, kind, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        streamId, workspaceId, projectId, 'channel', channelId, CLOCK,
      ])
      run(db, 'INSERT INTO stream_cursor (stream_id, last_seq) VALUES (?, 0)', [streamId])
    }
    for (let i = 0; i < SCALE.personas; i += 1) {
      const projectId = `scale-p${i % SCALE.projects}`
      insertPersona(db, workspaceId, projectId, i)
    }
    const perProject = Math.floor(SCALE.messages / SCALE.projects)
    for (let p = 0; p < SCALE.projects; p += 1) {
      insertMessages(db, workspaceId, `scale-p${p}`, `scale-ch${p}`, perProject, p * perProject)
    }
    const leftover = SCALE.messages - perProject * SCALE.projects
    if (leftover > 0) insertMessages(db, workspaceId, firstProject, firstChannel, leftover, perProject * SCALE.projects)
    const perTasks = Math.floor(SCALE.tasks / SCALE.projects)
    for (let p = 0; p < SCALE.projects; p += 1) {
      insertTickets(db, `scale-p${p}`, perTasks, p * perTasks)
    }
    const leftoverTasks = SCALE.tasks - perTasks * SCALE.projects
    if (leftoverTasks > 0) insertTickets(db, firstProject, leftoverTasks, perTasks * SCALE.projects)
  })
  return { workspaceId, projectId: firstProject, channelId: firstChannel }
}

function insertPersona(db: DatabaseSync, workspaceId: string, projectId: string, i: number): void {
  const id = `scale-persona-${i}`
  const roles = i === 0 ? '["coordination"]' : '[]'
  run(db, `INSERT INTO persona (id, workspace_id, project_id, name, avatar_json, title, description, personality, instructions, runner_json, tools_json, skills_json, limits_json, system_roles_json, can_recruit, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`, [
    id, workspaceId, projectId, `Persona ${i}`, '{"kind":"gallery","ref":"bento"}',
    'Cargo', 'Desc', 'Calma.', 'Trabalhe.', '{"kind":"dsh","cli":"","model":"m"}',
    '{}', '[]', '{}', roles, CLOCK, CLOCK, 'ana',
  ])
}

function insertMessages(
  db: DatabaseSync,
  workspaceId: string,
  projectId: string,
  channelId: string,
  count: number,
  start: number,
): void {
  const streamId = `channel:${channelId}`
  const insert = db.prepare(
    'INSERT INTO event (id, stream_id, workspace_id, project_id, seq, type, body, actor_id, subject_id, occurred_at, occurred_at_utc, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
  )
  for (let i = 0; i < count; i += 1) {
    const seq = i + 1
    const n = start + i
    const at = Date.parse(CLOCK) + n
    insert.run(
      `scale-msg-${n}`, streamId, workspaceId, projectId, seq, 'message',
      n % 97 === 0 ? `needle escala ${n}` : `mensagem de carga ${n}`,
      'ana', `scale-msg-${n}`, CLOCK, at,
    )
  }
  run(db, 'UPDATE stream_cursor SET last_seq = ? WHERE stream_id = ?', [count, streamId])
}

function insertTickets(db: DatabaseSync, projectId: string, count: number, start: number): void {
  const insert = db.prepare(
    'INSERT INTO engine_ticket (project_id, id, updated_at, stage, stage_action, ended, undelivered_len, assignment_state, body) VALUES (?, ?, ?, ?, NULL, 0, 0, NULL, ?)',
  )
  for (let i = 0; i < count; i += 1) {
    const id = `scale-t-${start + i}`
    insert.run(projectId, id, CLOCK, 'todo', TICKET_BODY.replace('"id":"t"', `"id":"${id}"`))
  }
}
