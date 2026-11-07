/**
 * EQUIPE REAL (D-090, EQUIPE-REAL-SPEC "No quadro"): no cartão do colega, o chip "Pedido por {A}" com o rosto 16; no de quem pediu,
 * "Esperando {B}" com o rosto 16 e o anel PARADO (sem animação). Quando o cartão tem caminho, um link "Caminho do trabalho".
 * Só com `persona.flag.teamwork`, só com dados do host e só quando a equipe sabe o NOME da outra persona (nunca um id na tela).
 */

import type { ReactNode } from 'react'
import { BrandIcon } from '../primitives/index.ts'
import type { KanbanCardModel } from '../kanban/types.ts'
import { isTeamworkEnabled } from './teamwork-flag.ts'
import { teamworkText, useTeamwork } from './teamwork-context.tsx'
import styles from './Teamwork.module.css'

export function HandoffChip({ dict, card }: { readonly dict: Readonly<Record<string, string>>; readonly card: KanbanCardModel }): ReactNode {
  const teamwork = useTeamwork()
  if (!isTeamworkEnabled() || teamwork === undefined) return null
  const handoff = card.handoff
  const other = handoff === undefined ? undefined : teamwork.personaFor(handoff.otherPersonaId)
  const reviewer = card.reviewing === undefined ? undefined : teamwork.personaFor(card.reviewing.personaId)
  const canOpenPath = teamwork.openPath !== undefined && card.path !== undefined && card.path.length > 0
  const hasHandoffChip = handoff !== undefined && other !== undefined
  if (!hasHandoffChip && reviewer === undefined && !canOpenPath) return null
  return (
    <div className={styles.row} data-teamwork="card">
      {card.sample === true && <span className={styles.sample}>{teamworkText(dict, 'handoff.sample', 'Exemplo')}</span>}
      {handoff !== undefined && other !== undefined && (
        <span className={styles.chip} data-role={handoff.role}>
          <span className={styles.face} data-waiting={handoff.role === 'waiting' ? '' : undefined} aria-hidden="true">
            {other.avatarSrc === undefined
              ? <span className={styles.initial}>{other.name.slice(0, 1).toUpperCase()}</span>
              : <img src={other.avatarSrc} alt="" />}
          </span>
          <span>
            {handoff.role === 'asked'
              ? teamworkText(dict, 'handoff.chipRequestedBy', 'Pedido por {name}', { name: other.name })
              : teamworkText(dict, 'handoff.chipWaiting', 'Esperando {name}', { name: other.name })}
          </span>
        </span>
      )}
      {reviewer !== undefined && (
        <span className={styles.chip} data-role="reviewing">
          <span className={styles.face} data-waiting="" aria-hidden="true">
            {reviewer.avatarSrc === undefined
              ? <span className={styles.initial}>{reviewer.name.slice(0, 1).toUpperCase()}</span>
              : <img src={reviewer.avatarSrc} alt="" />}
          </span>
          <span>{teamworkText(dict, 'handoff.chipReviewing', 'Revisando: {name}', { name: reviewer.name })}</span>
        </span>
      )}
      {canOpenPath && (
        <button type="button" className={styles.pathLink} onClick={() => { teamwork.openPath?.(card.id) }}>
          <BrandIcon name="caminho" size={16} />
          {teamworkText(dict, 'handoff.path', 'Caminho do trabalho')}
        </button>
      )}
    </div>
  )
}
