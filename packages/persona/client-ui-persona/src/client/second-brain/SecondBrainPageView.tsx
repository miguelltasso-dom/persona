import { useEffect, useState, type ReactNode } from 'react'
import type { BrainPageView, BrainVersionView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { BrandIcon, Button, Card, PageMeta, Screen, ScreenHeader } from '../primitives/index.ts'
import { brainKindBrandIcon, brainKindLabel, brainPageTitle, brainSourceDisplay, pageConfirmation } from './brain-ui-adapters.ts'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

export interface SecondBrainPageViewProps {
  readonly dict?: LocaleDict
  readonly page: BrainPageView
  readonly versions: readonly BrainVersionView[]
  readonly backlinkPages: readonly BrainPageView[]
  readonly onBack: () => void
  readonly onOpenPage?: ((pageId: string) => void) | undefined
  readonly onSaveBody?: ((body: string) => void) | undefined
  /** Names for the history (persona id / member id → name); an id is never shown. */
  readonly personaNames?: Readonly<Record<string, string>>
  readonly memberNames?: Readonly<Record<string, string>>
  /** Puts an older version back. Without it the history has no "Restaurar". */
  readonly onRestoreVersion?: ((revision: number) => void) | undefined
}

export function SecondBrainPageView({
  dict = defaultDict,
  page,
  versions,
  backlinkPages,
  onBack,
  onOpenPage,
  onSaveBody,
  personaNames = {},
  memberNames = {},
  onRestoreVersion,
}: SecondBrainPageViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  // Sources a person can read: an internal id (`grant:owner`) is not a source.
  const sources = page.sources.flatMap((source) => {
    const text = brainSourceDisplay(dict, source)
    return text === undefined ? [] : [text]
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(page.body)
  useEffect(() => { setDraft(page.body); setEditing(false) }, [page.id, page.body])

  const confirmation = pageConfirmation(dict, page, Date.now())

  return (
    <Screen className={styles.shell} data-persona-surface="second-brain-page">
      <ScreenHeader
        icon="conhecimento-memoria"
        eyebrow={(
          <span className={styles.kindEyebrow}>
            <BrandIcon name={brainKindBrandIcon(page.kind)} size={18} />
            {brainKindLabel(dict, page.kind)}
          </span>
        )}
        title={brainPageTitle(dict, page)}
        subtitle={page.restricted ? t('page.visibilityPrivate') : t('page.visibilityTeam')}
        actions={(
          <button type="button" className={styles.backLink} onClick={onBack}>
            {t('page.backHome')}
          </button>
        )}
      />
      <div className={styles.pageLayout}>
        <article className={styles.pageBody}>
          <div className={styles.pageToolbar}>
            <Button
              size="s"
              variant="secondary"
              onClick={() => {
                if (editing && onSaveBody !== undefined && draft !== page.body) {
                  onSaveBody(draft)
                }
                setEditing(value => !value)
              }}
            >
              {editing ? t('page.save') : t('page.edit')}
            </Button>
          </div>
          {editing ? (
            <textarea
              className={styles.pageEditor}
              value={draft}
              onChange={(event) => { setDraft(event.target.value) }}
              aria-label={t('page.edit')}
            />
          ) : (
            <pre className={styles.pageMarkdown}>{page.body}</pre>
          )}
          {sources.length > 0 && (
            <Card padding="m" eyebrow={t('page.sources')}>
              <ul className={styles.sourceList}>
                {sources.map(source => <li key={source}>{source}</li>)}
              </ul>
            </Card>
          )}
        </article>
        <PageMeta
          properties={[
            { label: 'slug', value: page.slug },
            { label: 'rev', value: String(page.revision) },
          ]}
          backlinks={backlinkPages.map(row => ({
            id: row.id,
            title: brainPageTitle(dict, row),
            type: brainKindLabel(dict, row.kind),
            ...(onOpenPage === undefined ? {} : { onOpen: () => { onOpenPage(row.id) } }),
          }))}
          history={versions.map(row => ({
            id: String(row.revision),
            who: row.editorKind === 'persona'
              ? (personaNames[row.editorId] ?? t('feed.editorPersona'))
              : (memberNames[row.editorId] ?? t('feed.whoMember')),
            what: row.editorKind === 'persona' ? t('feed.verbUpdated') : t('page.edit'),
            time: row.createdAt.slice(0, 10),
            // The newest version is the page as it is now: nothing to restore.
            ...(onRestoreVersion === undefined || row.revision === page.revision ? {} : { onRestore: () => { onRestoreVersion(row.revision) } }),
          }))}
          confirmation={{
            text: confirmation.text,
            stale: confirmation.stale,
            onConfirm: () => { onSaveBody?.(page.body) },
          }}
          labels={{
            properties: t('meta.properties'),
            backlinks: t('meta.backlinks'),
            noBacklinks: t('meta.noBacklinks'),
            history: t('meta.history'),
            confirm: t('meta.confirm'),
            view: t('meta.view'),
            ...(onRestoreVersion === undefined ? {} : { restore: t('meta.restore') }),
          }}
        />
      </div>
    </Screen>
  )
}
