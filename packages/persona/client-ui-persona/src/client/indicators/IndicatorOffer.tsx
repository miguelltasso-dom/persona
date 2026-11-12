/**
 * "Seus números" (colheita item 19a) · o número que a persona trouxe na conversa, com o botão fantasma de 32 px "Fixar na Visão geral" (ícone `pin`).
 * Entra logo abaixo das palavras da persona (sem repetir o rosto). Já fixado, o botão vira "Fixado na Visão geral" (sem controle morto). Sem o
 * binding (host que não guarda números) nada disto aparece e o fio mostra só as palavras.
 */

import { useState, type ReactNode } from 'react'
import { Button, UiIcon } from '../primitives/index.ts'
import { IndicatorBody } from './IndicatorBody.tsx'
import type { IndicatorOfferUi } from './indicators-model.ts'
import { itext } from './indicators-text.ts'
import { PinIndicatorModal } from './PinIndicatorModal.tsx'
import { useIndicatorsContext } from './use-indicators.tsx'
import styles from './IndicatorOffer.module.css'

export interface IndicatorOfferProps {
  readonly offer: IndicatorOfferUi
  readonly personaName: string
  readonly rowTag?: 'li' | 'div'
  /** The persona's words sit right above: the card enters under them, aligned to the bubble, without the face. */
  readonly continued?: boolean
}

export function IndicatorOffer({ offer, personaName, rowTag = 'li', continued = true }: IndicatorOfferProps): ReactNode {
  const Tag = rowTag
  const binding = useIndicatorsContext()
  const [open, setOpen] = useState(false)
  const pinned = binding?.pinnedMessageIds.has(offer.messageId) === true
  return (
    <Tag className={`${styles.row} ${continued ? styles.continued : ''}`} data-indicator-offer={offer.messageId}>
      <span className={styles.gutter} aria-hidden="true" />
      <section className={styles.card} aria-label={itext('offer.group', { name: personaName })}>
        <h3 className={styles.name}>{offer.name}</h3>
        <IndicatorBody data={offer.data} />
        {binding !== undefined && (
          <div className={styles.actions}>
            {pinned
              ? <span className={styles.pinned} data-indicator-pinned><UiIcon name="check" size={14} />{itext('pin.pinned')}</span>
              : (
                <Button variant="ghost" size="s" icon={<UiIcon name="pin" size={16} />} onClick={() => { setOpen(true) }}>
                  {itext('pin.button')}
                </Button>
              )}
          </div>
        )}
      </section>
      {open && binding !== undefined && (
        <PinIndicatorModal offer={offer} binding={binding} onClose={() => { setOpen(false) }} />
      )}
    </Tag>
  )
}
