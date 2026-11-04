/** Empresa › Segundo cérebro — início (SECOND-BRAIN-SPEC §1). */

import { useMemo, useState, type ReactNode } from 'react'
import type { BrainHomeView, BrainKindView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import {
  BrandIcon,
  Button,
  ChangeFeed,
  ContradictionCard,
  Input,
  PermissionRow,
  Screen,
  ScreenHeader,
  type PermissionScope,
} from '../primitives/index.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import {
  BRAIN_KINDS,
  brainKindBrandIcon,
  brainKindLabel,
  contradictionSides,
  countPagesByKind,
  pageToChangeItem,
  topBrainPages,
} from './brain-ui-adapters.ts'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

export type SecondBrainSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface SecondBrainHomeProps {
  readonly dict?: LocaleDict
  readonly home?: BrainHomeView | null
  readonly pages?: readonly BrainPageView[]
  readonly personaNames?: Readonly<Record<string, string>>
  readonly initialState?: SecondBrainSurfaceState
  readonly onRemoteRetry?: () => void
  readonly onRevokeGrant?: (grantId: string) => void
  readonly onOpenPermissions?: () => void
  readonly onOpenKind?: (kind: BrainKindView) => void
  readonly onOpenPage?: (pageId: string) => void
  readonly onBringContext?: () => void
  readonly onWritePage?: () => void
}

function grantScope(
  grant: BrainHomeView['activeGrants'][number],
  personaNames: Readonly<Record<string, string>>,
): PermissionScope {
  return {
    persona: personaNames[grant.personaId] ?? grant.personaId,
    action: grant.action,
    target: grant.target,
  }
}

function grantValidityLabel(dict: LocaleDict, grant: BrainHomeView['activeGrants'][number]): string {
  if (grant.revokedAt !== undefined) return bindLocale(dict, 'permissions.revoked')
  if (grant.validity === 'once') return bindLocale(dict, 'permissions.validityOnce')
  if (grant.validity === '7d') {
    return grant.expiresAt === undefined
      ? bindLocale(dict, 'permissions.validity7d')
      : bindLocale(dict, 'permissions.validity7dUntil', { date: grant.expiresAt.slice(0, 10) })
  }
  return bindLocale(dict, 'permissions.validityUntilRevoke')
}

export function SecondBrainHome({
  dict = defaultDict,
  home = null,
  pages = [],
  personaNames = {},
  initialState = 'ready',
  onRemoteRetry,
  onRevokeGrant,
  onOpenPermissions,
  onOpenKind,
  onOpenPage,
  onBringContext,
  onWritePage,
}: SecondBrainHomeProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [query, setQuery] = useState('')
  const changed = useMemo(
    () => (home === null ? [] : home.changedToday.map(page => pageToChangeItem(
      dict,
      page,
      onOpenPage === undefined ? undefined : () => { onOpenPage(page.id) },
    ))),
    [dict, home, onOpenPage],
  )
  const activeGrants = home?.activeGrants ?? []
  const contradictions = home?.contradictions ?? []
  const typeCounts = useMemo(() => countPagesByKind(pages), [pages])
  const popular = useMemo(() => topBrainPages(pages), [pages])
  const grantTotal = activeGrants.length
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return []
    return pages.filter(page => page.title.toLowerCase().includes(q) || page.body.toLowerCase().includes(q)).slice(0, 8)
  }, [pages, query])

  const header = (
    <ScreenHeader
      icon="conhecimento-memoria"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      {...(onOpenPermissions === undefined
        ? {}
        : {
          actions: (
            <Button variant="secondary" size="m" onClick={() => { onOpenPermissions() }}>
              {t('nav.permissions')}
            </Button>
          ),
        })}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="second-brain">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="second-brain">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRemoteRetry?.() }} />
      </Screen>
    )
  }
  if (initialState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="second-brain">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="bibliotecario"
          titleKey="empty.title"
          hintKey="empty.hint"
          {...(onBringContext === undefined ? {} : { onPrimary: onBringContext, primaryKey: 'empty.action.byc' })}
        />
        {onWritePage !== undefined && (
          <div className={styles.emptyActions}>
            <Button variant="secondary" onClick={() => { onWritePage() }}>{t('empty.action.write')}</Button>
          </div>
        )}
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="second-brain">
      {header}
      <Input
        label={t('search.placeholder')}
        hideLabel
        className={styles.searchField}
        value={query}
        onChange={(event) => { setQuery(event.target.value) }}
        placeholder={t('search.placeholder')}
      />
      {searchHits.length > 0 && (
        <section aria-label={t('search.results', { count: searchHits.length })}>
          <ul className={styles.compactList}>
            {searchHits.map(page => (
              <li key={page.id}>
                <button type="button" className={styles.pageLink} onClick={() => { onOpenPage?.(page.id) }}>
                  {page.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className={styles.homeLayout}>
        <div className={styles.homeMain}>
          <section aria-labelledby="persona-brain-changed">
            <h2 id="persona-brain-changed" className={styles.sectionTitle}>{t('sections.changedToday')}</h2>
            <ChangeFeed items={changed.slice(0, 8)} label={t('sections.changedToday')} empty={t('sections.changedEmpty')} />
          </section>
          <section aria-labelledby="persona-brain-needs">
            <h2 id="persona-brain-needs" className={styles.sectionTitle}>{t('sections.needsYou')}</h2>
            {contradictions.length === 0 ? (
              <p className={styles.muted}>{t('sections.needsYouOk')}</p>
            ) : (
              <div className={styles.contradictionStack}>
                {contradictions.map((page) => {
                  const sides = contradictionSides(dict, page)
                  return (
                    <ContradictionCard
                      key={page.id}
                      pageTitle={page.title}
                      current={sides.current}
                      incoming={sides.incoming}
                      onKeepCurrent={() => { onOpenPage?.(page.id) }}
                      onUseIncoming={() => { onOpenPage?.(page.id) }}
                      onEdit={() => { onOpenPage?.(page.id) }}
                      labels={{
                        title: name => t('contradiction.cardTitle', { page: name }),
                        current: t('contradiction.current'),
                        incoming: t('contradiction.incoming'),
                        keep: t('contradiction.keep'),
                        use: t('contradiction.use'),
                        edit: t('contradiction.edit'),
                      }}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
        <aside className={styles.homeAside}>
          <section aria-labelledby="persona-brain-permissions">
            <h2 id="persona-brain-permissions" className={styles.sectionTitle}>{t('sections.permissions')}</h2>
            {activeGrants.length === 0 ? (
              <p className={styles.muted}>{t('sections.permissionsEmpty')}</p>
            ) : (
              <>
                <ul className={styles.permissionList}>
                  {activeGrants.slice(0, 3).map(grant => (
                    <PermissionRow
                      key={grant.id}
                      scope={grantScope(grant, personaNames)}
                      grantedBy={t('permissions.grantedByYou')}
                      validityText={grantValidityLabel(dict, grant)}
                      usage={grant.useCount > 0 ? t('permissions.usage', { count: grant.useCount }) : undefined}
                      labels={{
                        revoke: t('permissions.revoke'),
                        confirmRevoke: t('permissions.confirmRevoke'),
                        cancel: t('permissions.cancel'),
                        revoked: t('permissions.revoked'),
                      }}
                      {...(onRevokeGrant === undefined
                        ? {}
                        : { onRevoke: () => { onRevokeGrant(grant.id) } })}
                    />
                  ))}
                </ul>
                {onOpenPermissions !== undefined && grantTotal > 0 && (
                  <button type="button" className={styles.linkButton} onClick={() => { onOpenPermissions() }}>
                    {t('sections.permissionsAll', { count: grantTotal })}
                  </button>
                )}
              </>
            )}
          </section>
          <section aria-labelledby="persona-brain-popular">
            <h2 id="persona-brain-popular" className={styles.sectionTitle}>{t('sections.mostUsed')}</h2>
            <ul className={styles.compactList}>
              {popular.map(page => (
                <li key={page.id}>
                  <button type="button" className={styles.pageLink} onClick={() => { onOpenPage?.(page.id) }}>
                    {page.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="persona-brain-types">
            <h2 id="persona-brain-types" className={styles.sectionTitle}>{t('sections.byType')}</h2>
            <ul className={styles.typeNav}>
              {BRAIN_KINDS.map(kind => (
                <li key={kind}>
                  <button type="button" className={styles.typeRow} onClick={() => { onOpenKind?.(kind) }}>
                    <span className={styles.typeRowLabel}>
                      <BrandIcon name={brainKindBrandIcon(kind)} size={18} />
                      {brainKindLabel(dict, kind)}
                    </span>
                    <span className={styles.typeCount}>{typeCounts[kind] ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </Screen>
  )
}
