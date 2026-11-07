/**
 * Luz da luminária no chat (NIGHT-THEME-SPEC §5, aprovada pelo Miguel 04/11 20:21): SÓ no tema escuro, atrás de `persona.flag.lampLight`
 * (desligada por padrão, D-077) e junto dos balões (CV-9): a luz cai numa camada de FUNDO `aria-hidden`; os balões e o composer
 * continuam sólidos (o contraste do texto não muda). Perto da luz, mais luz: `--lit` (0–1) dá uma borda quente nos lados que olham
 * para ela e uma sombra jogada para longe. O `--lit` é calculado por layout (ResizeObserver e resize), NUNCA no scroll nem por quadro;
 * sem o cálculo vale 0 e a borda e a sombra ficam as de hoje.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { isBubblesEnabled } from './bubbles-flag.ts'

import { readFlag } from '../flags.ts'
// FLAGS-ON-1 (v1.1): LIGADA por padrão; '0' no localStorage (ou window.__PERSONA_FLAGS__ = { lampLight: false }) desliga. Leitor central: ../flags.ts (persona-spec/contracts/flags-defaults.md).

export const LAMP_LIGHT_FLAG_KEY = 'persona.flag.lampLight'

/** A flag da luz está ligada? Nunca lança (storage bloqueado: vale o padrão, LIGADO na v1.1). */
export function isLampLightFlagOn(): boolean {
  return readFlag('lampLight')
}

/**
 * A luz só existe com os balões ligados: o fio de antes tem texto direto sobre o fundo, e a luz não pode cair sobre texto. Assim a
 * flag da luz sozinha nunca muda nada.
 */
export function isLampLightEnabled(): boolean {
  return isLampLightFlagOn() && isBubblesEnabled()
}

export interface LitRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** A arte da folhagem ESCURA v2 (a que tem a luminária), em px da imagem @2x. A v1 tem outro tamanho e não tem luminária. */
export const FOLIAGE_V2_SIZE = { width: 544, height: 520 } as const
/** O centro da luminária na arte v2 (Muse): 66,5% × 75,1% da imagem. */
export const FOLIAGE_LAMP_CENTER = { x: 0.665, y: 0.751 } as const
/** Lado do quadrado do halo (raio ~45 px a 1×). */
export const HALO_SIZE = 90

export function isFoliageV2(natural: { readonly width: number; readonly height: number }): boolean {
  return natural.width === FOLIAGE_V2_SIZE.width && natural.height === FOLIAGE_V2_SIZE.height
}

/**
 * Onde a luminária cai DENTRO do contêiner da folhagem. A arte é desenhada com `object-fit: cover` e `object-position: bottom center`:
 * escala pelo lado que mais falta, centra na horizontal e cola embaixo. Devolve o ponto em px do canto de cima à esquerda do contêiner.
 */
export function foliageLampOffset(
  container: { readonly width: number; readonly height: number },
  natural: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } | null {
  if (container.width <= 0 || container.height <= 0 || natural.width <= 0 || natural.height <= 0) return null
  const scale = Math.max(container.width / natural.width, container.height / natural.height)
  const drawnWidth = natural.width * scale
  const drawnHeight = natural.height * scale
  const offsetX = (container.width - drawnWidth) / 2
  const offsetY = container.height - drawnHeight
  return { x: offsetX + drawnWidth * FOLIAGE_LAMP_CENTER.x, y: offsetY + drawnHeight * FOLIAGE_LAMP_CENTER.y }
}

/** A origem da luz medida no halo real da folhagem (o centro do retângulo dele); `null` sem halo (arte v1, flag desligada, claro). */
export function lampOriginFromHalo(): { readonly x: number; readonly y: number } | null {
  if (typeof document === 'undefined') return null
  const halo = document.querySelector('[data-persona-lamp-halo]')
  if (halo === null) return null
  const rect = halo.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/** A luminária fica fora do chat, na altura do rodapé: 110 px à esquerda da borda e a 93% da altura (quando não há halo para medir). */
export function lampPosition(box: LitRect): { readonly x: number; readonly y: number } {
  return { x: box.left - 110, y: box.top + box.height * 0.93 }
}

/**
 * O quanto um elemento está "perto da luz" (0 = longe, 1 = colado). A distância vai do meio do elemento (até 160 px de largura:
 * um balão largo conta pela ponta que olha para a luz) à luminária; o alcance é 85% da diagonal do chat.
 */
export function litFor(box: LitRect, element: LitRect, origin?: { readonly x: number; readonly y: number } | null): number {
  const lamp = origin ?? lampPosition(box)
  const reach = Math.hypot(box.width, box.height) * 0.85
  if (reach <= 0) return 0
  const distance = Math.hypot(element.left + Math.min(element.width, 160) / 2 - lamp.x, element.top + element.height / 2 - lamp.y)
  return Math.max(0, Math.min(1, 1 - distance / reach))
}

/**
 * Põe `--lit` em todo `[data-lit]` dentro do contêiner, uma vez por layout e a cada resize. Lê todas as medidas ANTES de escrever
 * (uma passada de layout só). `contentKey` muda quando o conteúdo muda (mensagem nova), e então recalcula. Desligado: não faz nada e não observa nada.
 */
export function useLampLight<T extends HTMLElement>(on: boolean, contentKey: string | number = 0): RefObject<T> {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!on || root === null) return undefined
    const apply = (): void => {
      const box = root.getBoundingClientRect()
      // A origem vem do halo REAL na folhagem v2 (Muse); sem ele, a conta fixa de antes.
      const origin = lampOriginFromHalo()
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-lit]'))
      const values = items.map(element => litFor(box, element.getBoundingClientRect(), origin))
      items.forEach((element, index) => { element.style.setProperty('--lit', (values[index] ?? 0).toFixed(2)) })
    }
    apply()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply)
    observer?.observe(root)
    window.addEventListener('resize', apply)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [on, contentKey])
  return ref
}
