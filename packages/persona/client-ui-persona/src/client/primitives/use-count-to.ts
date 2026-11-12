import { useEffect, useRef, useState } from 'react'

/** The team-health meter's curve: cubic-bezier(0.22, 1, 0.36, 1), the same one the arc's CSS transition uses. */
const X1 = 0.22
const Y1 = 1
const X2 = 0.36
const Y2 = 1

function bezier(t: number, a: number, b: number): number {
  const u = 1 - t
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
}

/** y for a given x on the curve (Newton steps from x itself; the curve is monotonic on [0, 1]). */
function easeOut(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let t = x
  for (let i = 0; i < 6; i += 1) {
    const dx = bezier(t, X1, X2) - x
    const slope = 3 * (1 - t) * (1 - t) * X1 + 6 * (1 - t) * t * (X2 - X1) + 3 * t * t * (1 - X2)
    if (Math.abs(dx) < 1e-5 || slope === 0) break
    t -= dx / slope
  }
  return bezier(t, Y1, Y2)
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * The number a counter DRAWS while it travels to `target`: it starts at the target (no animation on the first draw), and when `target` changes
 * it runs from the number on screen to the new one in `ms` on the meter's curve. With reduced motion it jumps. The real value is always the
 * `target`; callers expose that one to assistive tech.
 *
 * @param target The value the counter ends on.
 * @param ms How long the trip takes.
 * @returns The integer to draw now.
 */
export function useCountTo(target: number, ms = 420): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  useEffect(() => {
    const from = shownRef.current
    if (from === target) return undefined
    if (prefersReducedMotion()) {
      shownRef.current = target
      setShown(target)
      return undefined
    }
    const startedAt = performance.now()
    let frame = 0
    // Read the clock here, not from the frame callback: the callback's timestamp is not on the same base as performance.now() in every environment.
    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - startedAt) / ms)
      const value = Math.round(from + (target - from) * easeOut(progress))
      shownRef.current = value
      setShown(value)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame) }
  }, [target, ms])
  return shown
}
