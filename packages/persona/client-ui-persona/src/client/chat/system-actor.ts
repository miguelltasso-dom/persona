/**
 * EQUIPE-REAL-SPEC §0 (Muse 05/11): mensagens de rotina ou de sistema (`routine:*`, `team:*`, qualquer autor com `:`) NUNCA entram no fio, e
 * nenhum autor visível contém `:`. O host (Anvil) não deve mandá-las; esta é a defesa do cliente para o ator técnico nunca vazar como nome.
 */

/** O autor é um ator técnico (`routine:manha`, `team:split`): o id cru, no formato `prefixo:resto` sem espaço. */
export function isSystemActor(row: { readonly authorId: string; readonly authorName: string }): boolean {
  const technical = /^[a-z][a-z0-9_-]*:\S+$/iu
  return technical.test(row.authorId) || technical.test(row.authorName)
}
