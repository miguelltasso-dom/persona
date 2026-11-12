/**
 * Muse (D-069): toda persona tem um bicho; as iniciais só aparecem se a arte falhar. `personaFaceSrc` é a defesa de EXIBIÇÃO: o rosto de
 * uma persona cuja referência não é um animal da galeria (o slug do nome, "neutral", vazia) vira um bicho ESTÁVEL da galeria em vez das iniciais.
 *
 * Mora aqui (ao lado de `gallery-animals.ts`) e não em `assets/`: o `build-assets` limpa o diretório `assets/` inteiro a cada geração.
 */

import { AVATAR_96 } from '../assets/generated-imports.ts'
import { PERSONA_GALLERY_ANIMALS } from './gallery-animals.ts'

type Avatar96Key = keyof typeof AVATAR_96

function isGalleryKey(key: string): key is Avatar96Key {
  return Object.prototype.hasOwnProperty.call(AVATAR_96, key)
}

/** Hash curto e estável (djb2) do id: a mesma persona sempre cai no mesmo bicho. */
function stableIndex(seed: string, size: number): number {
  let hash = 5381
  for (let index = 0; index < seed.length; index += 1) hash = ((hash * 33) ^ seed.charCodeAt(index)) >>> 0
  return hash % size
}

/**
 * O rosto (96 px) da persona.
 * @param avatarRef - a referência guardada na persona (qualquer caixa/espaços).
 * @param personaId - o id da persona; escolhe o bicho estável quando a referência não é um animal da galeria.
 * @returns o endereço do rosto: o animal da referência, ou um bicho estável da galeria.
 */
export function personaFaceSrc(avatarRef: string | undefined, personaId: string): string {
  return AVATAR_96[personaFaceKey(avatarRef, personaId) as Avatar96Key]
}

/**
 * O bicho (id da galeria) cujo rosto a persona mostra: o da referência, ou um bicho estável da galeria. É o mesmo id que o rosto da abertura
 * ("Acordando o time") guarda: só o id do bicho, nunca nome nem dado.
 */
export function personaFaceKey(avatarRef: string | undefined, personaId: string): string {
  const ref = avatarRef?.trim().toLowerCase() ?? ''
  if (isGalleryKey(ref)) return ref
  const animals = PERSONA_GALLERY_ANIMALS.filter(isGalleryKey)
  return animals[stableIndex(personaId, animals.length)] ?? 'capivara'
}
