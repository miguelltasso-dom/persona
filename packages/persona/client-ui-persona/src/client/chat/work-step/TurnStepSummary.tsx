/**
 * COLHEITA §6 (Quill) · o resumo recolhido: uma linha de 32 px acima da mensagem final da persona.
 * Recolhida: ✓ "6 passos · 2 min" ▾ (ou ⚠ com "1 não deu certo"). Aberta: a lista dos passos, com a frase e a hora de cada um,
 * e "Detalhes técnicos" dobrado por passo (caminho e comando só ali). Sem passos ou com passo em andamento: nada.
 */
import { useId, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { UiIcon } from '../../primitives/index.ts'
import { stepClock, summarizeTurnSteps, turnSummaryLabel, type StepItem, type TurnSummaryLabels } from './turn-step-summary-model.ts'
import styles from './TurnStepSummary.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface TurnStepSummaryProps {
  readonly t: ChatT
  readonly items: readonly StepItem[]
  /** Passos que o host não listou (`moreCount` do grupo). */
  readonly moreCount?: number | undefined
}

export function TurnStepSummary({ t, items, moreCount = 0 }: TurnStepSummaryProps): ReactNode {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const summary = summarizeTurnSteps(items, moreCount)
  if (summary === null) return null
  const labels: TurnSummaryLabels = {
    count: n => (n === 1 ? t('workStep.count.one') : t('workStep.count', { count: n })),
    failed: n => (n === 1 ? t('workStep.failed.one') : t('workStep.failed', { count: n })),
    minutes: n => t('workStep.minutes', { n }),
    seconds: n => t('workStep.seconds', { n }),
  }
  const phrase = (item: StepItem): string => {
    switch (item.kind) {
      case 'command': return t('workStep.kind.command')
      case 'file': return t('workStep.kind.file')
      case 'hire': return t('workStep.kind.hire')
      case 'message': return t('workStep.kind.message')
      case 'read': return t('workStep.kind.read')
      case 'check': return t('workStep.kind.check')
    }
  }
  const failedAny = summary.failed > 0
  return (
    <div className={styles.summary} data-turn-summary="" data-failed={failedAny ? '' : undefined}>
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={styles.icon} aria-hidden="true">
          <UiIcon name={failedAny ? 'alert' : 'check'} size={16} strokeWidth={2.6} />
        </span>
        <span className={styles.label}>{turnSummaryLabel(summary, labels)}</span>
        <UiIcon name="chevronDown" size={16} strokeWidth={2.4} className={styles.chevron} />
      </button>
      <div id={listId} className={styles.panel} data-open={open ? '' : undefined}>
        <div className={styles.panelInner}>
          <ol className={styles.list}>
            {items.map(item => (
              <li key={item.id} className={styles.step} data-status={item.status}>
                <span className={styles.stepText}>
                  {phrase(item)}
                  {item.status === 'failed' ? ` · ${t('workStep.failedStep')}` : ''}
                </span>
                {stepClock(item.at) !== undefined && <time className={styles.time}>{stepClock(item.at)}</time>}
                <details className={styles.details}>
                  <summary className={styles.detailsSummary}>{t('workStep.details')}</summary>
                  <code className={styles.code}>{item.title}</code>
                </details>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
