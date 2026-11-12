/**
 * "Acordando o time" (COLHEITA-MUSE §30): a cena de espera da abertura mostra os rostos da última sessão. Ela roda antes do bundle e do host,
 * então o shell guarda aqui, no mesmo `localStorage` do app, até 5 ids de bicho (só os ids: sem nome, papel nem dado). Na 1ª abertura nada
 * está salvo e a cena usa o trio do onboarding (Atlas, Bento e Nina). A lista de ids que a cena aceita mora em
 * `apps/desktop/renderer/persona-boot/boot.js`; um id que ela não conhece é ignorado lá.
 */

import { personaFaceKey } from '../hire/persona-face.ts'

/** Chave lida por `persona-boot/boot.js`. */
export const BOOT_FACES_KEY = 'persona.boot.faces.v1'
export const BOOT_FACES_MAX = 5

export interface BootFacePersona {
  readonly id: string
  readonly avatarRef: string
}

type BootFaceStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): BootFaceStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** Os ids de bicho (sem repetição, na ordem do time) que a cena de abertura mostra na próxima vez. */
export function bootFaceIds(personas: readonly BootFacePersona[]): readonly string[] {
  const ids: string[] = []
  for (const persona of personas) {
    const key = personaFaceKey(persona.avatarRef, persona.id)
    if (!ids.includes(key)) ids.push(key)
    if (ids.length === BOOT_FACES_MAX) break
  }
  return ids
}

/**
 * Guarda os rostos do time para a próxima abertura. Só escreve quando muda; um time vazio não apaga o que já havia (a cena cai no trio
 * sozinha se nunca houve nada). Storage bloqueado não quebra nada: a cena só fica com o trio.
 */
export function rememberBootFaces(personas: readonly BootFacePersona[], storage: BootFaceStorage | undefined = defaultStorage()): void {
  const ids = bootFaceIds(personas)
  if (ids.length === 0 || storage === undefined) return
  const next = JSON.stringify(ids)
  try {
    if (storage.getItem(BOOT_FACES_KEY) !== next) storage.setItem(BOOT_FACES_KEY, next)
  } catch {
    /* só um conforto da abertura */
  }
}
