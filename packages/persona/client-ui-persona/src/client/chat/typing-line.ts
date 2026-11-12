/**
 * Casa da Equipe, microdetalhe 4 (COLHEITA-MUSE §29b): a linha "digitando" embaixo do fio, com o rosto vivo.
 *  - 1 persona: `Bento está escrevendo a legenda` (a frase que o host já escreve em português simples, "Escrevendo a legenda");
 *  - 2 ao mesmo tempo: os 2 rostos sobrepostos e `Bento e Nina estão escrevendo…`;
 *  - 3 ou mais: `3 personas estão trabalhando aqui`;
 *  - a linha reserva a própria altura (24 px), para o fio não pular quando aparece ou some (isso é do CSS; aqui mora só o QUE a linha diz).
 *
 * Os dados vêm do host (`getChannelHere`): cada membro do canal tem `doing` (a frase) SÓ quando está trabalhando. É por persona, não amarrado a uma
 * conversa deste canal, e é um retrato do momento: releia a cada quadro novo do fio e a cada ~5 s.
 */

/** O que uma persona do canal faz agora (o `HereMember` do host, só o que a linha usa). */
export interface TypingWorker {
  readonly personaId: string
  readonly name: string
  /** "Escrevendo a legenda"; só existe enquanto trabalha. */
  readonly doing?: string | undefined
}

export type TypingLine =
  | { readonly kind: 'one'; readonly personaId: string; readonly name: string; readonly doing: string }
  | { readonly kind: 'two'; readonly personaIds: readonly [string, string]; readonly names: readonly [string, string] }
  | { readonly kind: 'many'; readonly count: number; readonly personaIds: readonly string[] }

/** "Escrevendo a legenda" -> "escrevendo a legenda": a frase entra no meio de "Bento está …". */
export function doingInSentence(doing: string): string {
  const text = doing.trim()
  return text === '' ? '' : `${text.charAt(0).toLocaleLowerCase()}${text.slice(1)}`
}

/**
 * @param workers - Os membros do canal (a ordem do host).
 * @returns O que a linha diz, ou `undefined` quando ninguém está trabalhando (a linha some e a altura fica reservada).
 */
export function typingLineOf(workers: readonly TypingWorker[]): TypingLine | undefined {
  const working = workers.filter(worker => worker.doing !== undefined && worker.doing.trim() !== '')
  const [first, second] = working
  if (first === undefined) return undefined
  if (second === undefined) return { kind: 'one', personaId: first.personaId, name: first.name, doing: doingInSentence(first.doing ?? '') }
  if (working.length === 2) return { kind: 'two', personaIds: [first.personaId, second.personaId], names: [first.name, second.name] }
  return { kind: 'many', count: working.length, personaIds: working.map(worker => worker.personaId) }
}
