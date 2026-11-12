/**
 * "Seus números" (colheita item 19a) · a seção do topo da Visão geral (a tela continua sendo "Visão geral": não existe "Minha Casa").
 * Uma grade de cartões de 280 px de largura mínima por 148 de altura, de 2 a 3 colunas, com 16 px de vão. Vazio: a arte do Brush em 160 px e a
 * frase que ensina a pedir um número. A atualização é muda: nada aqui posta mensagem; o alerta vai só para "Precisa de você".
 */

import { useEffect, useRef, type ReactNode } from 'react'
import type { PersonaTenantScope } from '../remote/persona-remote-types.ts'
import { houseEmptyArt } from '../decor/HouseDecor.tsx'
import { EmptyState, Skeleton } from '../primitives/index.ts'
import { IndicatorCard } from './IndicatorCard.tsx'
import type { IndicatorUi } from './indicators-model.ts'
import { itext } from './indicators-text.ts'
import { useIndicators, type IndicatorsBinding } from './use-indicators.tsx'
import styles from './SeusNumeros.module.css'

export interface SeusNumerosProps {
  readonly items: readonly IndicatorUi[]
  /** `false` until the host's first read arrives: a skeleton, never a false "nada fixado". */
  readonly loaded: boolean
  readonly now?: Date
  readonly onRefresh?: ((card: IndicatorUi) => void) | undefined
  readonly onUnpin?: ((card: IndicatorUi) => void) | undefined
}

export function SeusNumeros({ items, loaded, now, onRefresh, onUnpin }: SeusNumerosProps): ReactNode {
  return (
    <section className={styles.section} aria-label={itext('section.aria')} data-seus-numeros>
      <h2 className={styles.title}>{itext('section.title')}</h2>
      {!loaded
        ? (
          <ul className={styles.grid} aria-hidden="true">
            <li className={styles.skeleton}><Skeleton shape="block" height={148} /></li>
            <li className={styles.skeleton}><Skeleton shape="block" height={148} /></li>
          </ul>
        )
        : items.length === 0
          ? (
            <EmptyState
              compact
              art={houseEmptyArt('empty-seus-numeros', 'empty-seus-numeros-noite', 160)}
              title={itext('empty.title')}
              body={itext('empty.body')}
            />
          )
          : (
            <ul className={styles.grid}>
              {items.map(card => (
                <IndicatorCard
                  key={card.id}
                  card={card}
                  {...(now === undefined ? {} : { now })}
                  onRefresh={onRefresh}
                  onUnpin={onUnpin}
                />
              ))}
            </ul>
          )}
    </section>
  )
}

export interface ConnectedSeusNumerosProps {
  /** The host Remote (`ctx.remote.persona`); a host without the five calls (or none) draws nothing. */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  /**
   * The alerts of the numbers changed (one fell, or one recovered or was unpinned): the Visão geral reads "Precisa de você" again. A quiet refresh writes no
   * message, so nothing else would tell the screen (P1-08).
   */
  readonly onAlertsChange?: (() => void) | undefined
}

/** The section wired to the host. Nothing at all when the host cannot keep numbers (an old host, a fake). */
export function ConnectedSeusNumeros({ remote, tenant, onAlertsChange }: ConnectedSeusNumerosProps): ReactNode {
  const binding = useIndicators({ remote, tenant })
  return binding === undefined ? null : <SeusNumerosBound binding={binding} onAlertsChange={onAlertsChange} />
}

/** What the alerts look like right now: the same string means the Visão geral already shows them. */
export function alertsSignature(items: readonly IndicatorUi[]): string {
  return items.flatMap(item => (item.alert === undefined ? [] : [`${item.id}:${item.alert.at}`])).sort().join('|')
}

/** The section for a binding the caller already holds (the Visão geral reads the same binding for its fall notices). */
export function SeusNumerosBound({ binding, onAlertsChange }: { readonly binding: IndicatorsBinding; readonly onAlertsChange?: (() => void) | undefined }): ReactNode {
  const signature = alertsSignature(binding.items)
  const seen = useRef('')
  const callback = useRef(onAlertsChange)
  callback.current = onAlertsChange
  useEffect(() => {
    if (!binding.loaded || signature === seen.current) return
    seen.current = signature
    callback.current?.()
  }, [binding.loaded, signature])
  return (
    <SeusNumeros
      items={binding.items}
      loaded={binding.loaded}
      onRefresh={(card) => { void binding.refresh(card.id).catch(() => undefined) }}
      onUnpin={(card) => { void binding.unpin(card.id).catch(() => undefined) }}
    />
  )
}
