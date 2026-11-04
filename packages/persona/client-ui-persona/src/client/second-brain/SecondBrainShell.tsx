import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { BrainGrantView, BrainHomeView, BrainKindView, BrainPageView, ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { getBrainPageRemote, listBrainVersionsRemote, putBrainPageRemote } from '../data/brain-remote.ts'
import type { MainPanelId } from '../shell/create-shell-store.ts'
import { SecondBrainHome, type SecondBrainSurfaceState } from './SecondBrainHome.tsx'
import { SecondBrainKindListView } from './SecondBrainKindListView.tsx'
import { SecondBrainPageView } from './SecondBrainPageView.tsx'
import { SecondBrainPermissionsView } from './SecondBrainPermissionsView.tsx'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as brainDict } from '../locale/second-brain/locales.ts'

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
  readonly surfaceState: SecondBrainSurfaceState
  readonly onRemoteRetry?: () => void
  readonly onRevokeGrant?: (grantId: string) => void
  readonly onReload?: () => void
  readonly selectMainPanel?: ((panel: MainPanelId) => void) | undefined
}

export function SecondBrainShell({
  persona,
  scope,
  actorId,
  home,
  pages,
  grants,
  personaNames,
  surfaceState,
  onRemoteRetry,
  onRevokeGrant,
  onReload,
  selectMainPanel,
}: SecondBrainShellProps): ReactNode {
  const [route, setRoute] = useState<BrainRoute>({ kind: 'home' })
  const [pageDetail, setPageDetail] = useState<BrainPageView | null>(null)
  const [pageVersions, setPageVersions] = useState<Awaited<ReturnType<typeof listBrainVersionsRemote>>>([])

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

  const writePage = useCallback(async () => {
    if (scope === null) return
    const title = window.prompt(bindLocale(brainDict, 'page.writePrompt'))
    if (title === null || title.trim() === '') return
    await putBrainPageRemote(persona, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id: `page-${crypto.randomUUID()}`,
      kind: 'company',
      title: title.trim(),
      body: '',
      editorKind: 'person',
      editorId: actorId,
    })
    onReload?.()
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
  }, [actorId, onReload, pageDetail, persona, scope])

  if (route.kind === 'permissions') {
    return (
      <SecondBrainPermissionsView
        grants={grants}
        personaNames={personaNames}
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
        contradictionIds={contradictionIds}
        onBack={() => { setRoute({ kind: 'home' }) }}
        onOpenPage={(pageId) => { void openPage(pageId) }}
      />
    )
  }
  if (route.kind === 'page' && pageDetail !== null) {
    const backlinks = pages.filter(row => pageDetail.links.includes(row.slug) || pageDetail.links.includes(row.id))
    return (
      <SecondBrainPageView
        page={pageDetail}
        versions={pageVersions}
        backlinkPages={backlinks}
        onBack={() => { setRoute({ kind: 'home' }) }}
        onOpenPage={(pageId) => { void openPage(pageId) }}
        onSaveBody={(body) => { void savePageBody(body) }}
      />
    )
  }

  return (
    <SecondBrainHome
      home={home}
      pages={pages}
      personaNames={personaNames}
      initialState={surfaceState}
      {...(onRemoteRetry === undefined ? {} : { onRemoteRetry })}
      {...(onRevokeGrant === undefined ? {} : { onRevokeGrant })}
      onOpenPermissions={() => { setRoute({ kind: 'permissions' }) }}
      onOpenKind={(brainKind) => { setRoute({ kind: 'type', brainKind }) }}
      onOpenPage={(pageId) => { void openPage(pageId) }}
      {...(selectMainPanel === undefined
        ? {}
        : { onBringContext: () => { selectMainPanel('importers') } })}
      onWritePage={() => { void writePage() }}
    />
  )
}
