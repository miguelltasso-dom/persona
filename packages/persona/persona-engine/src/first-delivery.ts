/**
 * UX-PHASE A / P0 v1: first real Ticket after onboarding (cheap, ≤1 turn).
 */

import { wantsWork } from './wants-work.ts'

export interface FirstDeliveryInput {
  readonly companyBrief: string
  readonly coordinationName?: string
  readonly executorName?: string
}

export interface FirstDeliveryTask {
  readonly title: string
  readonly assignment: string
  readonly readyCriterion: string
}

const FALLBACK_BRIEF = 'a empresa que a pessoa descreveu no onboarding'

/**
 * Small first Ticket from the onboarding vault line (Muse: resumo + próxima tarefa).
 * @param input - Step-2 brief and optional display names.
 */
export function firstDeliveryTask(input: FirstDeliveryInput): FirstDeliveryTask {
  const brief = clipBrief(input.companyBrief)
  const who = input.executorName ?? input.coordinationName ?? 'A Coordenação'
  const title = `Resumir o Cofre e propor a 1ª tarefa (${brief})`
  return {
    title,
    assignment: [
      `${who} lê o Cofre / brief abaixo e entrega em português do Brasil:`,
      '1. Cinco pontos do que já sabemos da empresa.',
      '2. Uma tarefa concreta para esta semana (uma frase, dono, critério de pronto).',
      'Não invente preço, cliente ou ferramenta que não esteja no brief.',
      '',
      'Brief:',
      brief,
    ].join('\n'),
    readyCriterion: 'Cinco pontos fiéis ao brief e uma tarefa da semana com dono e critério de pronto.',
  }
}

/**
 * Onboarding suggested #geral line — must pass {@link wantsWork}.
 * @param input - Same brief as {@link firstDeliveryTask}.
 */
export function firstDeliveryAsk(input: FirstDeliveryInput): string {
  const brief = clipBrief(input.companyBrief)
  const ask = `Resuma o Cofre de ${brief} em 5 pontos e proponha a primeira tarefa da semana.`
  if (!wantsWork(ask)) throw new Error('first-delivery ask must wantsWork')
  return ask
}

function clipBrief(raw: string): string {
  const line = raw.trim().split(/\r?\n/u, 1)[0]?.trim() ?? ''
  if (line === '') return FALLBACK_BRIEF
  return line.length > 80 ? `${line.slice(0, 77)}…` : line
}
