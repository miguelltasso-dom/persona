/** BRIEFING 18 / BRING-CONTEXT-SPEC — onboarding passo 2 (Prism). */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BringContextPreview } from '@deepseek-ai/dsh-persona-core'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import {
  CopyPrompt,
  FolderDrop,
  PasteBox,
  ProposalReview,
  UiIcon,
  defaultChoice,
  usePawCelebration,
  type AiSource,
  type FolderDropState,
  type PastedSource,
  type ProposalChoice,
} from '../primitives/index.ts'
import {
  buildBringReviewPreview,
  bringPromptForLocale,
  contextProposalsFromPreview,
  vaultMarkdownFromReview,
} from './bring-context-ui.ts'
import { pickVaultFolderPath, personaDesktopBridge } from './persona-desktop-bridge.ts'
import type { BringProvider } from './bring-context-ui.ts'
import styles from './BringYourContextBlock.module.css'

export interface BringPastedChunk {
  readonly id: string
  readonly source: BringProvider
  readonly text: string
}

export interface BringYourContextBlockProps {
  readonly dict: LocaleDict
  readonly locale?: 'pt' | 'en' | undefined
  readonly paste: string
  readonly provider: BringProvider
  readonly pasted: readonly BringPastedChunk[]
  readonly vaultFolderPath: string | null
  readonly cofreSavedCount: number | null
  onPasteChange(text: string): void
  onProviderChange(provider: BringProvider): void
  onPastedChange(chunks: readonly BringPastedChunk[]): void
  onVaultFolderPathChange(path: string | null): void
  onCofreSavedCountChange(count: number | null): void
  onVaultSeedAppend?: ((markdown: string) => void) | undefined
  /** Host vault scan → preview (no auto-save). */
  onScanVaultFolder?: ((rootPath: string) => Promise<BringContextPreview>) | undefined
  /** Host paste parser + vault merge (BYC-1 onboarding). */
  onOrganizePreview?: ((input: {
    readonly pasted: readonly BringPastedChunk[]
    readonly vaultPreview: BringContextPreview | null
  }) => Promise<BringContextPreview>) | undefined
  /** Persist accepted rows into the Cofre (`applyContextProposals` when host exposes it). */
  onApplyReview?: ((preview: BringContextPreview, choices: Readonly<Record<string, ProposalChoice>>) => Promise<number>) | undefined
}

function providerToAi(source: BringProvider): AiSource {
  if (source === 'grok') return 'other'
  return source
}

function folderNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function BringYourContextBlock({
  dict,
  locale = 'pt',
  paste,
  provider,
  pasted,
  vaultFolderPath,
  cofreSavedCount,
  onPasteChange,
  onProviderChange,
  onPastedChange,
  onVaultFolderPathChange,
  onCofreSavedCountChange,
  onVaultSeedAppend,
  onScanVaultFolder,
  onOrganizePreview,
  onApplyReview,
}: BringYourContextBlockProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const paw = usePawCelebration()
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<'capture' | 'review'>('capture')
  const [vaultPreview, setVaultPreview] = useState<BringContextPreview | null>(null)
  const [folderState, setFolderState] = useState<FolderDropState>({ kind: 'idle' })
  const [reviewPreview, setReviewPreview] = useState<BringContextPreview | null>(null)
  const [choices, setChoices] = useState<Readonly<Record<string, ProposalChoice>>>({})
  const [saving, setSaving] = useState(false)

  const prompt = useMemo(() => bringPromptForLocale(dict, locale), [dict, locale])
  const aiSource = providerToAi(provider)
  const pastedChips: PastedSource[] = pasted.map(row => ({
    id: row.id,
    source: providerToAi(row.source),
    chars: row.text.length,
  }))

  const canOrganize = pasted.length > 0 || folderState.kind === 'ready'

  useEffect(() => {
    if (vaultFolderPath === null || vaultFolderPath === '') {
      setFolderState({ kind: 'idle' })
      setVaultPreview(null)
      return
    }
    if (onScanVaultFolder === undefined) {
      setFolderState({ kind: 'error', message: t('byc.vaultHostPending') })
      return
    }
    setFolderState({ kind: 'reading', done: 0 })
    void onScanVaultFolder(vaultFolderPath).then((preview) => {
      setVaultPreview(preview)
      setFolderState({
        kind: 'ready',
        folderName: folderNameFromPath(vaultFolderPath),
        notes: preview.proposals.length,
        ignored: preview.ignored.map(row => row.path),
      })
    }).catch(() => {
      setFolderState({ kind: 'error', message: t('byc.vaultHostPending') })
    })
  }, [vaultFolderPath, onScanVaultFolder, t])

  const copyLabels = useMemo(() => ({
    title: t('byc.copyBlockTitle'),
    lead: t('byc.copyBlockLead'),
    sources: {
      chatgpt: t('byc.provider.chatgpt'),
      claude: t('byc.provider.claude'),
      gemini: t('byc.provider.gemini'),
      other: t('byc.provider.other'),
    },
    hints: {
      chatgpt: t('byc.providerHint.chatgpt'),
      claude: t('byc.providerHint.claude'),
      gemini: t('byc.providerHint.gemini'),
      other: t('byc.providerHint.other'),
    },
    copy: t('byc.copyPrompt'),
    copied: t('byc.copiedCheck'),
    showAll: t('byc.showAll'),
    showLess: t('byc.showLess'),
    tabsLabel: t('byc.tabsLabel'),
  }), [t])

  const openOrganize = (): void => {
    void (async () => {
      const preview = onOrganizePreview === undefined
        ? buildBringReviewPreview(
          pasted.map(row => ({ source: row.source, text: row.text })),
          vaultPreview,
        )
        : await onOrganizePreview({ pasted, vaultPreview })
      setReviewPreview(preview)
      const initial: Record<string, ProposalChoice> = {}
      for (const row of contextProposalsFromPreview(preview)) {
        initial[row.id] = defaultChoice(row)
      }
      setChoices(initial)
      setView('review')
    })()
  }

  const saveReview = (): void => {
    if (reviewPreview === null) return
    void (async () => {
      setSaving(true)
      try {
        let accepted: number
        if (onApplyReview !== undefined) {
          accepted = await onApplyReview(reviewPreview, choices)
        } else {
          const markdown = vaultMarkdownFromReview(reviewPreview, choices)
          accepted = contextProposalsFromPreview(reviewPreview).filter((row) => {
            const choice = choices[row.id] ?? defaultChoice(row)
            return choice.decision === 'accept' && (row.sensitive === undefined || choice.unblocked === true)
          }).length
          if (markdown.length > 0) onVaultSeedAppend?.(markdown)
        }
        onCofreSavedCountChange(accepted)
        paw.celebrate()
        setView('capture')
        setExpanded(false)
      } finally {
        setSaving(false)
      }
    })()
  }

  const chooseFolder = useCallback((): void => {
    void pickVaultFolderPath(t('byc.pickFolderTitle')).then((path) => {
      onVaultFolderPathChange(path)
    })
  }, [onVaultFolderPathChange, t])

  const hasDesktopPicker = personaDesktopBridge() !== undefined

  if (cofreSavedCount !== null && !expanded && view === 'capture') {
    return (
      <section className={styles.block} data-persona-byc="" data-state="saved">
        <button type="button" className={styles.collapsed} onClick={() => { setExpanded(true) }}>
          <span className={styles.collapsedText}>{t('byc.savedSummary', { count: cofreSavedCount })}</span>
          <span className={styles.savedView}>{t('byc.savedView')}</span>
          <UiIcon name="chevronDown" size={18} strokeWidth={2.2} className={styles.chevron} />
        </button>
        <div className={styles.inboxCelebrate}>{paw.node}</div>
      </section>
    )
  }

  return (
    <section className={styles.block} aria-labelledby="persona-byc-title" data-persona-byc="">
      <div className={styles.inboxCelebrate}>{paw.node}</div>
      {!expanded ? (
        <button
          type="button"
          className={styles.collapsed}
          aria-expanded={false}
          aria-controls="persona-byc-panel"
          onClick={() => { setExpanded(true) }}
        >
          <span className={styles.collapsedText}>{t('byc.collapsibleTeaser')}</span>
          <ChipBadge label={t('byc.timeBadge')} />
          <UiIcon name="chevronDown" size={18} strokeWidth={2.2} className={styles.chevron} />
        </button>
      ) : (
        <div id="persona-byc-panel">
          <div className={styles.expandedHead}>
            <div className={styles.expandedHeadTitles}>
              <h2 id="persona-byc-title" className={styles.heading}>{t('byc.title')}</h2>
              <ChipBadge label={t('byc.timeBadge')} />
            </div>
            <button type="button" className={styles.collapseBtn} aria-expanded onClick={() => { setExpanded(false); setView('capture') }}>
              <UiIcon name="chevronDown" size={18} strokeWidth={2.2} className={styles.chevronUp} />
              <span className="persona-sr-only">{t('byc.collapse')}</span>
            </button>
          </div>
          {view === 'review' && reviewPreview !== null ? (
            <>
              <ButtonRow>
                <button type="button" className={styles.backLink} onClick={() => { setView('capture') }}>
                  <UiIcon name="arrowRight" size={16} strokeWidth={2.2} className={styles.backIcon} />
                  {t('byc.back')}
                </button>
              </ButtonRow>
              <ProposalReview
                proposals={contextProposalsFromPreview(reviewPreview)}
                choices={choices}
                onChoice={(id, choice) => { setChoices(prev => ({ ...prev, [id]: choice })) }}
                onSave={saveReview}
                saving={saving}
                labels={{
                  kinds: {
                    brief: t('byc.review.kind.brief'),
                    constraint: t('byc.review.kind.constraint'),
                    decision: t('byc.review.kind.decision'),
                    memory: t('byc.review.kind.memory'),
                  },
                  accept: t('byc.review.accept'),
                  discard: t('byc.review.discard'),
                  edit: t('byc.review.edit'),
                  done: t('byc.review.done'),
                  private: t('byc.review.private'),
                  uncertain: t('byc.review.uncertain'),
                  sensitiveBlocked: why => t('byc.review.sensitiveBlocked', { why }),
                  unblock: t('byc.review.unblock'),
                  conflict: what => t('byc.review.conflict', { what }),
                  acceptClean: t('byc.review.acceptClean'),
                  save: n => t('byc.review.save', { count: n }),
                  summary: (accepted, flagged, discarded) => t('byc.review.summary', {
                    accepted: String(accepted),
                    flagged: String(flagged),
                    discarded: String(discarded),
                  }),
                }}
              />
            </>
          ) : (
            <>
              <div className={styles.stack}>
                <CopyPrompt
                  prompt={prompt}
                  source={aiSource}
                  onSourceChange={(source) => { onProviderChange(source) }}
                  labels={copyLabels}
                />
                <PasteBox
                  value={paste}
                  onChange={onPasteChange}
                  onAdd={() => {
                    const trimmed = paste.trim()
                    if (trimmed.length === 0) return
                    const id = `paste-${crypto.randomUUID()}`
                    onPastedChange([...pasted, { id, source: provider, text: trimmed }])
                    onPasteChange('')
                  }}
                  pasted={pastedChips}
                  onRemove={(id) => { onPastedChange(pasted.filter(row => row.id !== id)) }}
                  labels={{
                    title: t('byc.pasteBlockTitle'),
                    field: t('byc.pasteLabel'),
                    placeholder: t('byc.pastePlaceholder'),
                    add: t('byc.pasteAdd'),
                    sources: copyLabels.sources,
                    chars: n => t('byc.pasteChars', { count: n.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR') }),
                    remove: source => t('byc.pasteRemove', { source }),
                    listLabel: t('byc.pasteListLabel'),
                  }}
                />
                <FolderDrop
                  state={folderState}
                  {...(hasDesktopPicker ? { onChoose: chooseFolder } : {})}
                  onDropPath={(path) => { onVaultFolderPathChange(path) }}
                  onClear={() => { onVaultFolderPathChange(null) }}
                  labels={{
                    title: t('byc.folderBlockTitle'),
                    drop: t('byc.vaultLead'),
                    dropHint: t('byc.folderDropHint'),
                    choose: t('byc.chooseFolder'),
                    reading: (done, total) => t('byc.folderReading', {
                      done: String(done),
                      total: total === undefined ? '…' : String(total),
                    }),
                    ready: (folder, notes) => t('byc.folderReady', { folder, notes: String(notes) }),
                    ignored: n => t('byc.folderIgnored', { count: String(n) }),
                    clear: t('byc.folderClear'),
                  }}
                />
              </div>
              <p className={styles.privacy}>{t('byc.privacy')}</p>
              {canOrganize && (
                <div className={styles.organizeRow}>
                  <button type="button" className={styles.organizePrimary} onClick={openOrganize}>
                    {t('byc.organize')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function ChipBadge({ label }: { readonly label: string }): ReactNode {
  return <span className={styles.timeBadge}>{label}</span>
}

function ButtonRow({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className={styles.organizeRow}>{children}</div>
}
