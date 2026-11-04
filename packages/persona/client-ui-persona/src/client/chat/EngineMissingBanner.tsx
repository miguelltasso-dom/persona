import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, UiIcon } from '../primitives/index.ts'
import type { EngineStatusUi } from '../remote/engine-status.ts'
import styles from './EngineMissingBanner.module.css'

export interface EngineMissingBannerProps extends PropsLocale<'persona.chat'> {
  readonly status: EngineStatusUi
  /** "Conectar uma IA": abre Conexões. */
  readonly onConnect?: (() => void) | undefined
  /** "Conferir de novo": força a checagem no host. */
  readonly onRecheck?: (() => void) | undefined
}

const REASON_KEY = {
  none_connected: 'engineBanner.body.noneConnected',
  login_required: 'engineBanner.body.loginRequired',
  quota_exhausted: 'engineBanner.body.quotaExhausted',
} as const

/** Quanto tempo o aviso "IA conectada, retomando…" fica visível. */
export const ENGINE_RESUMED_NOTICE_MS = 6_000

/**
 * FR-3 (V1-P0): faixa fixa acima do composer quando NENHUMA IA está pronta ("Falta uma IA para a equipe trabalhar").
 * Mensagens enviadas nesse estado ficam guardadas no host e retomam sozinhas quando a IA conecta; ao conectar, a faixa
 * vira um aviso curto "IA conectada — retomando N mensagens". Nunca aparece enquanto o host ainda está sondando.
 */
export function EngineMissingBanner({ t, status, onConnect, onRecheck }: EngineMissingBannerProps): ReactNode {
  const [resumed, setResumed] = useState<number | null>(null)
  const retainedRef = useRef(0)

  useEffect(() => {
    if (status.readiness === 'unavailable') {
      retainedRef.current = status.pending
      return undefined
    }
    if (status.readiness === 'ready' && retainedRef.current > 0) {
      setResumed(retainedRef.current)
      retainedRef.current = 0
      const timer = setTimeout(() => { setResumed(null) }, ENGINE_RESUMED_NOTICE_MS)
      return () => { clearTimeout(timer) }
    }
    return undefined
  }, [status])

  if (status.readiness === 'unavailable') {
    const body = t(REASON_KEY[status.reason ?? 'none_connected'])
    return (
      <section className={styles.banner} data-tone="warning" role="status" aria-label={t('engineBanner.title')}>
        <span className={styles.icon} aria-hidden="true"><UiIcon name="alert" size={18} strokeWidth={2.2} /></span>
        <div className={styles.text}>
          <p className={styles.title}>{t('engineBanner.title')}</p>
          <p className={styles.body}>{body}</p>
          {status.pending > 0 && (
            <p className={styles.retained}>{t('engineBanner.retained', { count: status.pending })}</p>
          )}
        </div>
        <div className={styles.actions}>
          {onConnect !== undefined && (
            <Button variant="primary" size="s" onClick={onConnect}>{t('engineBanner.connect')}</Button>
          )}
          {onRecheck !== undefined && (
            <Button variant="ghost" size="s" onClick={onRecheck}>{t('engineBanner.recheck')}</Button>
          )}
        </div>
      </section>
    )
  }

  if (resumed !== null) {
    return (
      <section className={styles.banner} data-tone="success" role="status" aria-label={t('engineBanner.resumed', { count: resumed })}>
        <span className={styles.icon} aria-hidden="true"><UiIcon name="check" size={18} strokeWidth={2.4} /></span>
        <div className={styles.text}>
          <p className={styles.title}>{t('engineBanner.resumed', { count: resumed })}</p>
        </div>
      </section>
    )
  }

  return null
}
