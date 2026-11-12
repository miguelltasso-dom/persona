import { randomUuid } from '../remote/random-id.ts'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { BrainGrantView, BrainHomeView, BrainKindView, BrainPageView, ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { canExportBrainVault, canRestoreBrainPage, exportBrainVaultRemote, getBrainPageRemote, listBrainVersionsRemote, putBrainPageRemote, restoreBrainPageRemote } from '../data/brain-remote.ts'
import { personaDesktopBridge } from '../bring-context/persona-desktop-bridge.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { Screen, ScreenHeader, Toast, ToastRegion } from '../primitives/index.ts'
import { PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { MainPanelId } from '../shell/create-shell-store.ts'
import { CompanyBriefDialog } from './CompanyBriefDialog.tsx'
import { NewPageDialog } from './NewPageDialog.tsx'
import { SecondBrainPagesView } from './SecondBrainPagesView.tsx'
import { SecondBrainHome, type SecondBrainSurfaceState } from './SecondBrainHome.tsx'
import { SecondBrainKindListView } from './SecondBrainKindListView.tsx'
import { SecondBrainPageView } from './SecondBrainPageView.tsx'
import { SecondBrainPermissionsView } from './SecondBrainPermissionsView.tsx'
import { pt as brainDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

/** Páginas while it loads or failed: the same header, then the state. */
function PagesFrame({ dict, children }: { readonly dict: LocaleDict; readonly children: ReactNode }): ReactNode {
  return (
    <Screen className={styles.shell} data-persona-surface="knowledge">
      <ScreenHeader icon="conhecimento-memoria" eyebrow={bindLocale(dict, 'header.eyebrow')} title={bindLocale(dict, 'pages.title')} subtitle={bindLocale(dict, 'pages.subtitle')} />
      {children}
    </Screen>
  )
}

type BrainRoute =
  | { readonly kind: 'home' }
  | { readonly kind: 'permissions' }
  | { readonly kind: 'type'; readonly brainKind: BrainKindView }
  | { readonly kind: 'page'; readonly pageId: string }

export interface SecondBrainShellProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest | null
  readonly actorId: string
  readonly home: BrainHomeView | null
  readonly pages: readonly BrainPageView[]
  readonly grants: readonly BrainGrantView[]
  readonly personaNames: Readonly<Record<string, string>>
  /** `person:<memberId>` → name; the viewer reads "Você". */
  readonly memberNames?: Readonly<Record<string, string>>
  /** Persona id → animal portrait (the one she was hired with). */
  readonly personaAvatars?: Readonly<Record<string, string>>
  readonly surfaceState: SecondBrainSurfaceState
  readonly onRemoteRetry?: () => void
  readonly onRevokeGrant?: (grantId: string) => void
  readonly onReload?: () => void
  readonly selectMainPanel?: ((panel: MainPanelId) => void) | undefined
  /** The first real lines of the company profile (the Cofre `brief`); empty = nobody described the company yet. */
  readonly companyLines?: readonly string[] | undefined
  /** The whole description the team reads now: what "Editar" opens the dialog with (the lines above are only its first ones). */
  readonly companyText?: string | undefined
  /** Saves what the person wrote about the company. Absent = the host cannot store it, so the invitation is not drawn. */
  readonly onSaveCompanyBrief?: ((text: string) => Promise<void>) | undefined
  /** Which tab of the Memória this is: the Resumo (default) or Páginas (the list of every page, with the documents in `footer`). */
  readonly view?: 'summary' | 'pages' | undefined
  /** Drawn at the bottom of Páginas: the uploaded documents of the company. */
  readonly footer?: ReactNode
}

export function SecondBrainShell({
  persona,
  scope,
  actorId,
  home,
  pages,
  grants,
  personaNames,
  memberNames = {},
  personaAvatars = {},
  surfaceState,
  onRemoteRetry,
  onRevokeGrant,
  onReload,
  selectMainPanel,
  companyLines,
  companyText,
  onSaveCompanyBrief,
  view = 'summary',
  footer,
}: SecondBrainShellProps): ReactNode {
  const [route, setRoute] = useState<BrainRoute>({ kind: 'home' })
  const [briefOpen, setBriefOpen] = useState(false)
  const [pageDetail, setPageDetail] = useState<BrainPageView | null>(null)
  const [pageVersions, setPageVersions] = useState<Awaited<ReturnType<typeof listBrainVersionsRemote>>>([])
  const [newPageOpen, setNewPageOpen] = useState(false)
  /** The type the "+ Tipo" chip asked for; the dialog opens on it. */
  const [newPageKind, setNewPageKind] = useState<BrainKindView | undefined>(undefined)
  const [exportNote, setExportNote] = useState<{ readonly kind: 'done'; readonly count: number; readonly folder: string } | { readonly kind: 'failed' } | null>(null)
  /** Same words if this build's generated locale does not carry the new keys yet. */
  const tr = (key: string, fallback: string): string => {
    const text = bindLocale(brainDict, key)
    return text === key ? fallback : text
  }
  // The installed app has the native folder picker; the web build has none (the ⋯ items are disabled and say so).
  const vaultFolderAvailable = personaDesktopBridge() !== undefined && canExportBrainVault(persona)

  /** One-way: the pages as .md files in a folder the person picks. Never reads the folder back (importing goes through the review). */
  const exportVault = async (): Promise<void> => {
    const bridge = personaDesktopBridge()
    if (bridge === undefined || scope === null) return
    const picked = await bridge.pickDirectory({ title: tr('export.pickTitle', 'Escolha a pasta para exportar a Memória da empresa') })
    if (picked === null || picked === '') return
    try {
      const result = await exportBrainVaultRemote(persona, scope, picked)
      const parts = picked.replace(/\\/gu, '/').split('/').filter(Boolean)
      setExportNote({ kind: 'done', count: result.files, folder: parts.at(-1) ?? picked })
    } catch {
      setExportNote({ kind: 'failed' })
    }
  }

  const openPage = useCallback(async (pageId: string) => {
    if (scope === null) return
    const cached = pages.find(row => row.id === pageId)
    if (cached !== undefined) {
      setPageDetail(cached)
      setRoute({ kind: 'page', pageId })
      try {
        const versions = await listBrainVersionsRemote(persona, scope, pageId)
        setPageVersions(versions)
      } catch {
        setPageVersions([])
      }
      return
    }
    try {
      const page = await getBrainPageRemote(persona, scope, pageId)
      const versions = await listBrainVersionsRemote(persona, scope, pageId)
      setPageDetail(page)
      setPageVersions(versions)
      setRoute({ kind: 'page', pageId })
    } catch {
      /* stay on current route */
    }
  }, [pages, persona, scope])

  /** Creates the page the person described (any type), then opens it to be written. */
  const createPage = useCallback(async (title: string, kind: BrainKindView) => {
    if (scope === null) return
    const id = `page-${randomUuid()}`
    await putBrainPageRemote(persona, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id,
      kind,
      title,
      body: '',
      editorKind: 'person',
      editorId: actorId,
    })
    setNewPageOpen(false)
    onReload?.()
    const page = await getBrainPageRemote(persona, scope, id)
    setPageDetail(page)
    setPageVersions(await listBrainVersionsRemote(persona, scope, id).catch(() => []))
    setRoute({ kind: 'page', pageId: id })
  }, [actorId, onReload, persona, scope])

  const contradictionIds = useMemo(
    () => new Set((home?.contradictions ?? []).map(row => row.id)),
    [home?.contradictions],
  )

  const savePageBody = useCallback(async (body: string) => {
    if (scope === null || pageDetail === null) return
    await putBrainPageRemote(persona, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id: pageDetail.id,
      kind: pageDetail.kind,
      title: pageDetail.title,
      body,
      editorKind: 'person',
      editorId: actorId,
    })
    onReload?.()
    const refreshed = await getBrainPageRemote(persona, scope, pageDetail.id)
    setPageDetail(refreshed)
    // The history must show the new version right away (not only after reopening the page).
    setPageVersions(await listBrainVersionsRemote(persona, scope, pageDetail.id).catch(() => []))
  }, [actorId, onReload, pageDetail, persona, scope])

  const restoreVersion = useCallback(async (revision: number) => {
    if (scope === null || pageDetail === null) return
    const restored = await restoreBrainPageRemote(persona, scope, pageDetail.id, revision)
    onReload?.()
    setPageDetail(restored)
    setPageVersions(await listBrainVersionsRemote(persona, scope, pageDetail.id).catch(() => []))
  }, [onReload, pageDetail, persona, scope])

  if (route.kind === 'permissions') {
    return (
      <SecondBrainPermissionsView
        grants={grants}
        personaNames={personaNames}
        personaAvatars={personaAvatars}
        onBack={() => { setRoute({ kind: 'home' }) }}
        {...(onRevokeGrant === undefined ? {} : { onRevokeGrant })}
      />
    )
  }

  if (route.kind === 'type') {
    return (
      <SecondBrainKindListView
        kind={route.brainKind}
        pages={pages}
        personaNames={personaNames}
        memberNames={memberNames}
        contradictionIds={contradictionIds}
        onBack={() => { setRoute({ kind: 'home' }) }}
        onOpenPage={(pageId) => { void openPage(pageId) }}
      />
    )
  }
  if (route.kind === 'page' && pageDetail !== null) {
    // "Citada em": the pages that link TO this one (their outgoing links name its slug or id) — never this page's own links.
    const backlinks = pages.filter(row => row.id !== pageDetail.id && (row.links.includes(pageDetail.slug) || row.links.includes(pageDetail.id)))
    return (
      <SecondBrainPageView
        page={pageDetail}
        versions={pageVersions}
        backlinkPages={backlinks}
        onBack={() => { setRoute({ kind: 'home' }) }}
        onOpenPage={(pageId) => { void openPage(pageId) }}
        onSaveBody={(body) => { void savePageBody(body) }}
        personaNames={personaNames}
        memberNames={memberNames}
        {...(canRestoreBrainPage(persona) ? { onRestoreVersion: (revision: number) => { void restoreVersion(revision) } } : {})}
      />
    )
  }

  if (view === 'pages') {
    const writePage = scope === null ? undefined : () => { setNewPageKind(undefined); setNewPageOpen(true) }
    return (
      <>
        {surfaceState === 'loading' ? (
          <PagesFrame dict={brainDict}><PersonaSurfaceLoading dict={brainDict} messageKey="loading" skeletonColumns={1} /></PagesFrame>
        ) : surfaceState === 'error' ? (
          <PagesFrame dict={brainDict}>
            <PersonaSurfaceError dict={brainDict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRemoteRetry?.() }} />
          </PagesFrame>
        ) : (
          <SecondBrainPagesView
            dict={brainDict}
            pages={pages}
            personaNames={personaNames}
            memberNames={memberNames}
            onOpenPage={(pageId) => { void openPage(pageId) }}
            onWritePage={writePage}
          >
            {footer}
          </SecondBrainPagesView>
        )}
        {newPageOpen && (
          <NewPageDialog dict={brainDict} initialKind={newPageKind} onClose={() => { setNewPageOpen(false) }} onCreate={createPage} />
        )}
      </>
    )
  }

  return (
    <>
      <SecondBrainHome
        home={home}
        pages={pages}
        personaNames={personaNames}
        memberNames={memberNames}
        personaAvatars={personaAvatars}
        initialState={surfaceState}
        {...(onRemoteRetry === undefined ? {} : { onRemoteRetry })}
        {...(onRevokeGrant === undefined ? {} : { onRevokeGrant })}
        onOpenPermissions={() => { setRoute({ kind: 'permissions' }) }}
        onOpenKind={(brainKind) => { setRoute({ kind: 'type', brainKind }) }}
        onOpenPage={(pageId) => { void openPage(pageId) }}
        {...(selectMainPanel === undefined
          ? {}
          : { onBringContext: () => { selectMainPanel('importers') } })}
        {...(scope === null ? {} : { onWritePage: (kind?: BrainKindView) => { setNewPageKind(kind); setNewPageOpen(true) } })}
        vaultFolderAvailable={vaultFolderAvailable}
        {...(canExportBrainVault(persona) ? { onExportVault: () => { void exportVault() } } : {})}
        {...(selectMainPanel === undefined ? {} : { onImportFolder: () => { selectMainPanel('importers') } })}
        {...(companyLines === undefined ? {} : { companyLines })}
        {...(onSaveCompanyBrief === undefined ? {} : { onDescribeCompany: () => { setBriefOpen(true) } })}
      />
      {newPageOpen && (
        <NewPageDialog dict={brainDict} initialKind={newPageKind} onClose={() => { setNewPageOpen(false) }} onCreate={createPage} />
      )}
      {briefOpen && onSaveCompanyBrief !== undefined && (
        <CompanyBriefDialog
          dict={brainDict}
          initialText={companyText}
          onClose={() => { setBriefOpen(false) }}
          onSave={async (text) => {
            await onSaveCompanyBrief(text)
            setBriefOpen(false)
          }}
        />
      )}
      {exportNote !== null && (
        <ToastRegion label={tr('menu.more', 'Mais ações')}>
          <Toast
            tone={exportNote.kind === 'done' ? 'success' : 'warning'}
            title={exportNote.kind === 'done'
              ? (exportNote.count === 1
                ? tr('export.done.one', 'Exportado: 1 página em {folder}').replace('{folder}', exportNote.folder)
                : tr('export.done', 'Exportado: {count} páginas em {folder}').replace('{count}', String(exportNote.count)).replace('{folder}', exportNote.folder))
              : tr('export.failed', 'Não consegui exportar agora. Nada foi apagado na pasta. Tente de novo.')}
            dismissLabel={tr('export.dismiss', 'Fechar aviso')}
            onDismiss={() => { setExportNote(null) }}
          />
        </ToastRegion>
      )}
    </>
  )
}
