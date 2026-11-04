/**
 * Persona cursor motion (COMPUTER-USE-SPEC §4, Muse) — pure math shared by the in-app replay and the Electron
 * overlay (Rivet ports the same functions). Natural arcs (cubic Bézier pushed to one side), minimum-jerk easing,
 * Fitts-like duration, small overshoot on long moves.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export interface ArcPath {
  readonly p0: Point
  readonly p1: Point
  readonly p2: Point
  readonly p3: Point
  readonly dist: number
}

export function bezierPoint(path: ArcPath, t: number): Point {
  const { p0, p1, p2, p3 } = path
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** Human reach profile: s(t) = 10t³ − 15t⁴ + 6t⁵. */
export function minJerk(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * c * (10 - 15 * c + 6 * c * c)
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - Math.min(1, Math.max(0, t))) ** 3
}

/** Curvature k = clamp(0.18·dist, 10, 120); `seed` alternates the side so consecutive moves never look mechanical. */
export function arcPath(from: Point, to: Point, seed: number): ArcPath {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const len = dist === 0 ? 1 : dist
  const nx = -dy / len
  const ny = dx / len
  const side = seed % 2 === 0 ? 1 : -1
  const k = Math.min(120, Math.max(10, dist * 0.18)) * side
  return {
    p0: from,
    p1: { x: from.x + dx * 0.28 + nx * k, y: from.y + dy * 0.28 + ny * k },
    p2: { x: from.x + dx * 0.78 + nx * k * 0.55, y: from.y + dy * 0.78 + ny * k * 0.55 },
    p3: to,
    dist,
  }
}

/** 220 + 160·log₂(1 + dist/32) ms, capped at 900 ms. */
export function moveDuration(dist: number): number {
  return Math.min(900, 220 + 160 * Math.log2(1 + Math.max(0, dist) / 32))
}

export const OVERSHOOT_MIN_DIST = 360
export const OVERSHOOT_PX = 8
export const SETTLE_MS = 110

/**
 * Position at `elapsedMs` of a full move (arc + optional settle). `done` once landed on `to`.
 * Deterministic: the replay can scrub to any instant.
 */
export function cursorAt(from: Point, to: Point, seed: number, elapsedMs: number): { readonly point: Point; readonly done: boolean; readonly path: ArcPath } {
  const raw = Math.hypot(to.x - from.x, to.y - from.y)
  const overshoot = raw > OVERSHOOT_MIN_DIST
  const ux = raw === 0 ? 0 : (to.x - from.x) / raw
  const uy = raw === 0 ? 0 : (to.y - from.y) / raw
  const aim = overshoot ? { x: to.x + ux * OVERSHOOT_PX, y: to.y + uy * OVERSHOOT_PX } : to
  const path = arcPath(from, aim, seed)
  const travel = moveDuration(path.dist)
  if (elapsedMs < travel) return { point: bezierPoint(path, minJerk(elapsedMs / travel)), done: false, path }
  if (!overshoot) return { point: to, done: true, path }
  const settle = (elapsedMs - travel) / SETTLE_MS
  if (settle >= 1) return { point: to, done: true, path }
  const e = easeOutCubic(settle)
  return { point: { x: aim.x + (to.x - aim.x) * e, y: aim.y + (to.y - aim.y) * e }, done: false, path }
}

export function totalMoveMs(from: Point, to: Point): number {
  const raw = Math.hypot(to.x - from.x, to.y - from.y)
  const dist = raw > OVERSHOOT_MIN_DIST ? raw + OVERSHOOT_PX : raw
  return moveDuration(dist) + (raw > OVERSHOOT_MIN_DIST ? SETTLE_MS : 0)
}

/** SVG path data for the trail of an arc. */
export function arcPathData(path: ArcPath): string {
  const { p0, p1, p2, p3 } = path
  const f = (n: number): string => n.toFixed(1)
  return `M${f(p0.x)},${f(p0.y)} C${f(p1.x)},${f(p1.y)} ${f(p2.x)},${f(p2.y)} ${f(p3.x)},${f(p3.y)}`
}
