/**
 * Central motion helper: transform/opacity only, honors reduced motion, pauses when
 * the document is hidden or the target leaves the viewport.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefCallback } from 'react'
import { PERSONA_MOTION_PRESETS, type PersonaMotionDurationToken, type PersonaMotionEasingToken, type PersonaMotionPresetName } from './tokens.ts'

export interface PersonaMotionOptions {
  /** Preset name or explicit duration/easing CSS variable names. */
  preset?: PersonaMotionPresetName
  duration?: PersonaMotionDurationToken
  easing?: PersonaMotionEasingToken
  /** When true, animation loops until paused. */
  loop?: boolean
  /** Initial opacity when entering (0–1). */
  fromOpacity?: number
  /** Initial translateY in px (positive moves down). */
  fromTranslateY?: number
}

export interface PersonaMotionResult {
  /** Attach to the animated element. */
  ref: RefCallback<Element>
  /** Inline style limited to transform and opacity. */
  style: CSSProperties
  /** True when motion is suppressed or paused. */
  paused: boolean
  /** True when prefers-reduced-motion is active. */
  reducedMotion: boolean
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
const REDUCED_FADE_TOKEN = '--motion-reduced-fade' as const

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  return matchMedia(REDUCED_QUERY).matches
}

function readDurationMs(token: PersonaMotionDurationToken, reduced: boolean): number {
  if (typeof document === 'undefined') return reduced ? 120 : 220
  const name = reduced ? REDUCED_FADE_TOKEN : token
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parsed = Number.parseFloat(raw)
  if (Number.isFinite(parsed)) return parsed
  return reduced ? 120 : 220
}

function readEasing(token: PersonaMotionEasingToken): string {
  if (typeof document === 'undefined') return 'ease'
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return raw.length > 0 ? raw : 'ease'
}

/**
 * Motion hook for Persona surfaces. Uses WAAPI when available; falls back to CSS transition.
 * @param options - preset or explicit tokens.
 * @returns ref, style, and pause flags for the animated node.
 */
export function usePersonaMotion(options: PersonaMotionOptions = {}): PersonaMotionResult {
  const preset = options.preset === undefined ? PERSONA_MOTION_PRESETS.base : PERSONA_MOTION_PRESETS[options.preset]
  const durationToken = options.duration ?? preset.duration
  const easingToken = options.easing ?? preset.easing
  const fromOpacity = options.fromOpacity ?? 1
  const fromTranslateY = options.fromTranslateY ?? 0
  const loop = options.loop ?? false

  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document !== 'undefined' ? document.hidden : false)
  const [inView, setInView] = useState(true)
  const [element, setElement] = useState<Element | null>(null)
  const animationRef = useRef<Animation | null>(null)

  const ref = useCallback<RefCallback<Element>>((node) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia(REDUCED_QUERY)
    const onChange = (): void => { setReducedMotion(media.matches) }
    media.addEventListener('change', onChange)
    return () => { media.removeEventListener('change', onChange) }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = (): void => { setDocumentHidden(document.hidden) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  useEffect(() => {
    if (element === null || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) setInView(entry.isIntersecting)
    }, { threshold: 0 })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [element])

  const paused = documentHidden || !inView

  const durationMs = useMemo(
    () => readDurationMs(durationToken, reducedMotion),
    [durationToken, reducedMotion],
  )
  const easing = useMemo(() => readEasing(easingToken), [easingToken])

  useEffect(() => {
    if (element === null || !(element instanceof HTMLElement)) return
    animationRef.current?.cancel()
    if (paused || reducedMotion) {
      element.style.opacity = String(fromOpacity)
      element.style.transform = fromTranslateY === 0 ? '' : `translateY(${fromTranslateY}px)`
      return
    }
    if (typeof element.animate !== 'function') return
    const keyframes: Keyframe[] = [
      { opacity: fromOpacity, transform: fromTranslateY === 0 ? 'none' : `translateY(${fromTranslateY}px)` },
      { opacity: 1, transform: 'none' },
    ]
    const animation = element.animate(keyframes, {
      duration: durationMs,
      easing,
      fill: 'both',
      iterations: loop ? Infinity : 1,
    })
    animationRef.current = animation
    return () => { animation.cancel() }
  }, [durationMs, easing, element, fromOpacity, fromTranslateY, loop, paused, reducedMotion])

  const style = useMemo((): CSSProperties => ({
    opacity: paused || reducedMotion ? fromOpacity : undefined,
    transform: paused || reducedMotion
      ? (fromTranslateY === 0 ? undefined : `translateY(${fromTranslateY}px)`)
      : undefined,
    transition: reducedMotion
      ? `opacity ${readDurationMs(REDUCED_FADE_TOKEN, true)}ms ${easing}`
      : undefined,
  }), [easing, fromOpacity, fromTranslateY, paused, reducedMotion])

  return { ref, style, paused, reducedMotion }
}
