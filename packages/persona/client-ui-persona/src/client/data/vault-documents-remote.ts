import { randomUuid } from '../remote/random-id.ts'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'
import { readFileAsBase64 } from '../chat/read-file-as-base64.ts'

export interface VaultDocumentScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** Host `ingestVaultDocument` with a browser file pick. */
export async function ingestVaultDocumentRemote(
  persona: PersonaRemoteClient,
  scope: VaultDocumentScope,
  file: File,
): Promise<void> {
  const bytesBase64 = await readFileAsBase64(file)
  const id = `vault-doc-${randomUuid()}`
  unwrapRemote(await persona.ingestVaultDocument({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    id,
    name: file.name,
    bytesBase64,
  }))
}

/** Host `replaceVaultDocument`. */
export async function replaceVaultDocumentRemote(
  persona: PersonaRemoteClient,
  scope: VaultDocumentScope,
  documentId: string,
  file: File,
): Promise<void> {
  const bytesBase64 = await readFileAsBase64(file)
  unwrapRemote(await persona.replaceVaultDocument({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    documentId,
    name: file.name,
    bytesBase64,
  }))
}

/** Host `deleteVaultDocument`. */
export async function deleteVaultDocumentRemote(
  persona: PersonaRemoteClient,
  scope: VaultDocumentScope,
  documentId: string,
): Promise<void> {
  unwrapRemote(await persona.deleteVaultDocument({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    documentId,
  }))
}
