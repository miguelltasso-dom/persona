/**
 * Configurações › Ferramentas (item 26, Muse COLHEITA-MUSE §26): "Ferramentas do seu negócio". Ligadas (with health), the filters, the grid
 * "Para ligar" and a collapsed "Em breve". No technical word, no third party's logo: a tool is its NAME plus the art of its category.
 *
 * Nothing here is a dead control: a button exists only when the screen was given the action (`onConnect`, `onWho`, `onTest`, `onOff`); the host
 * decides what is connectable (`promised`) and what is already on (`linked`) — the screen never decides either.
 */

import { useState, type ReactNode } from 'react'
import { Button, Card, Chip, EmptyState, FilterChips, MenuButton, Screen, ScreenHeader, UiIcon, type MenuItem } from '../primitives/index.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as defaultDict } from '../locale/tools/locales.ts'
import styles from './Tools.module.css'
import {
  CATEGORY_ART,
  CATEGORY_GLYPH,
  countsOf,
  gridOf,
  linkedToolsOf,
  type LinkedTool,
  type ToolCard,
  type ToolCatalog,
  type ToolFilter,
  type ToolHealthLine,
  type ToolHealthState,
} from './tools-model.ts'

export type ToolsSurfaceState = 'loading' | 'error' | 'ready'

export interface ToolsActions {
  /** "Conectar": starts the connection of a tool the host says can be connected. Absent = no button (and that card waits in "Em breve"). */
  readonly onConnect?: ((card: ToolCard) => void) | undefined
  /** "Ligar na sua conta do Claude": the tools that live in the person's Claude account. Absent = no button (and that card waits in "Em breve"). */
  readonly onClaude?: ((card: ToolCard) => void) | undefined
  /** "Quem pode usar" of a connected tool. */
  readonly onWho?: ((card: ToolCard) => void) | undefined
  /** "Testar agora": one read-only call. */
  readonly onTest?: ((card: ToolCard) => Promise<void>) | undefined
  /** "Desligar". */
  readonly onOff?: ((card: ToolCard) => Promise<void>) | undefined
}

export interface ToolsViewProps {
  readonly dict?: LocaleDict
  readonly state?: ToolsSurfaceState
  readonly catalog?: ToolCatalog | undefined
  readonly health?: readonly ToolHealthLine[]
  readonly actions?: ToolsActions | undefined
  readonly onRetry?: (() => void) | undefined
  /** "Quem pode usar?": the 440 px panel of a connected tool (the screen only places it; the host-bound one comes from the remote panel). Absent = the menu has no such item. */
  readonly whoPanel?: ((card: ToolCard, close: () => void) => ReactNode) | undefined
}

const HEALTH_CHIP: Readonly<Record<Exclude<ToolHealthState, 'ok'>, { readonly key: string; readonly tone: 'warning' | 'neutral' }>> = {
  reconnect: { key: 'health.reconnect', tone: 'warning' },
  permission: { key: 'health.permission', tone: 'warning' },
  offline: { key: 'health.offline', tone: 'neutral' },
  missing: { key: 'health.missing', tone: 'neutral' },
}

export function ToolsView({ dict = defaultDict, state = 'ready', catalog, health = [], actions, onRetry, whoPanel }: ToolsViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [filter, setFilter] = useState<ToolFilter>('all')
  const [whoCard, setWhoCard] = useState<ToolCard | undefined>(undefined)
  const header = <ScreenHeader icon="configuracoes" eyebrow={t('header.eyebrow')} title={t('title')} subtitle={t('subtitle')} />

  if (state === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="tools">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
      </Screen>
    )
  }
  if (state === 'error' || catalog === undefined) {
    // Muse 12/11: "Tentar de novo" has no arrow (the arrow means "go to"), so this screen draws its own error instead of the shared one.
    return (
      <Screen className={styles.shell} data-persona-surface="tools">
        {header}
        <div role="alert">
          <EmptyState
            illustration={ILLUSTRATIONS['empty-error']}
            title={t('error.title')}
            action={<Button variant="primary" onClick={() => { onRetry?.() }}>{t('error.retry')}</Button>}
          />
        </div>
      </Screen>
    )
  }

  const linked = linkedToolsOf(catalog, health)
  const counts = countsOf(catalog)
  // A card is in "Para ligar" only when this build can connect it; otherwise it waits in "Em breve" (never a card with nothing to press).
  const canConnect = (card: ToolCard): boolean => card.via === 'claude-account' ? actions?.onClaude !== undefined : card.via === 'unconfirmed' ? false : actions?.onConnect !== undefined
  const grid = gridOf(catalog, filter, canConnect)
  const categoryName = (card: ToolCard): string => t(`category.${card.category}`)
  const chips = [
    { id: 'all' as ToolFilter, label: t('filter.all'), count: counts.all },
    ...catalog.categories.map(category => ({ id: category.id as ToolFilter, label: t(`category.${category.id}`), count: counts[category.id] })),
  ]

  // The Brush's art of the category (40 px in a row, 64 px in a card); the plain glyph only when that art is not in the build.
  const art = (card: ToolCard, size: 'small' | 'large'): ReactNode => {
    const src = ILLUSTRATIONS[`categoria-${CATEGORY_ART[card.category]}-96`]
    const px = size === 'small' ? 40 : 64
    return src === undefined
      ? (
        <span className={size === 'small' ? styles.artSmall : styles.artLarge} data-category={card.category} role="img" aria-label={categoryName(card)}>
          <UiIcon name={CATEGORY_GLYPH[card.category]} size={size === 'small' ? 22 : 34} strokeWidth={1.6} />
        </span>
      )
      : <img className={size === 'small' ? styles.artImgSmall : styles.artImgLarge} data-category={card.category} src={src} alt={categoryName(card)} width={px} height={px} />
  }

  const healthMark = (item: LinkedTool): ReactNode => {
    if (item.state === 'ok') {
      return <span className={styles.dot} role="img" aria-label={t('health.dot', { name: item.card.name })} data-health="ok" />
    }
    const chip = HEALTH_CHIP[item.state]
    return <Chip tone={chip.tone} size="s" {...(item.sentence === '' ? {} : { title: item.sentence })}>{t(chip.key)}</Chip>
  }

  const menuItems = (card: ToolCard): readonly MenuItem[] => [
    ...(actions?.onWho === undefined && whoPanel === undefined ? [] : [{ id: 'who', label: t('menu.who'), onSelect: () => { actions?.onWho?.(card); if (whoPanel !== undefined) setWhoCard(card) } }]),
    ...(actions?.onTest === undefined ? [] : [{ id: 'test', label: t('menu.test'), onSelect: () => { void actions.onTest!(card).catch(() => undefined) } }]),
    ...(actions?.onOff === undefined ? [] : [{ id: 'off', label: t('menu.off'), tone: 'danger' as const, onSelect: () => { void actions.onOff!(card).catch(() => undefined) } }]),
  ]

  return (
    <Screen className={styles.shell} data-persona-surface="tools">
      {header}
      <div className={styles.layout}>
        <div className={styles.main}>

          <section aria-labelledby="tools-linked-title" className={styles.section}>
            <h2 id="tools-linked-title" className={styles.sectionTitle}>{t('linked.title', { count: linked.length })}</h2>
            {linked.length === 0
              ? <p className={styles.note}>{t('linked.empty')}</p>
              : (
                <ul className={styles.linkedList}>
                  {linked.map((item) => {
                    const items = menuItems(item.card)
                    return (
                      <li key={item.card.id} className={styles.linkedRow} data-tool={item.card.id} data-health={item.state}>
                        {art(item.card, 'small')}
                        <span className={styles.linkedName}>{item.card.name}</span>
                        <span className={styles.linkedHealth}>{healthMark(item)}</span>
                        {items.length > 0 && (
                          <MenuButton label={t('menu.label', { name: item.card.name })} items={items} variant="ghost" icon={<UiIcon name="more" size={18} />} />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
          </section>

          <FilterChips label={t('filters.label')} items={chips} value={filter} onChange={setFilter} className={styles.filters} />

          <section aria-labelledby="tools-grid-title" className={styles.section}>
            <h2 id="tools-grid-title" className={styles.sectionTitle}>{t('grid.title')}</h2>
            {grid.ready.length === 0 && grid.soon.length === 0
              ? <EmptyState compact title={t('grid.empty')} />
              : grid.ready.length === 0
                ? <p className={styles.note}>{t('grid.noneYet')}</p>
                : (
                  <ul className={styles.grid}>
                    {grid.ready.map(card => (
                      <li key={card.id} className={styles.gridItem}>
                        <Card padding="m" className={styles.card} data-tool={card.id}>
                          {art(card, 'large')}
                          <h3 className={styles.cardName}>{card.name}</h3>
                          <p className={styles.cardSentence}>{card.sentence}</p>
                          <div className={styles.cardFoot}>
                            {card.via === 'claude-account'
                              ? <Button variant="secondary" aria-label={t('card.claudeNamed', { name: card.name })} onClick={() => { actions?.onClaude?.(card) }}>{t('card.claude')}</Button>
                              : <Button variant="secondary" aria-label={t('card.connectNamed', { name: card.name })} onClick={() => { actions?.onConnect?.(card) }}>{t('card.connect')}</Button>}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
          </section>

          {grid.soon.length > 0 && (
            <details className={styles.soon}>
              <summary className={styles.soonSummary}>
                <UiIcon name="chevronRight" size={16} className={styles.soonIcon} />
                {t('soon.title', { count: grid.soon.length })}
              </summary>
              <p className={styles.note}>{t('soon.hint')}</p>
              <ul className={styles.grid}>
                {grid.soon.map(card => (
                  <li key={card.id} className={styles.gridItem}>
                    <Card padding="m" className={`${styles.card} ${styles.cardSoon}`} data-tool={card.id} data-soon="true">
                      {art(card, 'large')}
                      <h3 className={styles.cardName}>{card.name}</h3>
                      <p className={styles.cardSentence}>{card.sentence}</p>
                      <div className={styles.cardFoot}><Chip tone="neutral" size="s">{t('soon.chip')}</Chip></div>
                    </Card>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {whoCard !== undefined && whoPanel !== undefined && <div className={styles.side} key={whoCard.id}>{whoPanel(whoCard, () => { setWhoCard(undefined) })}</div>}
      </div>
    </Screen>
  )
}
