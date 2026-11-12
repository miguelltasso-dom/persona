/**
 * COLHEITA §6 (Quill) · a atividade de uma resposta de persona, para o resumo recolhido acima dela.
 * O host grava UMA linha por ferramenta do turno de conversa, com `threadId` = id da mensagem da pessoa respondida (Zinc).
 * Quem chama é `listTurnActivity({ subjectId: <id da mensagem respondida> })`. Sem linhas = sem resumo (turno sem ferramenta).
 * Puro: sem host, sem React.
 */
import type { StepItem } from '../chat/work-step/turn-step-summary-model.ts'

/** Um grupo do wire (`ActivityGroupView`), só com o que o resumo lê. */
export interface ReplyActivityGroupWire {
  readonly items: readonly {
    readonly id: string
    readonly kind: StepItem['kind']
    readonly title: string
    readonly status: StepItem['status']
    readonly at?: string | undefined
  }[]
  readonly moreCount: number
}

/** O que o resumo precisa de uma resposta. */
export interface ReplyActivityUi {
  readonly items: readonly StepItem[]
  readonly moreCount: number
}

/** Junta os grupos de uma resposta. `undefined` quando o turno não usou ferramenta (nada a resumir). */
export function mapReplyActivity(groups: readonly ReplyActivityGroupWire[]): ReplyActivityUi | undefined {
  const items: StepItem[] = groups.flatMap(group => group.items.map(item => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    status: item.status,
    ...(item.at === undefined ? {} : { at: item.at }),
  })))
  const moreCount = groups.reduce((sum, group) => sum + group.moreCount, 0)
  if (items.length === 0 && moreCount === 0) return undefined
  return { items, moreCount }
}
