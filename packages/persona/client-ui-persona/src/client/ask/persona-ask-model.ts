/**
 * IV-10 · a pergunta estruturada da persona no fio (contracts/structured-question.md; forma: UX-BEYOND §Colheita A(1)).
 *
 * O host manda DADOS (`MessageView.personaAsk` = o cartão; `listPersonaAsks` = o estado vivo); as palavras são daqui. Este módulo é puro:
 * o mapa do host para a tela e a regra da escolha (única × múltipla).
 */

export interface AskOptionUi {
  readonly id: string
  readonly label: string
}

/** O cartão, como o fio o desenha. `options` vazio = só palavras (o composer responde; sem chips). */
export interface PersonaAskUi {
  /**
   * `fimDoTurno` = o cartão de escolha do fim da vez (colheita item 11): opções A a F, ninguém espera por ele e o toque vira uma
   * mensagem curta da pessoa. Ausente = a pergunta de uma Tarefa que espera.
   */
  readonly kind?: 'fimDoTurno'
  /** O id da pergunta aberta (o `Attention`): estável. */
  readonly askId: string
  readonly ticketId: string
  readonly personaId: string
  readonly personaName: string
  /** O retrato da persona (o `characterId` do elenco); a camada que tem o elenco preenche. */
  readonly characterId?: string
  readonly question: string
  readonly options: readonly AskOptionUi[]
  readonly multiple: boolean
  /** Só em sequência ("Pergunta 2 de 3"), 1-based. */
  readonly step?: { readonly index: number; readonly total: number }
}

export type PersonaAskStatus = 'open' | 'answered' | 'cancelled'

/** O estado vivo (`listPersonaAsks`): aberta, respondida (só leitura, com as escolhas) ou cancelada (a tarefa acabou antes). */
export interface PersonaAskLiveUi {
  readonly status: PersonaAskStatus
  readonly optionIds: readonly string[]
  readonly text: string
  /** Quando foi respondida (ISO), para o rodapé "Você escolheu B · 14:32". */
  readonly answeredAt?: string
}

/** O formato do cartão que o host manda (um subconjunto estrutural de `PersonaAskCardView`, para este módulo não importar o host). */
export interface PersonaAskCardInput {
  readonly kind?: 'fimDoTurno' | undefined
  readonly askId: string
  readonly ticketId: string
  readonly personaId: string
  readonly personaName: string
  readonly question: string
  readonly options?: readonly { readonly id: string; readonly label: string }[] | undefined
  readonly multiple: boolean
  readonly step?: { readonly index: number; readonly total: number } | undefined
}

/** O estado vivo que o host manda (um subconjunto estrutural de `PersonaAskView`). */
export interface PersonaAskLiveInput {
  readonly status: PersonaAskStatus
  readonly answer?: { readonly optionIds: readonly string[]; readonly text: string; readonly answeredAt?: string | undefined } | undefined
}

/**
 * O cartão do host vira o da tela. Sem pergunta legível não há cartão (a frase simples do host segue no fio); a sequência só conta
 * quando tem 2 ou mais passos e o passo cabe nela.
 */
export function mapPersonaAsk(input: PersonaAskCardInput | undefined): PersonaAskUi | undefined {
  if (input === undefined) return undefined
  const question = input.question.trim()
  const endOfTurn = input.kind === 'fimDoTurno'
  // The card of a Task that waits is tied to its Task; the end-of-turn card is tied to the message that carries it (no Task waits).
  if (input.askId === '' || (input.ticketId === '' && !endOfTurn) || question === '') return undefined
  const seen = new Set<string>()
  const options: AskOptionUi[] = []
  for (const option of input.options ?? []) {
    const label = option.label.trim()
    if (option.id === '' || label === '' || seen.has(option.id)) continue
    seen.add(option.id)
    options.push({ id: option.id, label })
  }
  const step = input.step !== undefined && input.step.total >= 2 && input.step.index >= 1 && input.step.index <= input.step.total
    ? { index: input.step.index, total: input.step.total }
    : undefined
  return {
    ...(endOfTurn ? { kind: 'fimDoTurno' as const } : {}),
    askId: input.askId,
    ticketId: input.ticketId,
    personaId: input.personaId,
    personaName: input.personaName,
    question,
    options,
    multiple: !endOfTurn && input.multiple && options.length > 1,
    ...(step === undefined || endOfTurn ? {} : { step }),
  }
}

export function mapPersonaAskLive(input: PersonaAskLiveInput | undefined): PersonaAskLiveUi | undefined {
  if (input === undefined) return undefined
  return {
    status: input.status,
    optionIds: input.answer?.optionIds ?? [],
    text: input.answer?.text ?? '',
    ...(input.answer?.answeredAt === undefined ? {} : { answeredAt: input.answer.answeredAt }),
  }
}

/** Marca ou desmarca uma opção: única = só ela (tocar de novo na escolhida a mantém); múltipla = liga/desliga, na ordem das opções. */
export function toggleOption(
  options: readonly AskOptionUi[],
  selected: readonly string[],
  id: string,
  multiple: boolean,
): readonly string[] {
  if (!options.some(option => option.id === id)) return selected
  if (!multiple) return [id]
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return options.filter(option => next.has(option.id)).map(option => option.id)
}

/** Só as escolhas que ainda são opções desta pergunta, na ordem delas (o host pode trazer uma opção que saiu). */
export function knownChoices(options: readonly AskOptionUi[], ids: readonly string[]): readonly string[] {
  const wanted = new Set(ids)
  return options.filter(option => wanted.has(option.id)).map(option => option.id)
}
