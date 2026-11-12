/**
 * D-084 / PERSONA-POWERS-SPEC §2 ("Age dentro de limites": faz e mostra): a linha do fio quando a persona agiu DIRETO fora do app —
 * "✉ {persona} enviou um email para ana@… · Encomenda de sexta". O "Desfazer · 18 s" só aparece quando o host diz que dá (`undoable` + prazo) e
 * NUNCA em email, post ou pagamento (não voltam: `mapActionEvent` já recusa). O prazo conta para trás e o botão some quando acaba.
 *
 * Atrás de `persona.flag.actionPreview` (quem monta decide). O Desfazer só existe com `onUndo` (nenhum botão morto).
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Modal, UiIcon } from '../primitives/index.ts'
import { ActionContent } from './ActionContent.tsx'
import type { ActionEventUi } from '../remote/map-host-ui.ts'
import styles from './ActionEventLine.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface ActionEventLineProps {
  readonly t: ChatT
  readonly event: ActionEventUi
  /** O nome de quem agiu (a autora da mensagem). */
  readonly personaName: string
  readonly rowTag?: 'li' | 'div'
  /** "Desfazer" (`undoPersonaAction({ activityId })`); sem ele não há botão. */
  readonly onUndo?: ((activityId: string) => void | Promise<void>) | undefined
  /** A hora da mensagem ("09:00"), para o carimbo "Enviado às 09:00" do "Ver". */
  readonly timeLabel?: string | undefined
  /** O personagem de quem agiu (o rosto 24 ao lado do título do "Ver", o mesmo do eyebrow da prévia). */
  readonly personaCharacterId?: string | undefined
  /** Relógio injetável (testes). */
  readonly now?: (() => number) | undefined
}

/** Os verbos do harness (HT-1) que a UI sabe escrever; um verbo desconhecido cai na frase de reserva, nunca num texto inventado. */
export const HARNESS_VERBS: ReadonlySet<string> = new Set([
  'board_card_move', 'board_card_create', 'board_card_delete', 'sprint_create', 'sprint_start', 'sprint_close',
  'routine_create', 'routine_pause', 'routine_edit', 'channel_create', 'channel_rename', 'memory_edit', 'persona_hire', 'sprint_plan',
  // COLHEITA 17: what the persona did in the browser (tool + site, never a value).
  'browser_click', 'browser_fill',
])

/** O tempo que resta do Desfazer, legível: < 60 s → "{n} s"; < 60 min → "{n} min"; >= 1 h → "{n} h" (sempre arredondando para cima). */
export function formatUndoLeft(t: ChatT, seconds: number): string {
  const left = Math.max(0, Math.ceil(seconds))
  if (left < 60) return t('action.unit.s', { n: left })
  if (left < 3600) return t('action.unit.min', { n: Math.ceil(left / 60) })
  return t('action.unit.h', { n: Math.ceil(left / 3600) })
}

/** A frase da linha, a partir dos campos (o host manda dados, não texto). Sem artigo antes do nome da persona. */
export function actionEventText(t: ChatT, event: ActionEventUi, name: string): string {
  const connector = event.connectorName
  switch (event.verb) {
    case 'email':
      return event.subject === undefined
        ? t('action.didSendNoSubject', { name, to: event.target })
        : t('action.didSend', { name, to: event.target, subject: event.subject })
    case 'post': return t('action.didPost', { name, connector })
    case 'pay': return t('action.didPay', { name, target: event.target, connector })
    case 'delete': return t('action.didDelete', { name, target: event.target, connector })
    default: {
      const verb = event.harnessVerb
      if (verb === 'board_card_move') {
        return event.after === undefined
          ? t('action.did.board_card_move.noAfter', { name, target: event.target })
          : t('action.did.board_card_move', { name, target: event.target, after: event.after })
      }
      if (verb !== undefined && HARNESS_VERBS.has(verb)) return t(`action.did.${verb}` as never, { name, target: event.target })
      return t('action.didFallback', { name, connector, target: event.target })
    }
  }
}

export function ActionEventLine({ t, event, personaName, rowTag = 'li', onUndo, timeLabel, personaCharacterId, now = Date.now }: ActionEventLineProps): ReactNode {
  const Tag = rowTag
  const until = event.undoUntilMs
  const [clock, setClock] = useState(() => now())
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [viewing, setViewing] = useState(false)
  const remaining = until === undefined ? 0 : Math.ceil((until - clock) / 1000)
  // COLHEITA 5: depois dos 5 min (ou de desfeito) a linha vira texto simples em tinta suave, sem link.
  const wasUndone = event.undone === true || undone
  const settled = wasUndone || (until !== undefined && remaining <= 0)

  // O prazo conta para trás de segundo em segundo e o efeito para quando acaba (ou sem Desfazer).
  useEffect(() => {
    if (until === undefined || onUndo === undefined || undone) return
    if (until - now() <= 0) return
    const timer = setInterval(() => {
      const current = now()
      setClock(current)
      if (until - current <= 0) clearInterval(timer)
    }, 1000)
    return () => { clearInterval(timer) }
  }, [until, onUndo, undone, now])

  // "Ver" (Muse): email/post/pagamento/apagar abrem o que SAIU, só leitura (o mesmo conteúdo da prévia + o carimbo da hora); sem o conteúdo, sem "Ver".
  const content = event.content
  const viewable = content !== undefined && (event.verb === 'email' || event.verb === 'post' || event.verb === 'pay' || event.verb === 'delete')
  const canUndo = until !== undefined && onUndo !== undefined && remaining > 0 && !undone
  const undo = (): void => {
    if (onUndo === undefined || undoing) return
    setUndoing(true)
    setFailed(false)
    // Só um Desfazer que o host aceitou vira "Desfeito"; se ele recusou (prazo, algo mudou) a linha diz que não deu.
    void Promise.resolve(onUndo(event.activityId)).then(() => { setUndone(true) }, () => { setFailed(true) }).finally(() => { setUndoing(false) })
  }

  return (
    <Tag className={styles.line} data-action-event={event.verb}>
      <span className={styles.icon} aria-hidden="true"><UiIcon name={event.verb === 'email' ? 'send' : 'check'} size={16} /></span>
      <span className={settled ? `${styles.text} ${styles.muted}` : styles.text}>{actionEventText(t, event, personaName)}</span>
      {wasUndone && <span className={`${styles.note} ${styles.muted}`}>{t('action.undone')}</span>}
      {failed && !wasUndone && <span className={styles.note} role="status">{t('action.undoFailed')}</span>}
      {viewable && (
        <button type="button" className={styles.undo} onClick={() => { setViewing(true) }}>{t('action.view')}</button>
      )}
      {canUndo && (
        <button type="button" className={styles.undo} disabled={undoing} onClick={undo}>
          {undoing ? t('action.undoing') : t('action.undoLeft', { left: formatUndoLeft(t, remaining) })}
        </button>
      )}
      {viewable && content !== undefined && (
        <Modal
          open={viewing}
          size="m"
          title={(
            <span className={styles.modalTitle}>
              <Avatar name={personaName} src={personaCharacterId === undefined ? undefined : AVATAR_96[personaCharacterId as keyof typeof AVATAR_96]} shape="portrait" size={24} decorative />
              <span>{t(`action.sentTitle.${event.verb}` as never, { name: personaName })}</span>
            </span>
          )}
          closeLabel={t('action.close')}
          onClose={() => { setViewing(false) }}
        >
          <ActionContent t={t} verb={event.verb} content={content} />
          {timeLabel !== undefined && timeLabel !== '' && <p className={styles.stamp}>{t(`action.stamp.${event.verb}` as never, { time: timeLabel })}</p>}
        </Modal>
      )}
    </Tag>
  )
}
