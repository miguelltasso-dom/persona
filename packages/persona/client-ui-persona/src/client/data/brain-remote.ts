import type {
  BrainGrantView,
  BrainHomeView,
  BrainPageView,
  BrainVersionView,
  GrantBrainPermissionRequest,
  ListBrainPagesRequest,
  ProjectScopeRequest,
  PutBrainPageRequest,
} from '@deepseek-ai/dsh-persona-host/types'
import type { PermissionValidity } from '../primitives/Brain.tsx'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'

type BrainRemote = {
  getBrainHome?(req: ProjectScopeRequest): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainHomeView>>
  listBrainPages?(req: ListBrainPagesRequest): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainPageView[]>>
  getBrainPage?(req: ProjectScopeRequest & { pageId: string }): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainPageView>>
  listBrainVersions?(req: ProjectScopeRequest & { pageId: string }): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainVersionView[]>>
  restoreBrainPage?(req: ProjectScopeRequest & { pageId: string; revision: number }): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainPageView>>
  exportBrainVault?(req: ProjectScopeRequest & { folderPath: string; twoWay?: boolean }): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<{ files: number; created: number; skipped: number; direction: 'export' | 'import'; leftover: readonly string[] }>>
  putBrainPage?(req: PutBrainPageRequest): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainPageView>>
  listBrainPermissions?(req: ProjectScopeRequest): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainGrantView[]>>
  grantBrainPermission?(
    req: GrantBrainPermissionRequest,
  ): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainGrantView>>
  revokeBrainPermission?(
    req: ProjectScopeRequest & { grantId: string },
  ): Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<BrainGrantView>>
}

function brainClient(persona: PersonaRemoteClient): BrainRemote {
  return persona as PersonaRemoteClient & BrainRemote
}

/** Muse UI validity → host RPC. */
export function brainValidityToRpc(validity: PermissionValidity): GrantBrainPermissionRequest['validity'] {
  if (validity === 'week') return '7d'
  if (validity === 'until-revoked') return 'until-revoke'
  return 'once'
}

/** Empresa › Segundo cérebro home. */
export async function loadBrainHomeRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
): Promise<BrainHomeView> {
  const remote = brainClient(persona)
  if (remote.getBrainHome === undefined) throw new Error('getBrainHome-unavailable')
  return unwrapRemote(await remote.getBrainHome(scope))
}

/** Remember an approval after the human accepts. */
export async function grantBrainPermissionRemote(
  persona: PersonaRemoteClient,
  request: GrantBrainPermissionRequest,
): Promise<BrainGrantView> {
  const remote = brainClient(persona)
  if (remote.grantBrainPermission === undefined) throw new Error('grantBrainPermission-unavailable')
  return unwrapRemote(await remote.grantBrainPermission(request))
}

/** Revoke a remembered permission. */
export async function revokeBrainPermissionRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  grantId: string,
): Promise<BrainGrantView> {
  const remote = brainClient(persona)
  if (remote.revokeBrainPermission === undefined) throw new Error('revokeBrainPermission-unavailable')
  return unwrapRemote(await remote.revokeBrainPermission({ ...scope, grantId }))
}

export async function listBrainPagesRemote(
  persona: PersonaRemoteClient,
  request: ListBrainPagesRequest,
): Promise<readonly BrainPageView[]> {
  const remote = brainClient(persona)
  if (remote.listBrainPages === undefined) throw new Error('listBrainPages-unavailable')
  return unwrapRemote(await remote.listBrainPages(request))
}

export async function getBrainPageRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  pageId: string,
): Promise<BrainPageView> {
  const remote = brainClient(persona)
  if (remote.getBrainPage === undefined) throw new Error('getBrainPage-unavailable')
  return unwrapRemote(await remote.getBrainPage({ ...scope, pageId }))
}

export async function listBrainVersionsRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  pageId: string,
): Promise<readonly BrainVersionView[]> {
  const remote = brainClient(persona)
  if (remote.listBrainVersions === undefined) throw new Error('listBrainVersions-unavailable')
  return unwrapRemote(await remote.listBrainVersions({ ...scope, pageId }))
}

export async function listBrainPermissionsRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
): Promise<readonly BrainGrantView[]> {
  const remote = brainClient(persona)
  if (remote.listBrainPermissions === undefined) throw new Error('listBrainPermissions-unavailable')
  return unwrapRemote(await remote.listBrainPermissions(scope))
}

export async function putBrainPageRemote(
  persona: PersonaRemoteClient,
  request: PutBrainPageRequest,
): Promise<BrainPageView> {
  const remote = brainClient(persona)
  if (remote.putBrainPage === undefined) throw new Error('putBrainPage-unavailable')
  return unwrapRemote(await remote.putBrainPage(request))
}

/** Put an older version of a page back as its text (the host keeps the history, so nothing is lost). */
export async function restoreBrainPageRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  pageId: string,
  revision: number,
): Promise<BrainPageView> {
  const remote = brainClient(persona)
  if (remote.restoreBrainPage === undefined) throw new Error('restoreBrainPage-unavailable')
  return unwrapRemote(await remote.restoreBrainPage({ ...scope, pageId, revision }))
}

/** Whether the host can restore versions at all (the button is only drawn then). */
export function canRestoreBrainPage(persona: PersonaRemoteClient): boolean {
  return typeof brainClient(persona).restoreBrainPage === 'function'
}

/** Whether the host can write the Second Brain into a folder (the menu item is only live then). */
export function canExportBrainVault(persona: PersonaRemoteClient): boolean {
  return typeof brainClient(persona).exportBrainVault === 'function'
}

/** One-way export: the pages as .md files in a folder the person chose (opens in Obsidian). Never reads anything back. */
export async function exportBrainVaultRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  folderPath: string,
): Promise<{ readonly files: number; readonly created: number }> {
  const remote = brainClient(persona)
  if (remote.exportBrainVault === undefined) throw new Error('exportBrainVault-unavailable')
  const result = await unwrapRemote(await remote.exportBrainVault({ ...scope, folderPath }))
  return { files: result.files, created: result.created }
}
