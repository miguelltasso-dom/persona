/**
 * "No limite até {hora}" (ACCOUNT-SWAP-SPEC §3, P0-19): faixa acima do composer, na mesma posição da faixa "Falta uma IA".
 * O composer NUNCA desabilita no limite: as mensagens entram na fila e saem sozinhas quando a cota voltar. A hora vem do
 * host; sem hora, "No limite por enquanto" (nunca uma hora inventada).
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Button } from '../primitives/index.ts'
import styles from './LimitBanner.module.css'

export interface LimitBannerProps extends PropsLocale<'persona.chat'> {
  /** Quando a cota volta ("18:30" ou "amanhã 09:00"), já formatado pelo host/cliente; `undefined` = o host não disse. */
  readonly until?: string | undefined
  /** "Ver uso e limites". */
  readonly onSeeUsage?: (() => void) | undefined
  /** Outro motor conectado: "Usar {motor} enquanto isso". */
  readonly otherEngine?: { readonly name: string; readonly onUse: () => void } | undefined
}

export function LimitBanner({ t, until, onSeeUsage, otherEngine }: LimitBannerProps): ReactNode {
  const hasUntil = until !== undefined && until.length > 0
  const message = hasUntil ? t('limit.banner', { until }) : t('limit.bannerNoTime')
  return (
    <section className={styles.banner} data-tone="warning" role="status" aria-label={message} data-persona-limit-banner="">
      <img className={styles.spot} src={ILLUSTRATIONS['spot-limite']} alt="" width={48} height={48} />
      <p className={styles.text}>{message}</p>
      <div className={styles.actions}>
        {onSeeUsage !== undefined && (
          <button type="button" className={styles.link} onClick={onSeeUsage}>{t('limit.seeUsage')}</button>
        )}
        {otherEngine !== undefined && (
          <Button variant="secondary" size="s" onClick={otherEngine.onUse}>
            {t('limit.useOther', { engine: otherEngine.name })}
          </Button>
        )}
      </div>
    </section>
  )
}
