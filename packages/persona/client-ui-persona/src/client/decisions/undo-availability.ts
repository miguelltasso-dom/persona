import type { Decision } from './decision-types.ts'

/**
 * "Desfazer" só existe se o host sabe desfazer. O host marca `reversible`, mas o Remote `undoApproval` ainda não
 * existe: sem ele o botão aparecia e não fazia nada (achado da auditoria WIRE-4). Sem o Remote, nenhuma decisão
 * é oferecida como reversível; com ele, tudo segue como o host marcou.
 */
export function withoutUnavailableUndo(decisions: readonly Decision[], canUndo: boolean): readonly Decision[] {
  if (canUndo) return decisions
  return decisions.map((decision) => {
    if (decision.reversible !== true) return decision
    const { reversible: _dropped, ...rest } = decision
    void _dropped
    return rest as Decision
  })
}
