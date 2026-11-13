/**
 * D-116 regra 1 (Tally, Keel 15:28): no computador da EQUIPE, motor e conta sao um VINCULO LOCAL (assento), nunca a reescrita da ficha. O `runner` (motor, modelo) esta DENTRO da ficha assinada pelo criador; reescreve-lo
 * aqui, sem a chave dele, deixaria a ficha `tampered`/`foreign` e o gate bloquearia a persona. Quem escolhe o motor num computador que nao assina a ficha dela grava este doc da MAQUINA (`engine_local`, nunca viaja:
 * entra em `MACHINE_ACCOUNT_DOCS`), e o executor le o motor EFETIVO: o vinculo local por cima do `runner` da ficha. Sem doc, o efetivo e o da ficha (nada muda).
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

export const ENGINE_LOCAL_KIND = 'engine_local'

/** What this computer binds her to (the sheet's own `runner` stays as the creator signed it). */
export interface EngineLocalDoc {
  readonly cli: string
  readonly model: string
  readonly at: string
}

type Kv = Pick<ScreenRepos, 'get' | 'put' | 'delete'>

/** @returns The local binding of this computer for the persona, if any. */
export function readEngineLocal(screens: Pick<ScreenRepos, 'get'>, projectId: string, personaId: string): EngineLocalDoc | undefined {
  return screens.get<EngineLocalDoc>(projectId, ENGINE_LOCAL_KIND, personaId)
}

/** Bind the persona to an engine on THIS computer only. */
export function writeEngineLocal(screens: Kv, projectId: string, personaId: string, doc: EngineLocalDoc): void {
  screens.put(projectId, ENGINE_LOCAL_KIND, personaId, doc)
}

/** Drop the local binding (the persona's own sheet speaks again). */
export function clearEngineLocal(screens: Kv, projectId: string, personaId: string): void {
  if (screens.get(projectId, ENGINE_LOCAL_KIND, personaId) !== undefined) screens.delete(projectId, ENGINE_LOCAL_KIND, personaId)
}

/**
 * @param runner - The runner of her signed sheet.
 * @param doc - The local binding of this computer, if any.
 * @returns The runner she runs on HERE: the local binding over the sheet's (kind, engine and model; her other settings stay), or the sheet's own.
 */
export function effectiveRunner<R extends { readonly kind: string }>(runner: R, doc: EngineLocalDoc | undefined): R {
  if (doc === undefined) return runner
  return { ...runner, kind: 'cli', cli: doc.cli, model: doc.model } as unknown as R
}
