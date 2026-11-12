/**
 * COLHEITA 5 — "Segure para enviar": the button that asks for a deliberate press before something leaves the company (pay, delete, send, post).
 * The motor is `hold-approve.ts`; this file is the pointer/keyboard wiring and the words.
 *
 *  - A press that lasts `HOLD_APPROVE_MS` calls `onConfirm` once; the label turns into "Enviando…" and the button locks (no double click).
 *  - Letting go earlier, moving the pointer away or leaving the focus cancels. A short click never sends: it opens the hint
 *    "Segure o botão até encher." for 4 s (or until the next gesture).
 *  - Keyboard: holding Space or Enter does the same. `aria-describedby` points to a visually hidden sentence that is always in the DOM and a
 *    live region says "Confirmando…" while it fills.
 *  - The fill is information, not decoration: it keeps running under reduced motion.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, UiIcon } from '../primitives/index.ts'
import { createHoldMachine, HOLD_APPROVE_MS, HOLD_HINT_MS, type HoldMachine, type HoldPhase } from './hold-approve.ts'
import styles from './HoldToApproveButton.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface HoldToApproveButtonProps {
  readonly t: ChatT
  /** "Segure para enviar" (the verb changes: publicar · pagar · apagar). */
  readonly label: string
  /** What the button says once the press completed ("Enviando…"). */
  readonly busyLabel: string
  readonly variant?: 'primary' | 'danger'
  /** The decision is on its way (or the host is already sending): the button stays locked. */
  readonly locked: boolean
  readonly disabled?: boolean
  /** The press lasted the whole time. A rejected promise (or a card that is still pending afterwards) lets the person hold again. */
  readonly onConfirm: () => void | Promise<void>
  /** Only tests change the duration. */
  readonly durationMs?: number
}

const isActivationKey = (key: string): boolean => key === ' ' || key === 'Enter' || key === 'Spacebar'

export function HoldToApproveButton({ t, label, busyLabel, variant = 'primary', locked, disabled = false, onConfirm, durationMs = HOLD_APPROVE_MS }: HoldToApproveButtonProps): ReactNode {
  const describedBy = useId()
  const [phase, setPhase] = useState<HoldPhase>('idle')
  const [hint, setHint] = useState(false)
  const confirmRef = useRef(onConfirm)
  confirmRef.current = onConfirm
  const machineRef = useRef<HoldMachine | null>(null)

  const machine = useMemo(() => {
    const created = createHoldMachine({
      durationMs,
      timers: { set: (run, ms) => window.setTimeout(run, ms), clear: (handle) => { window.clearTimeout(handle as number) } },
      onPhase: setPhase,
      onComplete: () => {
        // The machine stays `done` (one approval per press) until the decision settles; a failure reopens the button.
        void Promise.resolve()
          .then(() => confirmRef.current())
          .catch(() => undefined)
          .finally(() => { machineRef.current?.reset() })
      },
    })
    machineRef.current = created
    return created
  }, [durationMs])

  useEffect(() => () => { machine.cancel() }, [machine])

  // The hint lasts 4 s or until the next gesture anywhere.
  useEffect(() => {
    if (!hint) return undefined
    const hide = (): void => { setHint(false) }
    const timer = window.setTimeout(hide, HOLD_HINT_MS)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
    }
  }, [hint])

  const idle = !locked && !disabled
  const press = useCallback(() => {
    if (!idle) return
    setHint(false)
    machine.press()
  }, [idle, machine])
  const release = useCallback(() => {
    if (machine.release() === 'early') setHint(true)
  }, [machine])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    press()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!isActivationKey(event.key)) return
    event.preventDefault() // the native click on Enter/Space must not exist: only a full hold approves
    if (!event.repeat) press()
  }
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!isActivationKey(event.key)) return
    event.preventDefault()
    release()
  }

  const filling = phase === 'holding' || phase === 'done' || locked
  // A fragment: the button is one item of the card's row of actions and the hint is another, on its own line BELOW the row
  // (it must never make the row taller: the neighbours keep their own height).
  return (
    <>
      <Button
        size="m"
        variant={variant}
        className={styles.hold}
        data-hold-approve=""
        data-variant={variant}
        data-phase={locked ? 'done' : phase}
        style={{ '--hold-ms': `${String(durationMs)}ms` } as CSSProperties}
        disabled={disabled || locked}
        aria-describedby={describedBy}
        aria-busy={locked || undefined}
        icon={filling && (locked || phase === 'done')
          ? (
            <svg className={styles.check} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
            </svg>
          )
          : undefined}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerLeave={() => { machine.cancel() }}
        onPointerCancel={() => { machine.cancel() }}
        onBlur={() => { machine.cancel() }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(event) => { if (machine.phase() === 'holding') event.preventDefault() }}
        // A click that no press produced (a screen reader's activation, a script) never approves: it only shows how.
        onClick={(event) => { if (event.detail === 0 && machine.phase() === 'idle') setHint(true) }}
      >
        {locked || phase === 'done' ? busyLabel : label}
      </Button>
      <span id={describedBy} className={styles.srOnly}>{t('action.hold.sr')}</span>
      <span className={styles.srOnly} aria-live="polite">{phase === 'holding' ? t('action.hold.confirming') : ''}</span>
      {hint && (
        <span className={styles.hint} role="status" data-hold-hint="">
          <UiIcon name="hold" size={24} />
          <span>{t('action.hold.hint')}</span>
        </span>
      )}
    </>
  )
}
