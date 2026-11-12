/**
 * Momento uau 5 (DESIGN-01 §4, Muse 11/11 16:05): no escuro, ao ABRIR o app, a folhagem do rail entra com a luminária APAGADA
 * (`rail-foliage-dark-off`, o mesmo 544×520 da acesa, idêntica fora da luminária) e faz UM crossfade para a acesa: 420 ms,
 * `--ease-glow` (simétrica in-out: a luz esquenta, não estala), só `opacity`, `iterations: 1`. Depois fica parada e a imagem apagada SAI do DOM (nada com animação "terminada"
 * por perto: o gate de GPU conta `getAnimations()` e o estacionar é 0%).
 *
 * A apagada fica POR CIMA da acesa e some (1 → 0): fora da luminária as duas são iguais pixel a pixel, então só a luz muda.
 *
 * Quando conta como "abrir": só com a pessoa OLHANDO o rail (`armed` = sem o onboarding por cima; no 1º uso acende ao entrar no #geral)
 * e UMA vez por abertura do app (variável de módulo). A vez só se gasta quando o crossfade TERMINA, ou quando não há o que acender (claro,
 * reduced-motion): o rail monta mais de uma vez no boot e sob o onboarding, e uma montagem que ninguém viu não pode comer a vez.
 * Recolher o rail ou trocar de tela depois não reacende. Em `prefers-reduced-motion` (e no claro) a imagem nem entra: já nasce aceso.
 */
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import styles from './PersonaSidebar.module.css'

/** A duração do acender (ms); o CSS usa o mesmo número. */
export const LAMP_ON_MS = 420

/** Quanto esperar além da animação antes de tirar a imagem à força (aba em segundo plano pausa a animação e ela nunca termina). */
const LAMP_ON_GRACE_MS = 140

let lampSwitchSpent = false

/** Só para os testes: "reabre o app". */
export function resetFoliageLampSwitchForTest(): void {
  lampSwitchSpent = false
}

function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.body?.getAttribute('data-ds-dark-theme') === 'true'
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Ainda há a vez da abertura, estamos no escuro, com movimento e com a arte? Pura: quem decide gasta a vez. */
function canPlay(): boolean {
  return !lampSwitchSpent && isDarkTheme() && !prefersReducedMotion() && ILLUSTRATIONS['rail-foliage-dark-off'] !== undefined
}

/**
 * O corpo da página pausa TODA animação do shell quando um scrim o cobre (`data-persona-covered`: onboarding, modal) ou a janela está
 * escondida, sem foco ou ociosa (`data-persona-ambient-paused`) — theme/install-color-scheme.ts, regra 3 de GPU. O `covered` só é relido
 * a cada 1 s, então sai até 1 s DEPOIS do onboarding fechar: começar nesse intervalo congela o crossfade e o prazo o tiraria sem animar.
 */
function bodyPausesMotion(): boolean {
  const body = typeof document === 'undefined' ? null : document.body
  return body !== null && (body.hasAttribute('data-persona-covered') || body.hasAttribute('data-persona-ambient-paused'))
}

function useBodyPausesMotion(): boolean {
  const [paused, setPaused] = useState<boolean>(bodyPausesMotion)
  useEffect(() => {
    const body = typeof document === 'undefined' ? null : document.body
    if (body === null || typeof MutationObserver === 'undefined') return undefined
    const sync = (): void => { setPaused(bodyPausesMotion()) }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(body, { attributes: true, attributeFilter: ['data-persona-covered', 'data-persona-ambient-paused'] })
    return () => { observer.disconnect() }
  }, [])
  return paused
}

export interface FoliageLampOffProps {
  /** A pessoa está olhando o rail (o onboarding não está por cima). Antes disso nada acontece e a vez não se gasta. */
  readonly armed: boolean
}

export function FoliageLampOff({ armed }: FoliageLampOffProps): ReactNode {
  const paused = useBodyPausesMotion()
  // "Olhando": armado pelo shell E o corpo não está pausando o movimento (scrim por cima, janela sem foco).
  const looking = armed && !paused
  const [playing, setPlaying] = useState<boolean>(() => looking && canPlay())

  // O rail já montado e o onboarding fechando (1º uso): acende quando a folhagem descobrir. Sem o que acender (claro, reduced-motion), a vez da abertura se gasta.
  useLayoutEffect(() => {
    if (!looking || playing || lampSwitchSpent) return
    if (canPlay()) setPlaying(true)
    else lampSwitchSpent = true
  }, [looking, playing])

  // O prazo de segurança só corre enquanto a animação PODE correr: pausada pela janela, ela retoma de onde parou e o prazo recomeça.
  useEffect(() => {
    if (!playing || paused) return undefined
    const timer = window.setTimeout(() => { lampSwitchSpent = true; setPlaying(false) }, LAMP_ON_MS + LAMP_ON_GRACE_MS)
    return () => { window.clearTimeout(timer) }
  }, [playing, paused])

  const src = ILLUSTRATIONS['rail-foliage-dark-off']
  if (!playing || src === undefined) return null
  return (
    <img
      className={styles.foliageDarkOff}
      src={src}
      alt=""
      data-persona-foliage-dark-off=""
      onAnimationEnd={() => { lampSwitchSpent = true; setPlaying(false) }}
    />
  )
}
