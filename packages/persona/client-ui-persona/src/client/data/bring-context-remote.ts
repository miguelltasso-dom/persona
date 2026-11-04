import {
  decideBringApply,
  type BringContextPreview,
  type BringProposalStatus,
  type BringProvider,
  type BringVaultKind,
} from '../bring-context/bring-context-paste-local.ts'
import type {
  ApplyContextProposalsRequest,
  ApplyContextProposalsView,
  BringContextPreviewView,
  PreviewBringContextPasteRequest,
  PreviewBringContextVaultFolderRequest,
  ProjectScopeRequest,
} from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'
import { bringPreviewToVaultSeed, buildBringReviewPreview, summarizeBringPreview, choicesToApplyItems } from '../bring-context/bring-context-ui.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import type { ProposalChoice } from '../primitives/BringContext.tsx'

type BringContextWire = PersonaRemoteClient & {
  previewBringContextPaste?(request: PreviewBringContextPasteRequest): unknown
  previewBringContextVaultFolder?(request: PreviewBringContextVaultFolderRequest): unknown
  applyContextProposals?(request: ApplyContextProposalsRequest): unknown
}

export function previewViewToCore(view: BringContextPreviewView): BringContextPreview {
  return {
    source: view.source,
    ignored: view.ignored.map(row => ({ path: row.path, why: row.why })),
    proposals: view.proposals.map(row => ({
      id: row.id,
      kind: row.kind as BringVaultKind,
      section: row.section,
      body: row.body,
      provenance: row.provenance,
      uncertain: row.uncertain,
      sensitive: row.sensitive,
      blocked: row.blocked,
      sensitiveWhy: row.sensitiveWhy,
      duplicateOf: row.duplicateOf,
      conflictQuestion: row.conflictQuestion,
      status: row.status as BringProposalStatus,
      path: row.path,
      hash: row.hash,
    })),
  }
}

export function previewCoreToView(preview: BringContextPreview): BringContextPreviewView {
  return {
    source: preview.source,
    ignored: preview.ignored.map(row => ({ path: row.path, why: row.why })),
    proposals: preview.proposals.map(row => ({
      id: row.id,
      kind: row.kind,
      section: row.section,
      body: row.body,
      provenance: row.provenance,
      uncertain: row.uncertain,
      sensitive: row.sensitive,
      blocked: row.blocked,
      sensitiveWhy: row.sensitiveWhy,
      duplicateOf: row.duplicateOf,
      conflictQuestion: row.conflictQuestion,
      status: row.status,
      path: row.path,
      hash: row.hash,
    })),
  }
}

/** Paste chunks + optional vault scan → one review preview (host parser when available). */
export async function mergeBringOrganizePreview(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  pasted: readonly { readonly source: BringProvider; readonly text: string }[],
  vaultPreview: BringContextPreview | null,
): Promise<BringContextPreview> {
  const wire = persona as BringContextWire
  if (wire.previewBringContextPaste !== undefined && pasted.length > 0) {
    const chunks = await Promise.all(pasted.map(chunk => previewBringContextPasteRemote(persona, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      text: chunk.text,
      provider: chunk.source === 'grok' ? 'grok' : chunk.source,
    })))
    const proposals = chunks.flatMap(chunk => chunk.proposals)
    const ignored = [...(vaultPreview?.ignored ?? []), ...chunks.flatMap(chunk => chunk.ignored)]
    const merged: BringContextPreview = { source: 'paste', proposals, ignored }
    if (vaultPreview !== null) {
      return { ...merged, proposals: [...proposals, ...vaultPreview.proposals] }
    }
    return merged
  }
  return buildBringReviewPreview(
    pasted.map(row => ({ source: row.source, text: row.text })),
    vaultPreview,
  )
}

/** Host paste organize → core preview (review before Cofre). */
export async function previewBringContextPasteRemote(
  persona: PersonaRemoteClient,
  request: PreviewBringContextPasteRequest,
): Promise<BringContextPreview> {
  const remote = persona as BringContextWire
  if (remote.previewBringContextPaste === undefined) {
    throw new Error('previewBringContextPaste-unavailable')
  }
  const view = await unwrapRemote(
    await remote.previewBringContextPaste(request) as Parameters<typeof unwrapRemote<BringContextPreviewView>>[0],
  )
  return previewViewToCore(view)
}

/** Host vault folder scan → core preview (review before Cofre). */
export async function previewBringVaultFolderRemote(
  persona: PersonaRemoteClient,
  request: PreviewBringContextVaultFolderRequest,
): Promise<BringContextPreview> {
  const remote = persona as BringContextWire
  if (remote.previewBringContextVaultFolder === undefined) {
    throw new Error('previewBringContextVaultFolder-unavailable')
  }
  const view = await unwrapRemote(
    await remote.previewBringContextVaultFolder(request) as Parameters<typeof unwrapRemote<BringContextPreviewView>>[0],
  )
  return previewViewToCore(view)
}

/** Host vault folder scan → summary line + optional Cofre seed markdown. */
export async function organizeBringVaultFolderRemote(
  persona: PersonaRemoteClient,
  dict: LocaleDict,
  request: PreviewBringContextVaultFolderRequest,
): Promise<{ readonly summary: string; readonly seed: string }> {
  const preview = await previewBringVaultFolderRemote(persona, request)
  return {
    summary: summarizeBringPreview(dict, preview),
    seed: bringPreviewToVaultSeed(preview),
  }
}

/** Persist accepted review rows into the Cofre (RPC when host exposes it, else createVaultRecord). */
export async function applyBringContextRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  preview: BringContextPreview,
  choices: Readonly<Record<string, ProposalChoice>>,
  actorId: string,
): Promise<number> {
  const items = choicesToApplyItems(preview, choices)
  const toWrite = decideBringApply(preview, items)
  const remote = persona as BringContextWire
  if (remote.applyContextProposals !== undefined) {
    const result = await unwrapRemote(await remote.applyContextProposals({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      preview: previewCoreToView(preview),
      items: items.map(row => ({
        id: row.id,
        action: row.action,
        ...(row.body !== undefined ? { body: row.body } : {}),
      })),
    }) as Parameters<typeof unwrapRemote<ApplyContextProposalsView>>[0])
    return result.written
  }
  if (typeof persona.createVaultRecord !== 'function') {
    throw new Error('createVaultRecord-unavailable')
  }
  let written = 0
  for (const row of toWrite) {
    await unwrapRemote(await persona.createVaultRecord({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id: row.id,
      kind: row.kind,
      body: row.body,
      authorId: actorId,
    }))
    written += 1
  }
  return written
}
