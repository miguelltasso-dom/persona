/**
 * DESIGN-01 (Muse, 11/11 13:40) "Fio real" (c): o anel de cor do rosto da linha de passagem é o tom da ORDEM DE CONTRATAÇÃO (`personaTintIndex`, a mesma fonte do tom da moldura
 * do Avatar, #17), e não o hash do cargo (duas personas de Design teriam o mesmo anel, e o anel existe para separá-las). Sem tom conhecido, sem anel.
 * Se mesmo assim os dois rostos forem iguais (o mesmo bicho e o mesmo tom), a linha mostra o nome de cada um ao lado do rosto.
 */
import type { TeamPersonaUi } from '../teamwork/team-lines-model.ts'

/** O tom do rosto desta persona (0 a 6); `undefined` quando não é conhecido. */
export function faceTone(persona: TeamPersonaUi): number | undefined {
  return persona.tint
}

/** Os dois rostos se confundem: o mesmo bicho do elenco E o mesmo tom. Sem bicho conhecido não há o que confundir. */
export function sameFace(a: TeamPersonaUi, b: TeamPersonaUi): boolean {
  return a.characterId !== undefined && a.characterId === b.characterId && a.tint === b.tint
}
