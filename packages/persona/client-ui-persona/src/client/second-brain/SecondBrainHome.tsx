/** Empresa › Segundo cérebro — início (SECOND-BRAIN-SPEC §1). */

import { useMemo, useState, type ReactNode } from 'react'
import type { BrainHomeView, BrainKindView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import {
  BrandIcon,
  Button,
  Card,
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
  grantActionLabel,
  grantIsActive,
  grantTargetLabel,
  brainPageTitle,
  pageLead,
  pageToChangeItem,
  personaPortrait,
  topBrainPages,
} from './brain-ui-adapters.ts'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import { NextStepBar } from '../next-step/NextStepBar.tsx'
import { VaultFolderMenu } from './VaultFolderMenu.tsx'
import styles from './SecondBrain.module.css'

export type SecondBrainSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface SecondBrainHomeProps {
  readonly dict?: LocaleDict
  readonly home?: BrainHomeView | null
  readonly pages?: readonly BrainPageView[]
  readonly personaNames?: Readonly<Record<string, string>>
  /** `person:<memberId>` → name ("Você" for the viewer). */
  readonly memberNames?: Readonly<Record<string, string>>
  /** Persona id -> animal portrait (the one she was hired with). */
  readonly personaAvatars?: Readonly<Record<string, string>>
  readonly initialState?: SecondBrainSurfaceState
  readonly onRemoteRetry?: () => void
  readonly onRevokeGrant?: (grantId: string) => void
  readonly onOpenPermissions?: () => void
  readonly onOpenKind?: (kind: BrainKindView) => void
  readonly onOpenPage?: (pageId: string) => void
  readonly onBringContext?: () => void
  /** "Nova página" (the header button, no type) or a "+ Tipo" chip (that type). */
  readonly onWritePage?: (kind?: BrainKindView) => void
  /** The first real lines of the company profile (the Cofre brief), for "Comece aqui". Only the first 3 are shown. */
  readonly companyLines?: readonly string[] | undefined
  /** "Descrever a empresa em 3 frases": where the person writes the profile. Absent = no invitation. */
  readonly onDescribeCompany?: (() => void) | undefined
  /** SB-4: write the pages into a folder / read a folder through the BYC review. Both live in the ⋯ menu. */
  readonly onExportVault?: (() => void) | undefined
  readonly onImportFolder?: (() => void) | undefined
  /** The installed app (native folder picker). Without it the menu items are disabled and say so. */
  readonly vaultFolderAvailable?: boolean | undefined
  /** Injectable clock (tests, captures); defaults to now. */
  readonly nowMs?: number
}

function grantScope(
  dict: LocaleDict,
  grant: BrainHomeView['activeGrants'][number],
  personaNames: Readonly<Record<string, string>>,
  personaAvatars: Readonly<Record<string, string>>,
): PermissionScope {
  const name = personaNames[grant.personaId] ?? grant.personaId
  return {
    persona: name,
    personaAvatar: personaAvatars[grant.personaId] ?? personaPortrait({ name }),
    action: grantActionLabel(dict, grant.action),
    target: grantTargetLabel(dict, grant.target),
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
  memberNames = {},
  personaAvatars = {},
  initialState = 'ready',
  onRemoteRetry,
  onRevokeGrant,
  onOpenPermissions,
  onOpenKind,
  onOpenPage,
  onBringContext,
  onWritePage,
  companyLines = [],
  onDescribeCompany,
  onExportVault,
  onImportFolder,
  vaultFolderAvailable = false,
  nowMs: nowMsProp,
}: SecondBrainHomeProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [query, setQuery] = useState('')
  const changed = useMemo(
    () => (home === null ? [] : home.changedToday.map(page => pageToChangeItem(
      dict,
      page,
      personaNames,
      onOpenPage === undefined ? undefined : () => { onOpenPage(page.id) },
      memberNames,
    ))),
    [dict, home, memberNames, onOpenPage, personaNames],
  )
  // The host lists every grant that was not revoked; one that already ran out (e.g. a 7-day permission) is not active.
  const nowMs = nowMsProp ?? Date.now()
  const activeGrants = (home?.activeGrants ?? []).filter(grant => grantIsActive(grant, nowMs))
  const contradictions = home?.contradictions ?? []
  const startHerePage = home === null ? undefined : pages.find(page => page.id === home.startHereId)
  const startHereLines = companyLines.map(line => line.trim()).filter(line => line !== '').slice(0, 3)
  const sparseHome = changed.length === 0
    && contradictions.length === 0
    && activeGrants.length === 0
    && pages.length <= 3
  const typeCounts = useMemo(() => countPagesByKind(pages), [pages])
  const popular = useMemo(() => topBrainPages(pages), [pages])
  const grantTotal = activeGrants.length
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return []
    // Find by what the person reads ("Responder no WhatsApp…") as well as by the stored title and the text.
    return pages.filter(page => brainPageTitle(dict, page).toLowerCase().includes(q) || page.title.toLowerCase().includes(q) || page.body.toLowerCase().includes(q)).slice(0, 8)
  }, [pages, query])

  const header = (
    <ScreenHeader
      icon="conhecimento-memoria"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      {...(onOpenPermissions === undefined && onWritePage === undefined && onExportVault === undefined && onImportFolder === undefined
        ? {}
        : {
          actions: (
            <>
              {onWritePage !== undefined && (
                <Button variant="primary" size="m" onClick={() => { onWritePage() }}>
                  {t('page.new')}
                </Button>
              )}
              {onOpenPermissions !== undefined && (
                <Button variant="secondary" size="m" onClick={() => { onOpenPermissions() }}>
                  {t('nav.permissions')}
                </Button>
              )}
              {(onExportVault !== undefined || onImportFolder !== undefined) && (
                <VaultFolderMenu dict={dict} available={vaultFolderAvailable} onExport={onExportVault} onImport={onImportFolder} />
              )}
            </>
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
        {(onWritePage !== undefined || (onDescribeCompany !== undefined && startHereLines.length === 0)) && (
          <div className={styles.emptyActions}>
            {onDescribeCompany !== undefined && startHereLines.length === 0 && (
              <Button variant="secondary" onClick={() => { onDescribeCompany() }}>{t('home.startHereCta')}</Button>
            )}
            {onWritePage !== undefined && (
              <Button variant="secondary" onClick={() => { onWritePage() }}>{t('empty.action.write')}</Button>
            )}
          </div>
        )}
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="second-brain">
      {header}
      <NextStepBar
        screen="brain"
        state={{
          isEmpty: sparseHome,
          blockedWaitingCount: contradictions.length,
          stalePagesCount: pages.filter((page) => {
            const updatedMs = Date.parse(page.updatedAt)
            return Number.isFinite(updatedMs) && nowMs - updatedMs >= 30 * 24 * 60 * 60 * 1000
          }).length,
        }}
        onAction={(step) => {
          if (step.actionId === 'ask-librarian' && pages[0] !== undefined) onOpenPage?.(pages[0].id)
        }}
      />
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
                <button type="button" className={styles.brainPageLink} onClick={() => { onOpenPage?.(page.id) }}>
                  {brainPageTitle(dict, page)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sparseHome && (
        <Card padding="l" className={styles.sparseHero}>
          <img
            className={styles.sparseArt}
            src={ILLUSTRATIONS.bibliotecario}
            alt=""
            width={200}
            height={200}
            decoding="async"
          />
          <p className={styles.sparseTitle}>{t('empty.title')}</p>
          <p className={styles.sparseHint}>{t('empty.hint')}</p>
          {onBringContext !== undefined && (
            <Button variant="primary" size="m" onClick={() => { onBringContext() }}>
              {t('empty.action.byc')}
            </Button>
          )}
        </Card>
      )}
      {startHereLines.length > 0 ? (
        // DESIGN-01 #16: the first lines of what the person wrote about the company, never the index's dry sentence.
        <Card padding="m" eyebrow={t('home.startHereLabel')}>
          <div className={styles.startHere}>
            <ul className={styles.companyLines}>
              {startHereLines.map(line => <li key={line} data-company-line="">{line}</li>)}
            </ul>
            {/* Carbon P1-08: the description can be changed after it is saved (the same dialog, with the text the team reads now). */}
            {onDescribeCompany !== undefined && (
              <Button variant="secondary" size="s" aria-label={`${t('page.edit')} ${t('home.startHereLabel')}`} onClick={() => { onDescribeCompany() }}>
                {t('page.edit')}
              </Button>
            )}
            {startHerePage !== undefined && onOpenPage !== undefined && (
              <Button variant="secondary" size="s" aria-label={`${t('home.startHereOpen')} ${startHerePage.title}`} onClick={() => { onOpenPage(startHerePage.id) }}>
                {t('home.startHereOpen')}
              </Button>
            )}
          </div>
        </Card>
      ) : onDescribeCompany !== undefined ? (
        // No profile yet: the host always keeps an index page whose only sentence is "Atualizado sozinho…", so the page is not what invites; the person is.
        <Card padding="m" eyebrow={t('home.startHereLabel')}>
          <div className={styles.startHere}>
            <Button variant="primary" size="m" onClick={() => { onDescribeCompany() }}>{t('home.startHereCta')}</Button>
            {startHerePage !== undefined && onOpenPage !== undefined && (
              <Button variant="ghost" size="s" aria-label={`${t('home.startHereOpen')} ${startHerePage.title}`} onClick={() => { onOpenPage(startHerePage.id) }}>
                {t('home.startHereOpen')}
              </Button>
            )}
          </div>
        </Card>
      ) : startHerePage !== undefined && onOpenPage !== undefined ? (
        <Card padding="m" eyebrow={t('home.startHereLabel')}>
          <div className={styles.startHere}>
            {/* The start of the page itself (its title is already the card's eyebrow). */}
            <p className={styles.startHereLead}>{pageLead(startHerePage.body) || startHerePage.title}</p>
            <Button variant="secondary" size="s" aria-label={`${t('home.startHereOpen')} ${startHerePage.title}`} onClick={() => { onOpenPage(startHerePage.id) }}>
              {t('home.startHereOpen')}
            </Button>
          </div>
        </Card>
      ) : null}
      <div className={styles.homeLayout}>
        <div className={styles.homeMain}>
          <Card padding="m" eyebrow={t('sections.changedToday')}>
            <ChangeFeed items={changed.slice(0, 8)} label={t('sections.changedToday')} empty={t('sections.changedEmpty')} />
          </Card>
          <Card padding="m" eyebrow={t('sections.needsYou')}>
            {contradictions.length === 0 ? (
              <p className={styles.muted}>{t('sections.needsYouOk')}</p>
            ) : (
              <div className={styles.contradictionStack}>
                {contradictions.map((page) => {
                  const sides = contradictionSides(dict, page)
                  return (
                    <ContradictionCard
                      key={page.id}
                      pageTitle={brainPageTitle(dict, page)}
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
          </Card>
        </div>
        <aside className={styles.homeAside}>
          <Card padding="m" eyebrow={t('sections.permissions')}>
            {activeGrants.length === 0 ? (
              <p className={styles.muted}>{t('sections.permissionsEmpty')}</p>
            ) : (
              <>
                <ul className={styles.permissionList}>
                  {activeGrants.slice(0, 3).map(grant => (
                    <PermissionRow
                      key={grant.id}
                      scope={grantScope(dict, grant, personaNames, personaAvatars)}
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
                  <button type="button" className={styles.brainPageLink} onClick={() => { onOpenPermissions() }}>
                    {t('sections.permissionsAll', { count: grantTotal })}
                  </button>
                )}
              </>
            )}
          </Card>
          <Card padding="m" eyebrow={t('sections.mostUsed')}>
            <ul className={styles.compactList}>
              {popular.map(page => (
                <li key={page.id}>
                  <button type="button" className={styles.brainPageLink} onClick={() => { onOpenPage?.(page.id) }}>
                    {brainPageTitle(dict, page)}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card padding="m" eyebrow={t('sections.byType')}>
            <ul className={styles.typeNav}>
              {BRAIN_KINDS.filter(kind => (typeCounts[kind] ?? 0) > 0).map(kind => (
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
            {/* A type with no page yet is not a row of zeros: it is a chip that starts the first one. */}
            {onWritePage !== undefined && BRAIN_KINDS.some(kind => (typeCounts[kind] ?? 0) === 0) && (
              <div className={styles.newOfType}>
                <p className={styles.muted}>{t('sections.byTypeNew')}</p>
                <div className={styles.typeChips}>
                  {BRAIN_KINDS.filter(kind => (typeCounts[kind] ?? 0) === 0).map(kind => (
                    <button
                      key={kind}
                      type="button"
                      className={styles.typeChip}
                      aria-label={t('home.newOfTypeAria', { type: brainKindLabel(dict, kind) })}
                      onClick={() => { onWritePage(kind) }}
                    >
                      {`+ ${brainKindLabel(dict, kind)}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </Screen>
  )
}
