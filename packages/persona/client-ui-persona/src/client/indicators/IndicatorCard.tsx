/**
 * "Seus números" (colheita item 19a) · um número fixado na Visão geral: 280 px de largura mínima por 148 de altura (design/COLHEITA-MUSE.md §19a).
 * Estados do rodapé: atualizado ("Atualizado às 8:00"), atualizando (o valor antigo continua), falhou ("Não consegui atualizar · Ver por quê",
 * âmbar, o valor antigo continua com "de ontem") e alerta (borda esquerda âmbar de 3 px e "Caiu 24% desde ontem").
 */

import { useState, type ReactNode } from 'react'
import { MenuButton, UiIcon } from '../primitives/index.ts'
import { IndicatorBody } from './IndicatorBody.tsx'
import { footerOf, staleWordOf, type IndicatorUi } from './indicators-model.ts'
import { itext } from './indicators-text.ts'
import styles from './IndicatorCard.module.css'

export interface IndicatorCardProps {
  readonly card: IndicatorUi
  /** The clock (tests pin it). */
  readonly now?: Date
  /** "Atualizar agora" (quiet). Absent = the item is not in the menu. */
  readonly onRefresh?: ((card: IndicatorUi) => void) | undefined
  /** "Tirar da Visão geral". Absent = the item is not in the menu. */
  readonly onUnpin?: ((card: IndicatorUi) => void) | undefined
}

export function IndicatorCard({ card, now = new Date(), onRefresh, onUnpin }: IndicatorCardProps): ReactNode {
  const [whyOpen, setWhyOpen] = useState(false)
  const footer = footerOf(card, now)
  const stale = card.status === 'failed' ? staleWordOf(card.updatedAt, now) : undefined
  const items = [
    ...(onRefresh === undefined ? [] : [{ id: 'refresh', label: itext('card.refresh'), onSelect: () => { onRefresh(card) }, disabled: card.status === 'updating' }]),
    ...(onUnpin === undefined ? [] : [{ id: 'unpin', label: itext('card.unpin'), onSelect: () => { onUnpin(card) }, tone: 'danger' as const }]),
  ]
  return (
    <li
      className={`${styles.card} ${card.alert !== undefined ? styles.alert : ''}`}
      data-indicator={card.id}
      data-indicator-kind={card.data.kind}
      data-indicator-status={card.status}
      data-indicator-alert={card.alert === undefined ? undefined : 'true'}
    >
      <div className={styles.head}>
        <h3 className={styles.name}>{card.name}</h3>
        {stale !== undefined && <span className={styles.stale}>{stale}</span>}
        {items.length > 0 && (
          <MenuButton
            label={itext('card.more', { name: card.name })}
            items={items}
            align="end"
            variant="ghost"
            icon={<UiIcon name="more" size={16} />}
            className={styles.menu}
          />
        )}
      </div>
      <div className={styles.body}>
        <IndicatorBody data={card.data} />
      </div>
      <div className={styles.foot} data-tone={footer.tone}>
        {footer.tone === 'updating' && <span className={styles.spinner} aria-hidden="true" />}
        <span>{footer.text}</span>
        {footer.tone === 'failed' && card.failure !== undefined && card.failure !== '' && (
          <>
            <span aria-hidden="true"> · </span>
            <button type="button" className={styles.why} aria-expanded={whyOpen} onClick={() => { setWhyOpen(open => !open) }}>
              {whyOpen ? itext('card.hideWhy') : itext('card.why')}
            </button>
          </>
        )}
      </div>
      {whyOpen && card.failure !== undefined && <p className={styles.reason} role="status">{card.failure}</p>}
    </li>
  )
}
