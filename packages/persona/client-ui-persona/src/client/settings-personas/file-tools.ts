/**
 * "Pode salvar arquivos no rascunho" (EQUIPE-REAL-SPEC (e), lib 6c). Os NOMES DE FIO do host vivem só neste arquivo
 * (`PersonaView.canSaveFiles`, `PersonaView.canSaveFilesAvailable`, Remote `setPersonaCanSaveFiles`): se o host mudar um nome, a troca é de um arquivo.
 */

import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'

/** O que o host disse sobre as ferramentas de arquivo de uma persona; um campo que ele não mandou fica ausente (a tela então não mostra o interruptor). */
export interface FileToolsView {
  /** A persona pode salvar arquivos no rascunho. */
  readonly canSaveFiles?: boolean
  /** `false` = o projeto da persona não tem pasta (o interruptor fica desabilitado e a frase diz o porquê). */
  readonly canSaveFilesAvailable?: boolean
}

/**
 * @param row - Uma persona como o host a mandou (`PersonaView`).
 * @returns Os dois campos, só os que vieram como booleano.
 */
export function readFileTools(row: object): FileToolsView {
  const wire = row as { readonly canSaveFiles?: unknown; readonly canSaveFilesAvailable?: unknown }
  return {
    ...(typeof wire.canSaveFiles === 'boolean' ? { canSaveFiles: wire.canSaveFiles } : {}),
    ...(typeof wire.canSaveFilesAvailable === 'boolean' ? { canSaveFilesAvailable: wire.canSaveFilesAvailable } : {}),
  }
}

interface SaveFilesRemote {
  setPersonaCanSaveFiles?(request: {
    readonly workspaceId: string
    readonly projectId: string
    readonly personaId: string
    readonly canSaveFiles: boolean
  }): Promise<unknown>
}

/**
 * Grava a escolha no host (molde do `setPersonaCanRecruit`).
 * @returns `true` quando o host aceitou; `false` quando a chamada não existe ou falhou (quem chama devolve o interruptor ao que estava).
 */
export async function writeCanSaveFiles(
  client: PersonaRemoteClient | undefined,
  scope: { readonly workspaceId: string; readonly projectId: string },
  personaId: string,
  canSaveFiles: boolean,
): Promise<boolean> {
  const remote = client as unknown as SaveFilesRemote | undefined
  if (remote === undefined || typeof remote.setPersonaCanSaveFiles !== 'function') return false
  try {
    await unwrapRemote(await remote.setPersonaCanSaveFiles({ ...scope, personaId, canSaveFiles }) as Parameters<typeof unwrapRemote>[0])
    return true
  } catch {
    return false
  }
}
