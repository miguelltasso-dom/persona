/**
 * HT-3 (contracts/harness-tools.md §8, PERSONA-POWERS-SPEC §4): a linha de evento que o host escreve quando a PESSOA move um cartão para
 * "Fazendo". `started` = "{persona} começou “{tarefa}” porque você moveu para Fazendo"; `held` = o porquê de não ter começado, com a
 * ação que resolve (Retomar · Revisar mudanças · Escolher responsável). O host manda campos; as palavras são daqui.
 *
 * Só aparece quando o host manda `MessageView.harness` (o host liga isso por `startOnBoardMove`, desligado por padrão): sem a mensagem,
 * nada muda no fio. Nenhuma ação sem destino: cada botão só existe quando o chamador entrega o que ele faz.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, UiIcon } from '../primitives/index.ts'
import type { HarnessLineUi } from '../remote/map-host-ui.ts'
import styles from './HarnessEventLine.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface HarnessEventLineProps {
  readonly t: ChatT
  readonly line: HarnessLineUi
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  /** "Ver tarefa", "Revisar mudanças" e "Escolher responsável" abrem a tarefa no quadro (é onde se aplica, descarta e escolhe a dona). */
  readonly onOpenTask?: ((ticketId: string) => void) | undefined
  /** "Retomar {persona}" (persona em pausa). */
  readonly onResumePersona?: ((personaId: string) => void | Promise<void>) | undefined
}

/** O texto da linha, sem marcação (também usado pelos testes e pelo rótulo do botão). */
export function harnessLineText(t: ChatT, line: HarnessLineUi): string {
  const name = line.personaName ?? t('harness.somePersona')
  const task = line.title
  if (line.outcome === 'started') return t('harness.started', { name, task })
  switch (line.reason) {
    case 'paused': return t('harness.held.paused', { name, task })
    case 'silence':
      return line.until === undefined
        ? t('harness.held.silence', { name, task })
        : t('harness.held.silenceUntil', { name, task, time: line.until })
    case 'delivery_pending': return t('harness.held.deliveryPending', { name, task })
    case 'no_owner': return t('harness.held.noOwner', { name, task })
    default: return t('harness.held.noOwner', { name, task })
  }
}

export function HarnessEventLine({ t, line, timeLabel, rowTag = 'li', onOpenTask, onResumePersona }: HarnessEventLineProps): ReactNode {
  const [resuming, setResuming] = useState(false)
  const Tag = rowTag
  const held = line.outcome === 'held'
  const name = line.personaName ?? t('harness.somePersona')
  const canResume = held && line.reason === 'paused' && line.personaId !== undefined && onResumePersona !== undefined
  const heldAction = held && line.reason === 'delivery_pending'
    ? t('harness.action.review')
    : held && line.reason === 'no_owner' ? t('harness.action.chooseOwner') : undefined
  const src = line.characterId === undefined ? undefined : AVATAR_96[line.characterId as keyof typeof AVATAR_96]
  const resume = (): void => {
    if (line.personaId === undefined || onResumePersona === undefined || resuming) return
    setResuming(true)
    void Promise.resolve(onResumePersona(line.personaId)).finally(() => { setResuming(false) })
  }
  return (
    <Tag className={styles.line} data-harness-line={line.outcome} {...(held && line.reason !== undefined ? { 'data-harness-reason': line.reason } : {})}>
      {line.personaName !== undefined && <Avatar name={name} src={src} shape="portrait" size={24} decorative />}
      {/* "Esperando" (Muse): o relógio pequeno ao lado do rosto, nas quatro; o "começou" leva o check. Nada aqui é erro: a barra é neutra. */}
      {(line.personaName === undefined || held) && (
        <span className={line.personaName === undefined ? styles.icon : styles.clock} aria-hidden="true"><UiIcon name={held ? 'clock' : 'check'} size={line.personaName === undefined ? 16 : 14} /></span>
      )}
      <div className={styles.body}>
        <p className={styles.text}>
          {harnessLineText(t, line)}
          {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> · {timeLabel}</span>}
        </p>
        <div className={styles.actions}>
          {canResume && (
            <button type="button" className={styles.action} disabled={resuming} onClick={resume}>
              {t('harness.action.resume', { name })}
            </button>
          )}
          {heldAction !== undefined && onOpenTask !== undefined && (
            <button type="button" className={styles.action} onClick={() => { onOpenTask(line.ticketId) }}>{heldAction}</button>
          )}
          {heldAction === undefined && onOpenTask !== undefined && (
            <button type="button" className={styles.action} onClick={() => { onOpenTask(line.ticketId) }}>
              {t('harness.action.openTask')}
            </button>
          )}
        </div>
      </div>
    </Tag>
  )
}
