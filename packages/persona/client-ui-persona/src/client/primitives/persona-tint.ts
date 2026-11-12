/**
 * DESIGN-01 #17 (Muse): o tom do rosto de uma persona vem da ORDEM DE CONTRATAÇÃO, não da espécie nem do cargo (dois "Design" teriam o mesmo tom): o índice na equipe
 * (a ordem em que o host a lista) mod 7, um dos 7 tons `--persona-subject-{0..6}`. Uma fonte só, para o anel da linha de passagem e para a moldura do Avatar.
 */
export const PERSONA_TINT_COUNT = 7

/** O tom (0 a 6) de `personaId` no `roster` (os ids na ordem de contratação); `undefined` quando ela não está na equipe (nunca um tom inventado). */
export function personaTintIndex(personaId: string, roster: readonly string[]): number | undefined {
  const index = roster.indexOf(personaId)
  return index < 0 ? undefined : index % PERSONA_TINT_COUNT
}
