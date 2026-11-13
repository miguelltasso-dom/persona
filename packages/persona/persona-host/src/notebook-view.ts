/**
 * D-118 · O Caderno da persona (COLHEITA-MUSE 33c): what ONE persona keeps to work the way the owner likes, read from what the host really has. Nothing is invented and nothing is counted by the client:
 *  - `sabe-fazer`: the kinds of work of the playbook with at least one accepted delivery (and "virou skill" when it became one);
 *  - `como-gosta`: the RULES the owner asked the team to keep (a Cofre `constraint` with the proof of who said it), for the whole team or only for this persona (said in her DM);
 *  - `aprendizados`: the FACTS the owner asked to remember (a `memory` with the proof), same two scopes;
 *  - `erros`: what the owner asked to change on a kind of work (the adjustments of the playbook; no date: the playbook keeps none).
 * Learning by Task (feedback-learn of the engine) is not wired to the host, so nothing of it is shown.
 *
 * Privacy (Keel 12/11 16:35, veto): what came from a DM is for who was in it, and ONLY for them. A reader who was not in the DM gets a notebook identical to the one of a world where that DM never
 * happened: no item, no count, no line saying something is hidden, no name. The one in the DM reads the item with `private: { visibleTo: 'me' }` (and the section too when all of it is private).
 * The client never works out what is private: it draws `private` and the `can` of each item.
 *
 * Pure over the host's stores, so the spec reads it with the same rig as Memória.
 */
import type { ProductRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import { SECRET_FACT_KEYS } from './cofre-migrate.ts'
import { memoryProofOf } from './owner-memory.ts'
import { listPlaybook } from './playbook.ts'
import { playbookViews } from './playbook-view.ts'
import { mayReadPrivateRecord } from './private-records.ts'
import type { ScreensHost } from './screens.ts'

/** The four sections, in the order the screen draws them. */
export type NotebookSectionKey = 'sabe-fazer' | 'como-gosta' | 'aprendizados' | 'erros'

/** Present only on what is private to the reader: `me` = they were in the conversation it came from, the others do not see it. Never `others`: what the reader may not see is not sent at all. */
export interface NotebookPrivate {
  readonly visibleTo: 'me'
}

/** Where an item came from, as the host really knows it. */
export interface NotebookOrigin {
  /** `asked-remember`: the owner asked to remember it (a rule or a fact), with the day; `asked-change`: the owner asked to change this way of working (no day); `task`: a kind of work the owner accepted, with the last day. */
  readonly kind: 'asked-remember' | 'asked-change' | 'task'
  /** ISO day-time; absent on `asked-change` (the playbook keeps none). */
  readonly at?: string
  /** `asked-change`: the kind of work it was about. */
  readonly about?: string
  /** `asked-remember`: who asked (display name) and whether it was the reader ("você pediu" vs "<nome> pediu"). */
  readonly by?: string
  readonly mine?: boolean
}

/** One thing the persona keeps. */
export interface NotebookItem {
  readonly id: string
  readonly text: string
  readonly origin: NotebookOrigin
  /** A kind of work that became a skill ("virou skill"). */
  readonly becameSkill?: boolean
  readonly private?: NotebookPrivate
  /** The host call that acts on it: `memory` (editMemory/forgetMemory), `playbook` (forgetPlaybook: the whole note), `adjustment` (none today). */
  readonly target: 'memory' | 'playbook' | 'adjustment'
  /** What THIS reader may do (the ACL): a button that is not allowed is not drawn. */
  readonly can: { readonly edit: boolean; readonly forget: boolean }
}

/** A section and what the reader sees of it. */
export interface NotebookSection {
  readonly key: NotebookSectionKey
  readonly items: readonly NotebookItem[]
  /** Set when ALL of what the reader sees in the section is private to them. */
  readonly private?: NotebookPrivate
}

/** The notebook of one persona, for one reader. */
export interface PersonaNotebookView {
  readonly personaId: string
  readonly personaName: string
  /** The owner's name for "Como <nome> gosta", only when the space has ONE owner (with two there is no one name to say). */
  readonly ownerName?: string
  /** Always the four, in order. */
  readonly sections: readonly NotebookSection[]
  /** Whether "Apagar" can be undone. Today forgetting only revokes the record: it is not, so the screen asks first and offers no "Desfazer". */
  readonly forgetIsReversible: boolean
}

/** What the notebook reads. */
export interface NotebookStores {
  readonly vault: Pick<VaultRepos, 'listRecords'>
  readonly screens: ScreensHost
  readonly product: Pick<ProductRepos, 'listPersonas' | 'listMembers'>
}

/** Who is reading. */
export interface NotebookReader {
  /** The member the host knows is asking; empty when nobody (nothing private is shown). */
  readonly id: string
  /** Whether the reader may write in the project (edit and forget only where this and the ACL of the record allow). */
  readonly canWrite: boolean
  /** Whether the reader is in a DM (its participants only): `dmSeenByActor`. */
  readonly inDm: (dmId: string) => boolean
}

const MINE: NotebookPrivate = { visibleTo: 'me' }

function sectionOf(key: NotebookSectionKey, items: readonly NotebookItem[]): NotebookSection {
  return { key, items, ...(items.length > 0 && items.every(item => item.private !== undefined) ? { private: MINE } : {}) }
}

/**
 * @param stores - Vault, screens (the playbook) and the product.
 * @param scope - The persona and where she works.
 * @param reader - Who is reading.
 * @returns The notebook, or undefined when the persona is not of this project.
 */
export function personaNotebookOf(
  stores: NotebookStores,
  scope: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string },
  reader: NotebookReader,
): PersonaNotebookView | undefined {
  const persona = stores.product.listPersonas(scope.projectId).find(row => row.id === scope.personaId)
  if (persona === undefined) return undefined

  // What the owner asked to keep: rules and facts, for the whole team or only for this persona (her DM). The record's own rule decides who reads a private one.
  const rules: NotebookItem[] = []
  const facts: NotebookItem[] = []
  for (const record of stores.vault.listRecords(scope.projectId)) {
    if (record.status !== 'active' || record.workspaceId !== scope.workspaceId) continue
    if (record.kind !== 'memory' && record.kind !== 'constraint') continue
    if (record.authorId === 'review' || (record.factKey !== undefined && SECRET_FACT_KEYS.includes(record.factKey))) continue
    const proof = memoryProofOf(stores.screens.screens, scope.projectId, record.id)
    if (proof === undefined) continue // not asked by the owner: no source, so nothing to show
    const hers = record.visibility.kind === 'persona' && record.visibility.personaId === scope.personaId
    if (!hers && record.visibility.kind !== 'workspace') continue
    if (!mayReadPrivateRecord(record, reader.id, proof.byId)) continue
    const item: NotebookItem = {
      id: record.id,
      text: record.body,
      origin: { kind: 'asked-remember', at: proof.at, by: proof.by, mine: reader.id !== '' && proof.byId === reader.id },
      ...(hers ? { private: MINE } : {}),
      target: 'memory',
      can: { edit: reader.canWrite, forget: reader.canWrite },
    }
    if (record.kind === 'constraint') rules.push(item)
    else facts.push(item)
  }

  // What the playbook learned of her: the notes the reader may read (one that learned from a DM is for those in it).
  const dmsOf = new Map(listPlaybook(stores.screens.screens, scope.projectId, scope.personaId).map(note => [note.id, note.dms ?? []]))
  const notes = playbookViews(stores.screens, scope.projectId, scope.personaId, reader.inDm)
  const privateOf = (id: string): { readonly private?: NotebookPrivate } => ((dmsOf.get(id) ?? []).length > 0 ? { private: MINE } : {})
  const knows: NotebookItem[] = notes.filter(view => view.uses > 0).map(view => ({
    id: view.id,
    text: view.title,
    origin: { kind: 'task', at: view.lastAt },
    ...(view.stage === 'skill' ? { becameSkill: true } : {}),
    ...privateOf(view.id),
    target: 'playbook',
    can: { edit: false, forget: reader.canWrite },
  }))
  const mistakes: NotebookItem[] = notes.flatMap(view => view.adjustments.map((text, index): NotebookItem => ({
    id: `${view.id}#${String(index)}`,
    text,
    origin: { kind: 'asked-change', about: view.title },
    ...privateOf(view.id),
    target: 'adjustment',
    can: { edit: false, forget: false },
  })))

  const owners = stores.product.listMembers(scope.workspaceId).filter(member => member.role === 'owner')
  const only = owners.length === 1 ? owners[0] : undefined
  return {
    personaId: persona.id,
    personaName: persona.name,
    ...(only === undefined ? {} : { ownerName: only.displayName }),
    sections: [sectionOf('sabe-fazer', knows), sectionOf('como-gosta', rules), sectionOf('aprendizados', facts), sectionOf('erros', mistakes)],
    forgetIsReversible: false,
  }
}
