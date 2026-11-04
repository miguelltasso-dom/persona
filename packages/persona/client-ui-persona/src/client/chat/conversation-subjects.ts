import type { ChannelMessageUi } from '../remote/map-host-ui.ts'

/** WAVE2 §1 — fixed palette and default assuntos (Maestri Chat pattern). */

export const SUBJECT_COLOR_COUNT = 7 as const

export type SubjectColorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ConversationSubjectUi {
  readonly id: string
  readonly name: string
  readonly colorIndex: SubjectColorIndex
  readonly unreadCount: number
  readonly working?: boolean
  /** Live indicator copy, e.g. "Nina" — Muse builds "Nina está trabalhando aqui". */
  readonly workingName?: string
}

/** WAVE2-SPEC: only "Geral" by default; further subjects via + (max 7). */
export const DEFAULT_CONVERSATION_SUBJECTS: readonly ConversationSubjectUi[] = [
  { id: 'subject-geral', name: 'Geral', colorIndex: 0, unreadCount: 0 },
] as const

/** Fallback color names when the user has not renamed a subject (WAVE2-SPEC). */
export const SUBJECT_COLOR_NAMES: readonly string[] = [
  'Lilás', 'Âmbar', 'Menta', 'Rosa', 'Céu', 'Pêssego', 'Tinta',
]

export const DEFAULT_CONVERSATION_SUBJECT_ID = DEFAULT_CONVERSATION_SUBJECTS[0]!.id

export function conversationStreamKey(streamKind: 'channel' | 'dm', ownerId: string): string {
  return `${streamKind}:${ownerId}`
}

export function subjectColorVar(index: SubjectColorIndex): string {
  return `var(--persona-subject-${index})`
}

/** Client-side filter until every message carries a subject tag from the host. */
export function filterMessagesForSubject(
  messages: readonly ChannelMessageUi[],
  activeSubjectId: string,
): readonly ChannelMessageUi[] {
  return messages.filter(row => (row.conversationSubjectId ?? DEFAULT_CONVERSATION_SUBJECT_ID) === activeSubjectId)
}

/** Nome padrão em português quando quem chama não passa o rótulo do idioma. */
const DEFAULT_SUBJECT_LABEL = (n: number): string => `Assunto ${String(n)}`

/**
 * Nome para o "+ Novo assunto": "Assunto N" com o menor N livre (conta os arquivados também, para não repetir nome).
 * O host recusa nome vazio (`invalid-input`), então o assunto já nasce com nome e a barra abre o campo para renomear.
 */
export function nextSubjectName(
  subjects: readonly ConversationSubjectUi[],
  archived: readonly ConversationSubjectUi[] = [],
  label: (n: number) => string = DEFAULT_SUBJECT_LABEL,
): string {
  const taken = new Set([...subjects, ...archived].map(row => row.name.trim().toLowerCase()))
  let n = subjects.length + archived.length + 1
  while (taken.has(label(n).trim().toLowerCase())) n += 1
  return label(n)
}
