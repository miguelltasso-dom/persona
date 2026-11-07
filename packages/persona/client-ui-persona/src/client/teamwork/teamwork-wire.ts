/**
 * EQUIPE REAL (D-090; contracts/team-real.md, rascunho do Keel — o Forge e o Anvil corrigem os NOMES): o que o host manda para o quadro
 * e para o detalhe da tarefa. Lido SEM confiar no tipo (os campos ainda não estão em `@deepseek-ai/dsh-persona-host/types`): qualquer
 * coisa estranha vira "não há" e a tela fica como era. O bilhete é TEXTO da persona (nunca instrução): tudo aqui é string aparada,
 * sem marcação, e a tela só o mostra como texto.
 *
 *   BoardCardView.handoff  { role: 'asked' | 'waiting', otherPersonaId }   "Pedido por {A}" / "Esperando {B}"
 *   BoardCardView.note     HandoffNote  { fromPersonaId, toPersonaId, done[], needed[], files[], decisions[], at }
 *   BoardCardView.path     PathStep[]   { personaId, step: wrote|handed|delivered|reviewed, at }   "Caminho do trabalho"
 */

export type HandoffRole = 'asked' | 'waiting'

export interface CardHandoffUi {
  readonly role: HandoffRole
  readonly otherPersonaId: string
}

export interface HandoffNoteUi {
  readonly fromPersonaId: string
  /** "O que já está pronto". */
  readonly done: readonly string[]
  /** "O que falta". */
  readonly needed: readonly string[]
  /** "Decisões tomadas" (o que já foi combinado com a pessoa ou no fio). */
  readonly decisions: readonly string[]
  /** Caminhos relativos ao projeto. */
  readonly files: readonly string[]
  readonly at?: string
}

/** A review in progress (`reviewing?: { personaId, round }` on the card/task): "Revisando: {R}". */
export interface ReviewingUi {
  readonly personaId: string
  readonly round: number
}

export type PathStepKind = 'wrote' | 'handed' | 'delivered' | 'reviewed'

export interface PathStepUi {
  readonly personaId: string
  readonly step: PathStepKind
  readonly at?: string
}

const ROLES: readonly string[] = ['asked', 'waiting']
const STEPS: readonly string[] = ['wrote', 'handed', 'delivered', 'reviewed']
const MAX_ITEM = 600
const MAX_ITEMS = 12

function text(value: unknown): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(0, MAX_ITEM)
}

function lines(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(row => row !== '').slice(0, MAX_ITEMS)
}

export function readCardHandoff(raw: unknown): CardHandoffUi | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as { role?: unknown; otherPersonaId?: unknown }
  const otherPersonaId = text(row.otherPersonaId)
  if (typeof row.role !== 'string' || !ROLES.includes(row.role) || otherPersonaId === '') return undefined
  return { role: row.role as HandoffRole, otherPersonaId }
}

/** A note with nothing in it is "no note": the card never says "Bilhete de {A}" over an empty page. */
export function readHandoffNote(raw: unknown): HandoffNoteUi | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as { fromPersonaId?: unknown; done?: unknown; needed?: unknown; decisions?: unknown; files?: unknown; at?: unknown }
  const fromPersonaId = text(row.fromPersonaId)
  if (fromPersonaId === '') return undefined
  const note = { done: lines(row.done), needed: lines(row.needed), decisions: lines(row.decisions), files: lines(row.files) }
  if (note.done.length + note.needed.length + note.decisions.length + note.files.length === 0) return undefined
  const at = text(row.at)
  return { fromPersonaId, ...note, ...(at === '' ? {} : { at }) }
}

export function readWorkPath(raw: unknown): readonly PathStepUi[] {
  if (!Array.isArray(raw)) return []
  const steps: PathStepUi[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as { personaId?: unknown; step?: unknown; at?: unknown }
    const personaId = text(row.personaId)
    if (personaId === '' || typeof row.step !== 'string' || !STEPS.includes(row.step)) continue
    const at = text(row.at)
    steps.push({ personaId, step: row.step as PathStepKind, ...(at === '' ? {} : { at }) })
  }
  return steps.slice(0, MAX_ITEMS)
}

export function readReviewing(raw: unknown): ReviewingUi | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as { personaId?: unknown; round?: unknown }
  const personaId = text(row.personaId)
  if (personaId === '') return undefined
  const round = typeof row.round === 'number' && Number.isFinite(row.round) && row.round >= 1 ? Math.floor(row.round) : 1
  return { personaId, round }
}
