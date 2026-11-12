/**
 * COLHEITA §6 (Quill) · "Bia · Trabalhando" embaixo do balão "digitando", depois de 5 s de trabalho.
 * Monta junto com o indicador de digitação (quando ele existe) e some quando o turno termina (o pai desmonta).
 * Sem `aria-live` aqui: a spec põe a região ao vivo só na faixa da equipe, e não em cada fio.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChannelPersonaMember } from '../../team/persona-work-state.ts'
import { WORK_STEP_DELAY_MS, decideSwap, workStepText } from './work-step-model.ts'
import styles from './WorkStepLine.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface WorkStepLineProps {
  readonly t: ChatT
  readonly member: ChannelPersonaMember
  /** A frase simples do passo, quando o host manda (Flint, `busy-status`). Sem ela a linha diz "Trabalhando". */
  readonly step?: string | undefined
}

export function WorkStepLine({ t, member, step }: WorkStepLineProps): ReactNode {
  const target = workStepText({
    name: member.name,
    step: step ?? member.step,
    labels: { line: (name, text) => t('workStep.line', { name, text }), working: t('workStep.working') },
  })
  const [visible, setVisible] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const lastSwap = useRef<number | null>(null)

  // Os 5 s começam quando a linha monta (o indicador de digitação acabou de aparecer).
  useEffect(() => {
    const timer = window.setTimeout(() => { setVisible(true) }, WORK_STEP_DELAY_MS)
    return () => { window.clearTimeout(timer) }
  }, [])

  // Troca de texto: no máximo uma a cada 2 s. Se o alvo muda antes da hora, o timer antigo é cancelado e o novo decide.
  useEffect(() => {
    if (!visible) return undefined
    const decision = decideSwap({ shown: shown ?? '', target, lastSwapAt: lastSwap.current, now: Date.now() })
    if (decision.kind === 'hold') return undefined
    if (decision.kind === 'swap') {
      lastSwap.current = Date.now()
      setShown(target)
      return undefined
    }
    const timer = window.setTimeout(() => {
      lastSwap.current = Date.now()
      setShown(target)
    }, decision.ms)
    return () => { window.clearTimeout(timer) }
  }, [visible, target, shown])

  if (!visible || shown === null) return null
  return (
    <div className={styles.line} data-work-step="">
      {/* A chave é o texto: cada troca remonta o trecho e o crossfade (4 px, --motion-fast) roda de novo. */}
      <span key={shown} className={styles.text}>{shown}</span>
    </div>
  )
}
