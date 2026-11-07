/**
 * P1-9 · "Proposta de {persona}" no #geral (design/TASK-PROPOSAL-SPEC.md; contracts/task-proposals.md, Forge).
 *
 * O host manda DADOS (`MessageView.taskProposal` = o cartão: 1 item = "Proposta de {persona}", 2–3 = "Propostas da equipe"; `listTaskProposals`
 * = o estado vivo de cada item). As palavras são daqui. Este módulo é puro: o mapa do host para a tela e a regra do estado de cada item.
 */

export interface ProposalItemUi {
  readonly id: string
  readonly personaId: string
  readonly personaName: string
  /** O retrato do elenco; a camada que tem o elenco preenche. */
  readonly characterId?: string
  /** "Posso retomar “Relatório de sexta”?" — vem pronta do engine, com as aspas tipográficas. */
  readonly question: string
  /** Uma linha, só fato; vazia = sem linha de motivo. */
  readonly reason: string
}

export interface TaskProposalUi {
  readonly kind: 'single' | 'digest'
  readonly items: readonly ProposalItemUi[]
}

export type ProposalStatus = 'open' | 'accepted' | 'declined' | 'expired'

/** O estado vivo de um item (`listTaskProposals`). `ticketTitle` pode vir um instante depois de aceitar (o pedido esperou vaga). */
export interface ProposalLiveUi {
  readonly status: ProposalStatus
  readonly ticketId?: string
  readonly ticketTitle?: string
}

export interface ProposalItemInput {
  readonly id: string
  readonly personaId: string
  readonly personaName: string
  readonly question: string
  readonly reason: string
}

export interface TaskProposalCardInput {
  readonly kind: 'single' | 'digest'
  readonly items: readonly ProposalItemInput[]
}

export interface ProposalLiveInput {
  readonly status: ProposalStatus
  readonly ticketId?: string | undefined
  readonly ticketTitle?: string | undefined
}

/** O teto de abertas do contrato; o resumo nunca passa de 3 linhas. */
export const MAX_DIGEST_ITEMS = 3

/**
 * O cartão do host vira o da tela. Item sem id ou sem pergunta legível não entra; sem nenhum item não há cartão (a frase simples do host
 * segue no fio). Um item é "Proposta de {persona}"; 2 ou mais são o resumo, até {@link MAX_DIGEST_ITEMS}.
 */
export function mapTaskProposal(input: TaskProposalCardInput | undefined): TaskProposalUi | undefined {
  if (input === undefined) return undefined
  const seen = new Set<string>()
  const items: ProposalItemUi[] = []
  for (const item of input.items) {
    const question = item.question.trim()
    if (item.id === '' || question === '' || seen.has(item.id)) continue
    seen.add(item.id)
    items.push({
      id: item.id,
      personaId: item.personaId,
      personaName: item.personaName.trim(),
      question,
      reason: item.reason.trim(),
    })
    if (items.length === MAX_DIGEST_ITEMS) break
  }
  if (items.length === 0) return undefined
  return { kind: items.length === 1 ? 'single' : 'digest', items }
}

export function mapProposalLive(input: ProposalLiveInput | undefined): ProposalLiveUi | undefined {
  if (input === undefined) return undefined
  const ticketTitle = input.ticketTitle?.trim() ?? ''
  return {
    status: input.status,
    ...(input.ticketId === undefined || input.ticketId === '' ? {} : { ticketId: input.ticketId }),
    ...(ticketTitle === '' ? {} : { ticketTitle }),
  }
}

/** O que a pessoa fez AGORA, antes do host confirmar (otimismo): decidindo, falhou, ou decidiu (aguardando a leitura viva). */
export type ProposalLocal =
  | { readonly phase: 'idle' }
  | { readonly phase: 'deciding'; readonly accept: boolean }
  | { readonly phase: 'failed'; readonly accept: boolean }
  | { readonly phase: 'done'; readonly accept: boolean }

export type ProposalView = 'open' | 'deciding' | 'failed' | 'accepted' | 'declined' | 'expired'

/**
 * Como o item se mostra: o estado vivo do host vale quando ele já decidiu; antes disso vale o que a pessoa acabou de fazer; sem nada, aberto.
 * (O host é a verdade: um `declined` que veio do host sobrepõe o `deciding` local.)
 */
export function proposalView(live: ProposalLiveUi | undefined, local: ProposalLocal): ProposalView {
  if (live !== undefined && live.status !== 'open') return live.status
  switch (local.phase) {
    case 'deciding': return 'deciding'
    case 'failed': return 'failed'
    case 'done': return local.accept ? 'accepted' : 'declined'
    default: return 'open'
  }
}

/** O Desfazer do "Agora não" dura 6 s, a partir do instante em que ESTA pessoa recusou (o host só reabre uma recusada). */
export const UNDO_WINDOW_MS = 6000
