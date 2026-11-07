/**
 * CV-4 (CONVERSAS-SPEC §5): o rosto de uma persona fora do rail (organograma): o botão do rosto abre a DM e o ⋯ ao
 * lado ("Sobre {nome}") abre o cartão. Dois botões irmãos (nunca um dentro do outro).
 */

import type { ReactNode } from 'react'
import type { PersonaCardMenuProps } from './PersonaCard.tsx'
import { UiIcon } from './icons.tsx'
import styles from './PersonaFaceCell.module.css'

export interface PersonaFaceCellProps {
  readonly personaId: string
  readonly personaName: string
  readonly menu?: ((personaId: string) => PersonaCardMenuProps) | undefined
  readonly menuLabel?: ((name: string) => string) | undefined
  /** O botão do rosto (já com as props de `faceProps`). */
  readonly children: ReactNode
}

export function PersonaFaceCell({ personaId, personaName, menu, menuLabel, children }: PersonaFaceCellProps): ReactNode {
  if (menu === undefined) return children
  const label = menuLabel?.(personaName) ?? personaName
  return (
    <span className={styles.cell}>
      {children}
      <button type="button" className={styles.more} aria-label={label} title={label} {...menu(personaId)}>
        <UiIcon name="more" size={16} />
      </button>
    </span>
  )
}
