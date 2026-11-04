/**
 * Persona cursor + action replay (COMPUTER-USE-SPEC §2–3, §6, Muse — PLAN W3-6).
 * PersonaCursor: the arrow + "face · name · what" pill, by state. ActionReplay: plays back what a persona did on
 * the computer (arcs, clicks, typing) over the step screenshots — Space plays/pauses, ←/→ step, reduced-motion jumps.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Button, IconButton } from './Button.tsx'
import { UiIcon } from './icons.tsx'
import { arcPathData, cursorAt, totalMoveMs, type ArcPath, type Point } from './cursor-motion.ts'
import styles from './PersonaCursor.module.css'

export type PersonaCursorState = 'idle' | 'moving' | 'clicking' | 'typing' | 'waiting' | 'human'

export interface CursorPersona {
  readonly name: string
  readonly avatarSrc?: string | undefined
  /** The animal's tone (pill background); text stays plum for AA. */
  readonly color: string
}

export interface PersonaCursorProps {
  readonly persona: CursorPersona
  readonly point: Point
  readonly state: PersonaCursorState
  /** Intent / target / typed text shown after the name. */
  readonly detail?: string | undefined
  /** "você assumiu" */
  readonly humanLabel?: string | undefined
}

export function PersonaCursor({ persona, point, state, detail, humanLabel }: PersonaCursorProps): ReactNode {
  const what = state === 'human' ? humanLabel : detail
  return (
    <div
      className={styles.cursor}
      data-state={state}
      style={{ transform: `translate(${point.x - 3}px, ${point.y - 3}px)`, '--persona-cursor-color': persona.color } as CSSProperties}
      aria-hidden="true"
    >
      <svg className={styles.arrow} viewBox="0 0 22 26" width={22} height={26}>
        <path d="M3 3 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.6 15.2 L18.5 15 Z" />
      </svg>
      <span className={styles.pill}>
        {persona.avatarSrc !== undefined && <img src={persona.avatarSrc} alt="" draggable={false} />}
        <span className={styles.name}>{persona.name}</span>
        {state === 'waiting' ? (
          <span className={styles.dots}><b /><b /><b /></span>
        ) : what !== undefined && what !== '' ? (
          <span className={state === 'typing' ? `${styles.what} ${styles.typing}` : styles.what}>{what}</span>
        ) : null}
      </span>
    </div>
  )
}

export type ReplayStepKind = 'click' | 'type' | 'wait' | 'move'

export interface ReplayStep {
  readonly id: string
  /** Screenshot at this step (natural size `shotSize`). */
  readonly shotSrc: string
  /** Where the action happened, in screenshot pixels. */
  readonly at: Point
  readonly kind: ReplayStepKind
  /** "clicando em Salvar pedido", "abrindo o cadastro". */
  readonly label: string
  /** Text typed for `type` steps. */
  readonly typed?: string | undefined
}

export interface ActionReplayProps {
  readonly persona: CursorPersona
  readonly steps: readonly ReplayStep[]
  /** Natural size of the screenshots (all steps share it). */
  readonly shotSize: { readonly w: number; readonly h: number }
  readonly labels: {
    /** "O que a Nina fez no computador" */
    readonly region: string
    readonly play: string
    readonly pause: string
    readonly previous: string
    readonly next: string
    readonly restart: string
    /** "Passo {n} de {total}" already formatted per step index (1-based). */
    readonly stepOf: (n: number, total: number) => string
  }
  readonly autoPlay?: boolean
}

const DWELL_MS: Readonly<Record<ReplayStepKind, number>> = { click: 650, type: 1100, wait: 900, move: 350 }

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Replay of a computer-use run: cursor arcs + clicks + typing over the step screenshots. */
export function ActionReplay({ persona, steps, shotSize, labels, autoPlay = false }: ActionReplayProps): ReactNode {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(autoPlay)
  const [point, setPoint] = useState<Point>(steps[0]?.at ?? { x: shotSize.w / 2, y: shotSize.h / 2 })
  const [phase, setPhase] = useState<'moving' | 'acting'>('acting')
  const [trail, setTrail] = useState<ArcPath | null>(null)
  const [scale, setScale] = useState(1)
  const stageRef = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  useEffect(() => {
    const node = stageRef.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => { setScale(node.clientWidth / shotSize.w) })
    observer.observe(node)
    setScale(node.clientWidth / shotSize.w)
    return () => { observer.disconnect() }
  }, [shotSize.w])

  /** Animate from the previous step's point to `target`, then dwell, then advance. */
  const runStep = useCallback((target: number) => {
    cancelAnimationFrame(frame.current)
    const step = steps[target]
    if (step === undefined) return
    const from = steps[target - 1]?.at ?? step.at
    const reduced = prefersReducedMotion()
    const travel = reduced || target === 0 ? 0 : totalMoveMs(from, step.at)
    const dwell = DWELL_MS[step.kind]
    const start = performance.now()
    setTrail(null)
    const tick = (now: number): void => {
      const elapsed = now - start
      if (elapsed < travel) {
        const at = cursorAt(from, step.at, target, elapsed)
        setPhase('moving')
        setPoint(at.point)
        setTrail(at.path)
      } else {
        setPhase('acting')
        setPoint(step.at)
        if (elapsed > travel + 500) setTrail(null)
      }
      if (elapsed < travel + dwell) {
        frame.current = requestAnimationFrame(tick)
      } else if (target + 1 < steps.length) {
        setIndex(target + 1)
      } else {
        setPlaying(false)
      }
    }
    frame.current = requestAnimationFrame(tick)
  }, [steps])

  useEffect(() => {
    if (playing) runStep(index)
    return () => { cancelAnimationFrame(frame.current) }
  }, [playing, index, runStep])

  const jump = (target: number): void => {
    const clamped = Math.max(0, Math.min(steps.length - 1, target))
    setPlaying(false)
    cancelAnimationFrame(frame.current)
    setIndex(clamped)
    setPhase('acting')
    setTrail(null)
    const at = steps[clamped]?.at
    if (at !== undefined) setPoint(at)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === ' ') {
      event.preventDefault()
      setPlaying(value => !value)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      jump(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      jump(index - 1)
    }
  }

  const step = steps[index]
  if (step === undefined) return null
  const state: PersonaCursorState = phase === 'moving' ? 'moving'
    : step.kind === 'click' ? 'clicking'
      : step.kind === 'type' ? 'typing'
        : step.kind === 'wait' ? 'waiting'
          : 'idle'
  const detail = step.kind === 'type' ? step.typed ?? step.label : step.label
  const scaled = { x: point.x * scale, y: point.y * scale }
  const atEnd = index === steps.length - 1 && !playing

  return (
    <div className={styles.replay} role="region" aria-label={labels.region} tabIndex={0} onKeyDown={onKeyDown}>
      <div ref={stageRef} className={styles.stage} style={{ aspectRatio: `${shotSize.w} / ${shotSize.h}` }}>
        <img className={styles.shot} src={step.shotSrc} alt="" draggable={false} />
        <svg className={styles.trails} viewBox={`0 0 ${shotSize.w} ${shotSize.h}`} preserveAspectRatio="none" aria-hidden="true">
          {trail !== null && <path d={arcPathData(trail)} stroke={persona.color} />}
        </svg>
        {phase === 'acting' && step.kind === 'click' && (
          <span key={step.id} className={styles.ripple} style={{ left: step.at.x * scale, top: step.at.y * scale, '--persona-cursor-color': persona.color } as CSSProperties} aria-hidden="true" />
        )}
        <PersonaCursor persona={persona} point={scaled} state={state} detail={detail} />
      </div>
      <div className={styles.controls}>
        <IconButton size="s" variant="ghost" label={labels.previous} disabled={index === 0} icon={<UiIcon name="chevronDown" size={16} className={styles.left} />} onClick={() => { jump(index - 1) }} />
        <Button
          size="s"
          variant="primary"
          onClick={() => {
            if (atEnd) {
              jump(0)
              setPlaying(true)
              return
            }
            setPlaying(value => !value)
          }}
        >
          {playing ? labels.pause : atEnd ? labels.restart : labels.play}
        </Button>
        <IconButton size="s" variant="ghost" label={labels.next} disabled={index >= steps.length - 1} icon={<UiIcon name="chevronDown" size={16} className={styles.right} />} onClick={() => { jump(index + 1) }} />
        <p className={styles.caption} aria-live="polite">
          <span className={styles.stepOf}>{labels.stepOf(index + 1, steps.length)}</span>
          {step.label}
        </p>
        <ol className={styles.stepDots} aria-hidden="true">
          {steps.map((item, i) => (
            <li key={item.id} data-done={i < index ? '' : undefined} data-current={i === index ? '' : undefined} />
          ))}
        </ol>
      </div>
    </div>
  )
}
