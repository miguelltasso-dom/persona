/**
 * CV-8 (CONVERSAS-SPEC §A): the chip above the composer when the next message goes to "Toda a equipe".
 * - "Toda a equipe · {n} respostas · ≈ {c} chamadas da sua IA" — the calls ONLY when the host measured them; without, just the replies.
 * - With more than 5 personas the Send of the composer asks once, inline in this same chip: "Enviar para as {n}? · Enviar · Só quem
 *   tiver algo a dizer" (the person decides; nothing is sent by surprise).
 * "Quem tiver algo a dizer" shows no chip (1 + at most 5 calls: no surprise to warn about). The composer owns the choice; this is a
 * pure component: it draws what it is given and calls what it is given.
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '../../primitives/index.ts'
import { Tooltip } from '../../primitives/index.ts'
import { usageNotice, usageSuffix, usageWindowLabel, usedShortText, usedTone } from '../quota-text.ts'
import { fanoutCallsLabel, fanoutText, type FanoutChoice, type FanoutEstimateUi } from './fanout-rules.ts'
import styles from './Fanout.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface FanoutChipProps {
  readonly t: ChatT
  /** The choice for the NEXT message only (the composer resets it after sending). */
  readonly choice: FanoutChoice | undefined
  /** "Toda a equipe ({n})": the personas that will answer. */
  readonly teamCount: number
  /** The host's measured numbers; absent = say only what is certain. */
  readonly estimate?: FanoutEstimateUi | undefined
  /** The first click on Send opened the question: the chip asks inline. */
  readonly confirming?: boolean
  /** "Enviar" of the question: sends to the whole team. */
  readonly onConfirm?: (() => void) | undefined
  /** "Só quem tiver algo a dizer": switches the choice to `relevant` and sends. */
  readonly onRelevantOnly?: (() => void) | undefined
}

export function FanoutChip({ t, choice, teamCount, estimate, confirming = false, onConfirm, onRelevantOnly }: FanoutChipProps): ReactNode {
  if (choice !== 'everyone') return null
  const count = estimate?.replies ?? teamCount
  // D-092: assinatura = chamadas + "cerca de {pct}% da janela" (a % só quando o host manda); chave de API = "≈ US$ x–y" no lugar das chamadas; nunca dólar sem a certeza da conta.
  const api = estimate?.usage?.billing === 'api'
  // Sem a % do pedido mas com o uso oficial da janela: "≈ 4 chamadas · 42% da janela já usada" (as chamadas vão DENTRO da frase); sem nada: "≈ 4 chamadas da sua IA".
  const used = api || estimate?.calls === undefined ? undefined : usedShortText(t, estimate?.usage, fanoutCallsLabel(estimate.calls))
  const usage = usageSuffix(t, estimate?.usage) ?? used
  const lead = estimate?.calls === undefined || api || used !== undefined
    ? fanoutText(t, 'fanout.chip', 'Toda a equipe · {count} respostas', { count })
    : fanoutText(t, 'fanout.chipCost', 'Toda a equipe · {count} respostas · ≈ {calls} chamadas da sua IA', { count, calls: fanoutCallsLabel(estimate.calls) })
  const tone = usedTone(estimate?.usage)
  const windowLabel = usageWindowLabel(t, estimate?.usage)
  const notice = usageNotice(t, estimate?.usage)
  // O nome da janela mora no tooltip do trecho da %; o texto visível é o mesmo.
  const line: ReactNode = usage === undefined
    ? lead
    : (
      <>
        {lead}
        {' · '}
        {windowLabel === undefined
          ? usage
          : <Tooltip content={windowLabel}><span className={styles.chipUsage} tabIndex={0} data-quota-window="">{usage}</span></Tooltip>}
        {notice === undefined ? null : <span data-quota-notice=""> · {notice}</span>}
      </>
    )
  if (!confirming) {
    return (
      <div className={styles.chip} role="status" data-fanout-chip="" {...(tone === undefined ? {} : { 'data-tone': tone })}>
        <span className={styles.chipText}>{line}</span>
      </div>
    )
  }
  return (
    <div className={styles.chip} role="group" aria-label={fanoutText(t, 'fanout.confirmLabel', 'Confirmar o envio para toda a equipe')} data-fanout-chip="confirm" {...(tone === undefined ? {} : { 'data-tone': tone })}>
      <span className={styles.chipText}>
        <strong>{fanoutText(t, 'fanout.confirm', 'Enviar para as {count}?', { count })}</strong>
        <span className={styles.chipDetail}>{line}</span>
      </span>
      <span className={styles.chipActions}>
        {onConfirm !== undefined && (
          <Button size="s" variant="primary" onClick={onConfirm}>{fanoutText(t, 'fanout.confirmSend', 'Enviar')}</Button>
        )}
        {onRelevantOnly !== undefined && (
          <Button size="s" variant="secondary" onClick={onRelevantOnly}>{fanoutText(t, 'fanout.confirmRelevant', 'Só quem tiver algo a dizer')}</Button>
        )}
      </span>
    </div>
  )
}
