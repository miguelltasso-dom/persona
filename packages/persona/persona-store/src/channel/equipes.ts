/**
 * Item 22 (H22, contracts/equipes-e-canais.md "Ainda em aberto"): the equipes the PERSON assembles (beyond the organogram's sectors) and the categories that
 * group channels, with a position. Additive (migration v26). The fence does not change: who answers in a channel is still the channel's members, and `@equipe`
 * is still "the channel's own equipe". Nothing here wakes a persona; it is the layout and the roster the directory port reads.
 *
 * An equipe with `sourceId` mirrors an organogram sector (the sector stays the source of its members); one without it is the person's own and keeps its own members.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** The longest name of an equipe or a category (the sidebar shows it on one line). */
export const EQUIPE_NAME_MAX = 40

/** `@equipe` and `@time` already mean "the channel's own equipe" (`addressChannel`): an equipe cannot take them as a name. */
const RESERVED = new Set(['equipe', 'time'])

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').trim().toLocaleLowerCase('pt-BR')

/**
 * @param raw - A name typed by the person.
 * @returns The name, trimmed.
 * @throws StoreError `invalid-input` for an empty name, one over {@link EQUIPE_NAME_MAX}, a line break, an `@`, or a word `@equipe` already means.
 */
export function cleanEquipeName(raw: string): string {
  const name = raw.trim().replace(/\s+/gu, ' ')
  if (name === '' || [...name].length > EQUIPE_NAME_MAX) throw new StoreError('invalid-input', 'name-length')
  if (name.includes('@') || /[\r\n]/u.test(raw)) throw new StoreError('invalid-input', 'name-chars')
  if (RESERVED.has(fold(name))) throw new StoreError('invalid-input', 'name-reserved')
  return name
}

/** An equipe of a project. */
export interface Equipe {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly position: number
  readonly color?: string
  readonly icon?: string
  /** The organogram sector this equipe mirrors; absent = the person's own equipe. */
  readonly sourceId?: string
  readonly createdAt: string
  readonly archivedAt?: string
  /** Members the person put in it (a sector's members come from the organogram, not from here). */
  readonly personaIds: readonly string[]
}

/** A category that groups channels in the sidebar. */
export interface ChannelCategory {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly position: number
  readonly createdAt: string
}

const EQUIPE_SELECT = 'SELECT id, workspace_id, project_id, name, position, color, icon, source_id, created_at, archived_at FROM equipe'
const CATEGORY_SELECT = 'SELECT id, workspace_id, project_id, name, position, created_at FROM channel_category'

function readEquipe(row: Record<string, SQLOutputValue>, personaIds: readonly string[]): Equipe {
  const color = optionalText(row, 'color')
  const icon = optionalText(row, 'icon')
  const sourceId = optionalText(row, 'source_id')
  const archivedAt = optionalText(row, 'archived_at')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    name: text(row, 'name'),
    position: integer(row, 'position'),
    ...(color === undefined ? {} : { color }),
    ...(icon === undefined ? {} : { icon }),
    ...(sourceId === undefined ? {} : { sourceId }),
    createdAt: text(row, 'created_at'),
    ...(archivedAt === undefined ? {} : { archivedAt }),
    personaIds,
  }
}

function readCategory(row: Record<string, SQLOutputValue>): ChannelCategory {
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    name: text(row, 'name'),
    position: integer(row, 'position'),
    createdAt: text(row, 'created_at'),
  }
}

export class EquipeRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 26).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /** @param id - Equipe id. @returns The equipe (archived or not), with her members. */
  get(id: string): Equipe | undefined {
    const row = this.store.db.prepare(`${EQUIPE_SELECT} WHERE id = ?`).get(id)
    return row === undefined ? undefined : readEquipe(row, this.membersOf(id))
  }

  /**
   * @param projectId - Tenant project.
   * @param includeArchived - Also the archived ones (default: no).
   * @returns The equipes in screen order (position, then creation).
   */
  list(projectId: string, includeArchived = false): Equipe[] {
    const where = includeArchived ? '' : ' AND archived_at IS NULL'
    return this.store.db.prepare(`${EQUIPE_SELECT} WHERE project_id = ?${where} ORDER BY position, created_at, id`).all(projectId)
      .map(row => readEquipe(row, this.membersOf(text(row, 'id'))))
  }

  /**
   * Create an equipe. A name already taken in the project is a conflict the caller words (`duplicate-name`); a sector can be mirrored by only one.
   * @param input - Equipe fields.
   * @returns The new equipe.
   */
  create(input: {
    readonly id: string
    readonly workspaceId: string
    readonly projectId: string
    readonly name: string
    readonly color?: string
    readonly icon?: string
    readonly sourceId?: string
    readonly personaIds?: readonly string[]
  }): Equipe {
    const name = cleanEquipeName(input.name)
    if (this.nameTaken(input.projectId, name)) throw new StoreError('conflict', 'duplicate-name')
    const createdAt = this.now()
    const position = this.nextPosition(input.projectId)
    this.store.tx((db) => {
      run(
        db,
        'INSERT INTO equipe (id, workspace_id, project_id, name, position, color, icon, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [input.id, input.workspaceId, input.projectId, name, position, input.color ?? null, input.icon ?? null, input.sourceId ?? null, createdAt],
      )
      for (const personaId of new Set(input.personaIds ?? [])) {
        run(db, 'INSERT INTO equipe_member (equipe_id, persona_id, added_at) VALUES (?, ?, ?)', [input.id, personaId, createdAt])
      }
    })
    const made = this.get(input.id)
    if (made === undefined) throw new StoreError('not-found', input.id)
    return made
  }

  /**
   * @param id - Equipe id.
   * @param raw - New name (cleaned here).
   * @returns The renamed equipe.
   */
  rename(id: string, raw: string): Equipe {
    const current = this.require(id)
    const name = cleanEquipeName(raw)
    if (current.name === name) return current
    if (this.nameTaken(current.projectId, name, id)) throw new StoreError('conflict', 'duplicate-name')
    this.store.tx((db) => { run(db, 'UPDATE equipe SET name = ? WHERE id = ?', [name, id]) })
    return { ...current, name }
  }

  /**
   * Replace the members of an equipe the person made. An equipe that mirrors a sector keeps the organogram as its source: its members are not edited here.
   * @param id - Equipe id.
   * @param personaIds - The new list (deduplicated here).
   */
  setMembers(id: string, personaIds: readonly string[]): Equipe {
    const current = this.require(id)
    if (current.sourceId !== undefined) throw new StoreError('forbidden', 'sector-members')
    const at = this.now()
    this.store.tx((db) => {
      run(db, 'DELETE FROM equipe_member WHERE equipe_id = ?', [id])
      for (const personaId of new Set(personaIds)) run(db, 'INSERT INTO equipe_member (equipe_id, persona_id, added_at) VALUES (?, ?, ?)', [id, personaId, at])
    })
    return this.require(id)
  }

  /**
   * Archive (never delete). Idempotent: the first instant stays.
   * @param id - Equipe id.
   */
  archive(id: string): Equipe {
    const current = this.require(id)
    if (current.archivedAt !== undefined) return current
    const archivedAt = this.now()
    this.store.tx((db) => { run(db, 'UPDATE equipe SET archived_at = ? WHERE id = ?', [archivedAt, id]) })
    return { ...current, archivedAt }
  }

  /** @param id - Equipe id. @returns The equipe, active again. */
  unarchive(id: string): Equipe {
    const current = this.require(id)
    if (current.archivedAt === undefined) return current
    this.store.tx((db) => { run(db, 'UPDATE equipe SET archived_at = NULL WHERE id = ?', [id]) })
    return this.require(id)
  }

  private require(id: string): Equipe {
    const found = this.get(id)
    if (found === undefined) throw new StoreError('not-found', id)
    return found
  }

  private membersOf(id: string): string[] {
    return this.store.db.prepare('SELECT persona_id FROM equipe_member WHERE equipe_id = ? ORDER BY added_at, persona_id').all(id).map(row => text(row, 'persona_id'))
  }

  private nextPosition(projectId: string): number {
    const row = this.store.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM equipe WHERE project_id = ?').get(projectId)
    return row === undefined ? 0 : integer(row, 'next')
  }

  private nameTaken(projectId: string, name: string, exceptId?: string): boolean {
    const row = this.store.db.prepare('SELECT id FROM equipe WHERE project_id = ? AND name = ?').get(projectId, name)
    return row !== undefined && text(row, 'id') !== exceptId
  }
}

export class CategoryRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 26).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /** @param id - Category id. @returns The category. */
  get(id: string): ChannelCategory | undefined {
    const row = this.store.db.prepare(`${CATEGORY_SELECT} WHERE id = ?`).get(id)
    return row === undefined ? undefined : readCategory(row)
  }

  /** @param projectId - Tenant project. @returns The categories in screen order. */
  list(projectId: string): ChannelCategory[] {
    return this.store.db.prepare(`${CATEGORY_SELECT} WHERE project_id = ? ORDER BY position, created_at, id`).all(projectId).map(readCategory)
  }

  /**
   * @param input - Category fields.
   * @returns The new category, last in order.
   */
  create(input: { readonly id: string; readonly workspaceId: string; readonly projectId: string; readonly name: string }): ChannelCategory {
    const name = cleanEquipeName(input.name)
    if (this.nameTaken(input.projectId, name)) throw new StoreError('conflict', 'duplicate-name')
    const createdAt = this.now()
    const row = this.store.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM channel_category WHERE project_id = ?').get(input.projectId)
    const position = row === undefined ? 0 : integer(row, 'next')
    this.store.tx((db) => {
      run(db, 'INSERT INTO channel_category (id, workspace_id, project_id, name, position, created_at) VALUES (?, ?, ?, ?, ?, ?)', [input.id, input.workspaceId, input.projectId, name, position, createdAt])
    })
    return { id: input.id, workspaceId: input.workspaceId, projectId: input.projectId, name, position, createdAt }
  }

  /**
   * @param id - Category id.
   * @param raw - New name (cleaned here).
   */
  rename(id: string, raw: string): ChannelCategory {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const name = cleanEquipeName(raw)
    if (current.name === name) return current
    if (this.nameTaken(current.projectId, name, id)) throw new StoreError('conflict', 'duplicate-name')
    this.store.tx((db) => { run(db, 'UPDATE channel_category SET name = ? WHERE id = ?', [name, id]) })
    return { ...current, name }
  }

  /**
   * Put the categories of a project in this order (ids not named keep their relative order after the named ones).
   * @param projectId - Tenant project.
   * @param orderedIds - The wanted order.
   */
  reorder(projectId: string, orderedIds: readonly string[]): ChannelCategory[] {
    const all = this.list(projectId)
    const named = orderedIds.flatMap(id => all.filter(item => item.id === id))
    const rest = all.filter(item => !orderedIds.includes(item.id))
    this.store.tx((db) => {
      [...new Set([...named, ...rest])].forEach((item, index) => { run(db, 'UPDATE channel_category SET position = ? WHERE id = ?', [index, item.id]) })
    })
    return this.list(projectId)
  }

  /**
   * Remove a category: its channels fall back to "no category" (never deleted, `ON DELETE SET NULL`).
   * @param id - Category id.
   * @returns Whether there was one.
   */
  remove(id: string): boolean {
    if (this.get(id) === undefined) return false
    this.store.tx((db) => { run(db, 'DELETE FROM channel_category WHERE id = ?', [id]) })
    return true
  }

  /**
   * Where a channel sits: in a category (or none) and at which position among its neighbours. A category of ANOTHER project is refused (the tenant fence).
   * @param channelId - Channel id.
   * @param categoryId - Category id, or `undefined` for none.
   * @param position - Order inside the category (default: last).
   */
  placeChannel(channelId: string, categoryId: string | undefined, position?: number): void {
    const channel = this.store.db.prepare('SELECT project_id FROM channel WHERE id = ?').get(channelId)
    if (channel === undefined) throw new StoreError('not-found', channelId)
    if (categoryId !== undefined) {
      const category = this.get(categoryId)
      if (category === undefined) throw new StoreError('not-found', categoryId)
      if (category.projectId !== text(channel, 'project_id')) throw new StoreError('forbidden', 'other-project')
    }
    const projectId = text(channel, 'project_id')
    // The channels already in the target, in their order, without this one: the moved channel goes at the wanted position (default: last) and the group is renumbered 0..n-1.
    const neighbours = categoryId === undefined
      ? []
      : this.store.db.prepare('SELECT id FROM channel WHERE project_id = ? AND category_id = ? AND id <> ? ORDER BY position, id').all(projectId, categoryId, channelId).map(row => text(row, 'id'))
    const at = position === undefined ? neighbours.length : Math.max(0, Math.min(position, neighbours.length))
    const order = [...neighbours.slice(0, at), channelId, ...neighbours.slice(at)]
    this.store.tx((db) => {
      run(db, 'UPDATE channel SET category_id = ?, position = ? WHERE id = ?', [categoryId ?? null, categoryId === undefined ? 0 : at, channelId])
      if (categoryId !== undefined) order.forEach((id, index) => { run(db, 'UPDATE channel SET position = ? WHERE id = ?', [index, id]) })
    })
  }

  /** @param projectId - Tenant project. @returns Each channel's category and position (only the ones placed in a category). */
  placements(projectId: string): Array<{ readonly channelId: string; readonly categoryId: string; readonly position: number }> {
    return this.store.db.prepare('SELECT id, category_id, position FROM channel WHERE project_id = ? AND category_id IS NOT NULL ORDER BY category_id, position, id').all(projectId)
      .map(row => ({ channelId: text(row, 'id'), categoryId: text(row, 'category_id'), position: integer(row, 'position') }))
  }

  private nameTaken(projectId: string, name: string, exceptId?: string): boolean {
    const row = this.store.db.prepare('SELECT id FROM channel_category WHERE project_id = ? AND name = ?').get(projectId, name)
    return row !== undefined && text(row, 'id') !== exceptId
  }
}
