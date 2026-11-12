/**
 * Item 15 (colheita) — o cartão "Precisa de um código" (Muse 12/11): um site mandou um código de 6 dígitos por SMS ou WhatsApp e a persona
 * abriu um pedido. A pessoa digita os dígitos aqui; eles vão ao host, que os lê UMA vez para o navegador. Os dígitos nunca entram em
 * fio, evento, prompt ou turno: este componente os guarda só no estado dele e os apaga depois do envio.
 *
 * Mesma gramática do cartão de ação do Prism (Card accent, cabeçalho com rosto de 24 px + lock + rótulo, selo de prazo âmbar, botões a
 * 40 px), com o conteúdo próprio: o motivo na voz da persona e as seis caixas de 48 px. Apresentação pura.
 */

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { approvalDeadline, DEADLINE_REFRESH_MS } from '../chat/hold-approve.ts'
import { Avatar, Button, Card, UiIcon } from '../primitives/index.ts'
import type { CofreKey } from '../locale/cofre/locales.ts'
import styles from './CodeRequestCard.module.css'

type T = (key: CofreKey, params?: Readonly<Record<string, string | number>>) => string

/** How many digits a code has. */
export const CODE_LENGTH = 6

/** A code request as the card draws it (the host's view plus the persona's name and face, which the container resolves). */
export interface CodeRequestRow {
  readonly id: string
  readonly personaName: string
  /** The 96 px face; absent = initials. */
  readonly faceSrc?: string | undefined
  /** The site the code is for ("Mercado Livre"), when the host knows it. */
  readonly site?: string | undefined
  /** Why the code is needed, in the persona's own words. */
  readonly reason: string
  readonly state: 'pending' | 'filled' | 'taken' | 'cancelled' | 'expired'
  /** ISO time the request stops waiting. */
  readonly expiresAt: string
}

export interface CodeRequestCardProps {
  readonly row: CodeRequestRow
  /** A missing handler is a missing button. */
  readonly onFill?: (code: string) => Promise<void>
  readonly onCancel?: () => Promise<void>
  /** "Tentar de novo" on an expired request: asks the persona again. */
  readonly onRetry?: () => void
  readonly now?: () => number
  readonly rowTag?: 'li' | 'div'
  readonly t: T
}

/** The clock of the deadline chip: reads again every {@link DEADLINE_REFRESH_MS} while the card waits. */
function useClock(read: () => number, active: boolean): number {
  const readRef = useRef(read)
  readRef.current = read
  const [now, setNow] = useState(() => read())
  useEffect(() => {
    if (!active) return undefined
    const id = window.setInterval(() => { setNow(readRef.current()) }, DEADLINE_REFRESH_MS)
    return () => { window.clearInterval(id) }
  }, [active])
  return now
}

/** Only the digits of a text, at most {@link CODE_LENGTH}. */
export function digitsOf(text: string): string {
  return text.replace(/\D/gu, '').slice(0, CODE_LENGTH)
}

export function CodeRequestCard({ row, onFill, onCancel, onRetry, now, rowTag: Tag = 'li', t }: CodeRequestCardProps): ReactNode {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, () => ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const nowMs = useClock(now ?? Date.now, row.state === 'pending')
  const deadline = approvalDeadline(row.expiresAt, nowMs)
  const expired = row.state === 'expired' || (row.state === 'pending' && deadline?.state === 'expired')

  if (row.state === 'filled' || row.state === 'taken') {
    return (
      <Tag className={styles.done} data-code-request="delivered">
        <span className={styles.doneIcon} aria-hidden="true"><UiIcon name="check" size={16} strokeWidth={2.4} /></span>
        <span>{t('code.sent')}</span>
      </Tag>
    )
  }
  if (row.state === 'cancelled') {
    return <Tag className={styles.done} data-code-request="cancelled"><span>{t('code.cancelled')}</span></Tag>
  }

  const eyebrow = row.site === undefined || row.site === '' ? t('code.eyebrow') : `${t('code.eyebrow')} · ${row.site}`
  const heading = (
    <span className={styles.eyebrowRow}>
      <Avatar name={row.personaName} src={row.faceSrc} shape="portrait" size={24} decorative />
      <UiIcon name="lock" size={18} />
      <span>{eyebrow}</span>
    </span>
  )

  // Passou do prazo: só leitura, sem sombra e sem o âmbar (o âmbar é "esperando você"; o vencido não espera mais).
  if (expired) {
    return (
      <Tag className={styles.row} data-code-request="expired">
        <Card as="article" padding="s" aria-label={eyebrow} className={`${styles.card} ${styles.expiredCard}`} eyebrow={heading}>
          <p className={styles.reason}>{row.reason}</p>
          <p className={styles.expiredLine}>
            <UiIcon name="clock" size={14} />
            <span>{t('code.expired')}</span>
          </p>
          {onRetry !== undefined && (
            <div className={styles.actions}>
              <Button variant="secondary" size="m" onClick={onRetry}>{t('code.retry')}</Button>
            </div>
          )}
        </Card>
      </Tag>
    )
  }

  const code = digits.join('')
  const complete = code.length === CODE_LENGTH

  const setAt = (index: number, value: string): void => {
    setDigits(current => current.map((digit, at) => (at === index ? value : digit)))
  }
  const focusBox = (index: number): void => { boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus() }

  const fillFrom = (index: number, text: string): void => {
    const typed = digitsOf(text)
    if (typed === '') return
    setDigits((current) => {
      const next = [...current]
      for (let offset = 0; offset < typed.length && index + offset < CODE_LENGTH; offset += 1) next[index + offset] = typed.charAt(offset)
      return next
    })
    focusBox(Math.min(CODE_LENGTH - 1, index + typed.length))
  }

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault()
      setAt(index - 1, '')
      focusBox(index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault()
    // Pasting a whole code fills the six boxes from the first, whichever box had the focus.
    const text = event.clipboardData.getData('text')
    fillFrom(digitsOf(text).length === CODE_LENGTH ? 0 : index, text)
  }

  const send = async (): Promise<void> => {
    if (onFill === undefined || !complete || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await onFill(code)
      // Delivered: the digits leave this component's memory now.
      setDigits(Array.from({ length: CODE_LENGTH }, () => ''))
    } catch (failure) {
      setError(failure instanceof Error && failure.message !== '' ? failure.message : t('code.error'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (onCancel === undefined || busy) return
    setBusy(true)
    try {
      await onCancel()
    } catch (failure) {
      setError(failure instanceof Error && failure.message !== '' ? failure.message : t('code.error'))
    } finally {
      setBusy(false)
    }
  }

  const minutes = deadline?.state === 'soon' ? deadline.minutes : Math.max(1, Math.ceil((Date.parse(row.expiresAt) - nowMs) / 60_000))

  return (
    <Tag className={styles.row} data-code-request="pending">
      <Card as="article" tone="accent" padding="s" aria-label={eyebrow} className={styles.card} eyebrow={heading}>
        <p className={styles.deadline} data-deadline="soon">
          <UiIcon name="clock" size={14} />
          <span>{t('code.deadline', { n: minutes })}</span>
        </p>
        <p className={styles.reason}>{row.reason}</p>
        <form
          className={styles.form}
          onSubmit={(event) => { event.preventDefault(); void send() }}
          noValidate
        >
          <div className={styles.boxes} role="group" aria-label={t('code.group')}>
            {digits.map((digit, index) => (
              <input
                key={String(index)}
                ref={(element) => { boxes.current[index] = element }}
                className={styles.box}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={t('code.digit', { n: index + 1 })}
                value={digit}
                disabled={busy}
                onChange={(event) => {
                  const typed = digitsOf(event.target.value)
                  if (typed === '') { setAt(index, ''); return }
                  fillFrom(index, typed)
                }}
                onKeyDown={(event) => { onKeyDown(index, event) }}
                onPaste={(event) => { onPaste(index, event) }}
                onFocus={(event) => { event.target.select() }}
              />
            ))}
          </div>
          {error !== undefined && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            {onFill !== undefined && <Button type="submit" variant="primary" size="m" disabled={!complete || busy}>{t('code.send')}</Button>}
            {onCancel !== undefined && <Button type="button" variant="ghost" size="m" disabled={busy} onClick={() => { void cancel() }}>{t('code.cancel')}</Button>}
          </div>
        </form>
      </Card>
    </Tag>
  )
}
