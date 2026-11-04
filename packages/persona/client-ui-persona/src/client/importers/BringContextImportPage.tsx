/** BRIEFING 18 — Conhecimento › Importar / Importadores (Lumen, BRING-CONTEXT-SPEC). */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BringContextPreview } from '@deepseek-ai/dsh-persona-core'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import {
  applyBringContextRemote,
  mergeBringOrganizePreview,
  previewBringVaultFolderRemote,
} from '../data/bring-context-remote.ts'
import {
  bringPromptForLocale,
  contextProposalsFromPreview,
  type BringProvider,
} from '../bring-context/bring-context-ui.ts'
import type { BringPastedChunk } from '../bring-context/BringYourContextBlock.tsx'
import { pickVaultFolderPath, personaDesktopBridge } from '../bring-context/persona-desktop-bridge.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as bycDict } from '../locale/onboarding/locales.ts'
import { pt as importersDict } from '../locale/importers/locales.ts'
import {
  Card,
  CopyPrompt,
  FolderDrop,
  PasteBox,
  ProposalReview,
  Screen,
  ScreenHeader,
  UiIcon,
  defaultChoice,
  usePawCelebration,
  type AiSource,
  type FolderDropState,
  type PastedSource,
  type ProposalChoice,
} from '../primitives/index.ts'
import { ImportWizard } from './ImportWizard.tsx'
import styles from './BringContextImportPage.module.css'

export interface BringContextImportPageProps {
  readonly scope: ProjectScopeRequest | null
  readonly persona: PersonaRemoteClient
  readonly actorId: string
  readonly locale?: 'pt' | 'en' | undefined
}

function providerToAi(source: BringProvider): AiSource {
  return source === 'grok' ? 'other' : source
}

function folderNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function BringContextImportPage({
  scope,
  persona,
  actorId,
  locale = 'pt',
}: BringContextImportPageProps): ReactNode {
  const screenDict: LocaleDict = importersDict
  const dict: LocaleDict = bycDict
  const tScreen = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(screenDict, key, params)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const paw = usePawCelebration()

  const [mode, setMode] = useState<'byc' | 'advanced'>('byc')
  const [view, setView] = useState<'capture' | 'review'>('capture')
  const [paste, setPaste] = useState('')
  const [provider, setProvider] = useState<BringProvider>('chatgpt')
  const [pasted, setPasted] = useState<readonly BringPastedChunk[]>([])
  const [vaultFolderPath, setVaultFolderPath] = useState<string | null>(null)
  const [vaultPreview, setVaultPreview] = useState<BringContextPreview | null>(null)
  const [folderState, setFolderState] = useState<FolderDropState>({ kind: 'idle' })
  const [reviewPreview, setReviewPreview] = useState<BringContextPreview | null>(null)
  const [choices, setChoices] = useState<Readonly<Record<string, ProposalChoice>>>({})
  const [organizing, setOrganizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  const prompt = useMemo(() => bringPromptForLocale(dict, locale), [dict, locale])
  const aiSource = providerToAi(provider)
  const pastedChips: PastedSource[] = pasted.map(row => ({
    id: row.id,
    source: providerToAi(row.source),
    chars: row.text.length,
  }))
  const canOrganize = scope !== null && (pasted.length > 0 || folderState.kind === 'ready')
  const hasDesktopPicker = personaDesktopBridge() !== undefined

  useEffect(() => {
    if (vaultFolderPath === null || vaultFolderPath === '' || scope === null) {
      setFolderState({ kind: 'idle' })
      setVaultPreview(null)
      return
    }
    setFolderState({ kind: 'reading', done: 0 })
    void previewBringVaultFolderRemote(persona, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      rootPath: vaultFolderPath,
    }).then((preview) => {
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
  }, [vaultFolderPath, persona, scope, t])

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

  const openOrganize = useCallback(async () => {
    if (scope === null) return
    setOrganizing(true)
    try {
      const mergedPreview = await mergeBringOrganizePreview(persona, scope, pasted, vaultPreview)
      setReviewPreview(mergedPreview)
      const initial: Record<string, ProposalChoice> = {}
      for (const row of contextProposalsFromPreview(mergedPreview)) {
        initial[row.id] = defaultChoice(row)
      }
      setChoices(initial)
      setView('review')
    } finally {
      setOrganizing(false)
    }
  }, [pasted, persona, scope, vaultPreview])

  const saveReview = useCallback(async () => {
    if (reviewPreview === null || scope === null) return
    setSaving(true)
    try {
      const written = await applyBringContextRemote(persona, scope, reviewPreview, choices, actorId)
      setSavedCount(written)
      paw.celebrate()
      setView('capture')
      setPasted([])
      setPaste('')
      setVaultFolderPath(null)
      setReviewPreview(null)
    } finally {
      setSaving(false)
    }
  }, [actorId, choices, persona, reviewPreview, scope, paw])

  const chooseFolder = useCallback((): void => {
    void pickVaultFolderPath(t('byc.pickFolderTitle')).then((path) => {
      setVaultFolderPath(path)
    })
  }, [t])

  const header = (
    <ScreenHeader
      icon="conhecimento-memoria"
      eyebrow={tScreen('header.eyebrow')}
      title={mode === 'advanced' ? tScreen('title') : tScreen('bycScreen.title')}
      subtitle={mode === 'advanced' ? tScreen('subtitle') : tScreen('bycScreen.subtitle')}
      {...(mode === 'advanced' && view === 'capture'
        ? {
          actions: (
            <button type="button" className={styles.backLink} onClick={() => { setMode('byc') }}>
              {t('byc.back')}
            </button>
          ),
        }
        : {})}
    />
  )

  if (mode === 'advanced') {
    return (
      <Screen className={styles.shell} data-persona-surface="importers">
        {header}
        <div className={styles.advancedWrap}>
          <ImportWizard dict={screenDict} />
        </div>
      </Screen>
    )
  }

  if (view === 'review' && reviewPreview !== null) {
    return (
      <Screen className={`${styles.shell} ${styles.reviewShell}`} data-persona-surface="importers" data-persona-byc-review="">
        <div className={styles.inboxCelebrate}>{paw.node}</div>
        {header}
        <button type="button" className={styles.backLink} onClick={() => { setView('capture') }}>
          <UiIcon name="arrowRight" size={16} strokeWidth={2.2} className={styles.backIcon} />
          {t('byc.back')}
        </button>
        {savedCount !== null && (
          <p role="status">{tScreen('bycScreen.savedToast', { count: savedCount })}</p>
        )}
        <ProposalReview
          proposals={contextProposalsFromPreview(reviewPreview)}
          choices={choices}
          onChoice={(id, choice) => { setChoices(prev => ({ ...prev, [id]: choice })) }}
          onSave={() => { void saveReview() }}
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
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="importers" data-persona-byc="">
      <div className={styles.inboxCelebrate}>{paw.node}</div>
      {header}
      <div className={styles.layout}>
        <div className={styles.column}>
          <CopyPrompt
            prompt={prompt}
            source={aiSource}
            onSourceChange={(source) => { setProvider(source) }}
            labels={copyLabels}
          />
          <PasteBox
            value={paste}
            onChange={setPaste}
            onAdd={() => {
              const trimmed = paste.trim()
              if (trimmed.length === 0) return
              const id = `paste-${crypto.randomUUID()}`
              setPasted(prev => [...prev, { id, source: provider, text: trimmed }])
              setPaste('')
            }}
            pasted={pastedChips}
            onRemove={(id) => { setPasted(prev => prev.filter(row => row.id !== id)) }}
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
        </div>
        <div className={styles.column}>
          <FolderDrop
            state={folderState}
            {...(hasDesktopPicker ? { onChoose: chooseFolder } : {})}
            onDropPath={(path) => { setVaultFolderPath(path) }}
            onClear={() => { setVaultFolderPath(null) }}
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
          <Card padding="m" className={styles.advancedCard}>
            <h3 className={styles.privacy}>{tScreen('advancedExport.title')}</h3>
            <p className={styles.privacy}>{tScreen('advancedExport.lead')}</p>
            <button type="button" className={styles.organizePrimary} onClick={() => { setMode('advanced') }}>
              {tScreen('advancedExport.open')}
            </button>
          </Card>
        </div>
      </div>
      <p className={styles.privacy}>{t('byc.privacy')}</p>
      {canOrganize && (
        <div className={styles.organizeRow}>
          <button
            type="button"
            className={styles.organizePrimary}
            disabled={organizing}
            onClick={() => { void openOrganize() }}
          >
            {organizing ? tScreen('bycScreen.organizing') : t('byc.organize')}
          </button>
        </div>
      )}
    </Screen>
  )
}
