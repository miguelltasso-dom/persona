/* oxlint-disable typescript/no-unnecessary-condition -- every input here crosses a trust boundary (signed card, local record, wire): the fail-closed checks must not assume the static types. */
/**
 * M9 / Atlas 12/11 15:36: o "ao vivo" da persona que mexe no computador.
 *  (1) Transmite SÓ o recorte da janela ativa da persona, nunca a tela inteira do PC.
 *  (2) Só assiste quem pode pedir coisas à persona: a MESMA matriz do `computer-scope.ts` (nenhuma cópia).
 * Campo de senha sempre coberto, no host, antes de o quadro sair. Tudo falha fechado: dado estranho = quadro coberto / ninguém assiste.
 */

import { decideComputerUse, type ComputerDescriptor, type ComputerScopeDecision, type ComputerUsePersona } from './computer-scope.ts'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type WatchDeny = Extract<ComputerScopeDecision, { allow: false }>['reason'] | 'device-revoked'
export type WatchDecision = { readonly allow: true } | { readonly allow: false; readonly reason: WatchDeny }

/** Quem assiste = quem poderia comandar: a decisão é a do `decideComputerUse`, com o espectador no lugar do comandante. */
export function decideWatch(input: {
  readonly persona: ComputerUsePersona
  readonly computer: ComputerDescriptor
  readonly viewerId: string
  readonly allowedIds: readonly string[]
}): WatchDecision {
  return decideComputerUse({ persona: input.persona, computer: input.computer, commanderId: input.viewerId, allowedIds: input.allowedIds })
}

/** Reconferido a CADA quadro (o stream do portão): lista mudou ou aparelho revogado = cortado no quadro seguinte. */
export function createWatchGate(input: {
  readonly persona: () => ComputerUsePersona
  readonly computer: () => ComputerDescriptor
  readonly allowedIds: () => readonly string[]
  readonly deviceRevoked: () => boolean
}): { admit(viewerId: string): WatchDecision } {
  return {
    admit(viewerId) {
      try {
        if (input.deviceRevoked()) return { allow: false, reason: 'device-revoked' }
        return decideWatch({ persona: input.persona(), computer: input.computer(), viewerId, allowedIds: input.allowedIds() })
      } catch {
        return { allow: false, reason: 'unreadable' }
      }
    },
  }
}

export type WatchCoverReason = 'no-target-window' | 'target-offscreen' | 'foreign-window-over-target' | 'invalid'

export type WatchFramePlan =
  | { readonly kind: 'crop'; readonly rect: Rect; readonly masks: readonly Rect[] }
  | { readonly kind: 'covered'; readonly reason: WatchCoverReason; readonly pause?: true }

const covered = (reason: WatchCoverReason, pause?: true): WatchFramePlan => (pause === true ? { kind: 'covered', reason, pause } : { kind: 'covered', reason })
const finite = (r: Rect): boolean => [r?.x, r?.y, r?.w, r?.h].every(n => typeof n === 'number' && Number.isFinite(n))

function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const r = Math.min(a.x + a.w, b.x + b.w)
  const btm = Math.min(a.y + a.h, b.y + b.h)
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : undefined
}

/**
 * O que sai no quadro. Só `crop` carrega pixels, e só os do retângulo da janela alvo (já limitado à tela). Qualquer janela de outro
 * processo ou de zona proibida (`overlapping`) que encoste no recorte cobre o quadro INTEIRO e pausa o passo (Lumen D6). As máscaras
 * de senha vão em coordenadas do recorte, limitadas a ele; senha inválida cobre tudo (nunca passa sem máscara).
 */
export function planWatchFrame(input: {
  readonly screen: { readonly w: number; readonly h: number }
  readonly target: Rect | undefined
  readonly overlapping: readonly { readonly rect: Rect; readonly kind: 'foreign' | 'forbidden' }[]
  readonly passwordRects: readonly Rect[]
}): WatchFramePlan {
  const { screen, target, overlapping, passwordRects } = input
  if (target === undefined) return covered('no-target-window')
  if (!finite(target) || target.w <= 0 || target.h <= 0 || !(screen?.w > 0) || !(screen?.h > 0)) return covered('invalid')
  const rect = intersect(target, { x: 0, y: 0, w: screen.w, h: screen.h })
  if (rect === undefined) return covered('target-offscreen')

  for (const o of overlapping) {
    if (!finite(o.rect)) return covered('invalid')
    if (intersect(o.rect, rect) !== undefined) return covered('foreign-window-over-target', true)
  }

  const masks: Rect[] = []
  for (const p of passwordRects) {
    if (!finite(p)) return covered('invalid')
    const hit = intersect(p, rect)
    if (hit !== undefined) masks.push({ x: hit.x - rect.x, y: hit.y - rect.y, w: hit.w, h: hit.h })
  }
  return { kind: 'crop', rect, masks }
}
