/**
 * Private "Ensinar a persona" recordings and skill drafts (WAVE2 §2).
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Local recording + optional numbered skill draft. Never auto-activates. */
export interface TeachArtifact {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  readonly status: 'recording' | 'processing' | 'draft' | 'discarded'
  readonly filename: string
  readonly hash: string
  readonly bytes: number
  readonly transcript: string
  readonly skillDraft: string
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Persist private teach artifacts. Skill draft is text; activation stays on ScreensHost.
 */
export class TeachRepos {
  readonly store: PersonaStore
  now: () => string

  /**
   * @param store - Open store (schema ≥ 14).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param input - New private recording.
   */
  create(input: {
    id: string
    workspaceId: string
    projectId: string
    personaId: string
    filename: string
    hash?: string
    bytes?: number
    status?: TeachArtifact['status']
  }): TeachArtifact {
    const now = this.now()
    const row: TeachArtifact = {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      personaId: input.personaId,
      status: input.status ?? 'recording',
      filename: input.filename,
      hash: input.hash ?? '',
      bytes: input.bytes ?? 0,
      transcript: '',
      skillDraft: '',
      createdAt: now,
      updatedAt: now,
    }
    this.write(row)
    return row
  }

  /**
   * @param id - Artifact.
   */
  get(id: string): TeachArtifact | undefined {
    const row = this.store.db.prepare('SELECT * FROM teach_artifact WHERE id = ?').get(id)
    return row === undefined ? undefined : teachFrom(row)
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona.
   */
  list(projectId: string, personaId: string): TeachArtifact[] {
    return this.store.db.prepare(
      'SELECT * FROM teach_artifact WHERE project_id = ? AND persona_id = ? AND status != \'discarded\' ORDER BY created_at DESC, id DESC',
    ).all(projectId, personaId).map(teachFrom)
  }

  /**
   * Attach transcript and a numbered skill draft. Status becomes `draft`. Never enables the skill.
   * @param id - Artifact.
   * @param transcript - Narration or typed explanation.
   * @param skillDraft - Numbered steps (markdown).
   */
  putDraft(id: string, transcript: string, skillDraft: string): TeachArtifact {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next: TeachArtifact = {
      ...current,
      status: 'draft',
      transcript,
      skillDraft,
      updatedAt: this.now(),
    }
    this.write(next)
    return next
  }

  /**
   * Soft-discard. File bytes stay the caller's problem (host deletes blob).
   * @param id - Artifact.
   */
  discard(id: string): TeachArtifact {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next: TeachArtifact = { ...current, status: 'discarded', updatedAt: this.now() }
    this.write(next)
    return next
  }

  /**
   * Hard-delete recordings older than `retentionDays`. No schema bump — cutoff is `created_at`.
   * @param nowIso - Clock.
   * @param retentionDays - Keep window (WAVE2 default 30).
   * @param projectId - Optional tenant filter.
   */
  purgeExpired(nowIso: string, retentionDays: number, projectId?: string): TeachArtifact[] {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new StoreError('invalid-input', 'retentionDays')
    const cutoff = Date.parse(nowIso) - retentionDays * 86_400_000
    if (!Number.isFinite(cutoff)) throw new StoreError('invalid-input', 'nowIso')
    const rows = projectId === undefined
      ? this.store.db.prepare('SELECT * FROM teach_artifact').all()
      : this.store.db.prepare('SELECT * FROM teach_artifact WHERE project_id = ?').all(projectId)
    const gone: TeachArtifact[] = []
    for (const raw of rows) {
      const item = teachFrom(raw)
      if (Date.parse(item.createdAt) > cutoff) continue
      this.store.tx((db) => {
        run(db, 'DELETE FROM teach_artifact WHERE id = ?', [item.id])
      })
      gone.push(item)
    }
    return gone
  }

  private write(row: TeachArtifact): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO teach_artifact (id, workspace_id, project_id, persona_id, status, filename, hash, bytes, transcript, skill_draft_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, filename = excluded.filename, hash = excluded.hash, bytes = excluded.bytes, transcript = excluded.transcript, skill_draft_json = excluded.skill_draft_json, updated_at = excluded.updated_at', [
        row.id, row.workspaceId, row.projectId, row.personaId, row.status, row.filename,
        row.hash, row.bytes, row.transcript, row.skillDraft, row.createdAt, row.updatedAt,
      ])
    })
  }
}

function teachFrom(row: Record<string, SQLOutputValue>): TeachArtifact {
  const status = text(row, 'status')
  if (status !== 'recording' && status !== 'processing' && status !== 'draft' && status !== 'discarded') {
    throw new StoreError('constraint', 'status')
  }
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    personaId: text(row, 'persona_id'),
    status,
    filename: text(row, 'filename'),
    hash: text(row, 'hash'),
    bytes: integer(row, 'bytes'),
    transcript: text(row, 'transcript'),
    skillDraft: text(row, 'skill_draft_json'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  }
}
