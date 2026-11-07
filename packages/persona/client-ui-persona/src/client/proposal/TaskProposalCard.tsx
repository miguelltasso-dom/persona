/**
 * P1-9 · "Proposta de {persona}" no #geral (design/TASK-PROPOSAL-SPEC.md §2–4). Uma mensagem da persona com o cartão dentro: o eyebrow
 * "PROPOSTA DE {NOME}" com o ✦, a pergunta ("Posso retomar “Relatório de sexta”?"), o motivo numa linha e **Aceitar** · **Agora não**.
 * Duas ou três juntas viram "Propostas da equipe · {n}" (mensagem da Coordenação), uma linha por item.
 *
 * Depois de decidir o item vira uma LINHA (o estado vivo do host): "Aceita · virou a tarefa {título}" (o título abre a tarefa), "Deixei para
 * depois" + "Desfazer" por 6 s, ou "Esta proposta expirou."; falha = "Não consegui registrar agora. Tentar de novo" e o item segue aberto.
 *
 * Atrás de `persona.flag.taskProposal` (`proposal-flag.ts`). Nenhum controle morto: sem `onDecide` o cartão é só leitura; o "Desfazer" só
 * existe com `onUndo` e só nos 6 s depois de ESTA pessoa recusar.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, Card, UiIcon } from '../primitives/index.ts'
import {
  proposalView,
  UNDO_WINDOW_MS,
  type ProposalItemUi,
  type ProposalLiveUi,
  type ProposalLocal,
  type TaskProposalUi,
} from './task-proposal-model.ts'
import styles from './TaskProposalCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface TaskProposalCardProps {
  readonly t: ChatT
  readonly proposal: TaskProposalUi
  /** O estado vivo por id do item (`listTaskProposals`); item que o host ainda não listou conta como aberto. */
  readonly liveById?: Readonly<Record<string, ProposalLiveUi>> | undefined
  /** Quem assina a mensagem (a persona, ou a Coordenação no resumo) e o retrato dela. */
  readonly authorName: string
  readonly authorCharacterId?: string | undefined
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  /** Aceitar (`true`) ou "Agora não" (`false`); rejeita quando o host não registrou. Ausente = só leitura. */
  readonly onDecide?: ((itemId: string, accept: boolean) => Promise<void>) | undefined
  /** O Desfazer do "Agora não" (`reopenTaskProposal`); ausente = sem Desfazer. */
  readonly onUndo?: ((itemId: string) => Promise<void>) | undefined
  /** O título de "Aceita · virou a tarefa {título}" abre o cartão no quadro. */
  readonly onOpenTask?: ((ticketId: string) => void) | undefined
}

const TITLE_MARK = '\u0001title\u0001'
const IDLE: ProposalLocal = { phase: 'idle' }

function srcOf(characterId: string | undefined): string | undefined {
  return characterId === undefined ? undefined : AVATAR_96[characterId as keyof typeof AVATAR_96]
}

export function TaskProposalCard({ t, proposal, liveById, authorName, authorCharacterId, timeLabel, rowTag = 'li', onDecide, onUndo, onOpenTask }: TaskProposalCardProps): ReactNode {
  const Tag = rowTag
  const [locals, setLocals] = useState<Readonly<Record<string, ProposalLocal>>>({})
  const [undoable, setUndoable] = useState<ReadonlySet<string>>(new Set())
  const [announcement, setAnnouncement] = useState('')
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => { for (const timer of pending.values()) clearTimeout(timer); pending.clear() }
  }, [])

  const setLocal = (id: string, local: ProposalLocal): void => { setLocals(current => ({ ...current, [id]: local })) }
  const closeUndo = useCallback((id: string): void => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setUndoable((current) => { const next = new Set(current); next.delete(id); return next })
  }, [])

  const decide = async (item: ProposalItemUi, accept: boolean): Promise<void> => {
    if (onDecide === undefined) return
    setLocal(item.id, { phase: 'deciding', accept })
    try {
      await onDecide(item.id, accept)
      setLocal(item.id, { phase: 'done', accept })
      setAnnouncement(t(accept ? 'proposal.live.accepted' : 'proposal.live.declined', { question: item.question }))
      if (!accept && onUndo !== undefined) {
        setUndoable(current => new Set(current).add(item.id))
        timers.current.set(item.id, setTimeout(() => { closeUndo(item.id) }, UNDO_WINDOW_MS))
      }
    } catch {
      setLocal(item.id, { phase: 'failed', accept })
    }
  }

  const undo = async (item: ProposalItemUi): Promise<void> => {
    if (onUndo === undefined) return
    closeUndo(item.id)
    try {
      await onUndo(item.id)
      setLocal(item.id, IDLE)
    } catch {
      // o host não reabriu: a linha "Deixei para depois" fica como está, sem Desfazer
    }
  }

  const viewOf = (item: ProposalItemUi) => proposalView(liveById?.[item.id], locals[item.id] ?? IDLE)
  const views = proposal.items.map(viewOf)
  const allDecided = views.every(view => view === 'accepted' || view === 'declined' || view === 'expired')
  const digest = proposal.kind === 'digest'
  const first = proposal.items[0]

  const stateLine = (item: ProposalItemUi, view: 'accepted' | 'declined' | 'expired'): ReactNode => {
    const live = liveById?.[item.id]
    if (view === 'accepted') {
      const title = live?.ticketTitle
      if (title === undefined) {
        return (
          <p className={styles.stateLine} data-proposal-state="accepted">
            <span className={styles.stateIcon} aria-hidden="true"><UiIcon name="check" size={16} /></span>
            <span>{t('proposal.live.accepted', { question: item.question })}</span>
          </p>
        )
      }
      const [before = '', after = ''] = t('proposal.accepted', { title: TITLE_MARK }).split(TITLE_MARK)
      return (
        <p className={styles.stateLine} data-proposal-state="accepted">
          <span className={styles.stateIcon} aria-hidden="true"><UiIcon name="check" size={16} /></span>
          <span>
            {before}
            {onOpenTask !== undefined && live?.ticketId !== undefined
              ? <button type="button" className={styles.titleLink} onClick={() => { onOpenTask(live.ticketId ?? '') }}>{title}</button>
              : <strong>{title}</strong>}
            {after}
          </span>
        </p>
      )
    }
    if (view === 'declined') {
      return (
        <p className={`${styles.stateLine} ${styles.soft}`} data-proposal-state="declined">
          <span>{t('proposal.declined')}</span>
          {onUndo !== undefined && undoable.has(item.id) && (
            <Button size="s" variant="ghost" onClick={() => { void undo(item) }}>{t('proposal.undo')}</Button>
          )}
        </p>
      )
    }
    return <p className={`${styles.stateLine} ${styles.soft}`} data-proposal-state="expired">{t('proposal.expired')}</p>
  }

  const openItem = (item: ProposalItemUi, view: 'open' | 'deciding' | 'failed', withFace: boolean): ReactNode => {
    const deciding = view === 'deciding'
    const local = locals[item.id]
    return (
      <div className={styles.item} data-proposal-item={item.id}>
        {withFace && <Avatar name={item.personaName} src={srcOf(item.characterId)} shape="portrait" size={24} decorative />}
        <div className={styles.itemBody}>
          <p className={styles.question}>{item.question}</p>
          {item.reason !== '' && <p className={styles.reason}>{item.reason}</p>}
          {view === 'failed' && (
            <p className={styles.failed} role="status">
              {t('proposal.failed')}{' '}
              <button type="button" className={styles.retry} onClick={() => { void decide(item, local?.phase === 'failed' ? local.accept : true) }}>{t('proposal.retry')}</button>
            </p>
          )}
        </div>
        {onDecide !== undefined && (
          <div className={styles.actions}>
            <Button size="s" variant="primary" loading={deciding && local?.phase === 'deciding' && local.accept} disabled={deciding} onClick={() => { void decide(item, true) }}>{t('proposal.accept')}</Button>
            <Button size="s" variant="ghost" loading={deciding && local?.phase === 'deciding' && !local.accept} disabled={deciding} onClick={() => { void decide(item, false) }}>{t('proposal.decline')}</Button>
          </div>
        )}
      </div>
    )
  }

  const itemNode = (item: ProposalItemUi, index: number, withFace: boolean): ReactNode => {
    const view = views[index] ?? 'open'
    return view === 'accepted' || view === 'declined' || view === 'expired' ? stateLine(item, view) : openItem(item, view, withFace)
  }

  const author = digest ? authorName : (first?.personaName ?? authorName)
  const authorFace = digest ? authorCharacterId : (first?.characterId ?? authorCharacterId)

  let body: ReactNode
  if (allDecided) {
    // Tudo decidido: o cartão encolhe para as linhas de estado.
    body = (
      <div className={styles.states}>
        {proposal.items.map((item, index) => <div key={item.id}>{itemNode(item, index, false)}</div>)}
      </div>
    )
  } else if (!digest && first !== undefined) {
    body = (
      <Card
        as="section"
        tone="brand"
        padding="s"
        className={styles.card}
        aria-label={t('proposal.eyebrow', { name: author })}
        eyebrow={<span className={styles.eyebrow}><UiIcon name="sparkle" size={14} />{t('proposal.eyebrow', { name: author })}</span>}
      >
        {itemNode(first, 0, false)}
      </Card>
    )
  } else {
    body = (
      <Card
        as="section"
        tone="brand"
        padding="s"
        className={styles.card}
        aria-label={t('proposal.digestEyebrow', { count: proposal.items.length })}
        eyebrow={<span className={styles.eyebrow}><UiIcon name="sparkle" size={14} />{t('proposal.digestEyebrow', { count: proposal.items.length })}</span>}
      >
        <ul className={styles.list} role="list">
          {proposal.items.map((item, index) => (
            <li key={item.id} className={styles.listItem} role="listitem">{itemNode(item, index, true)}</li>
          ))}
        </ul>
      </Card>
    )
  }

  return (
    <Tag className={styles.row} data-task-proposal={proposal.kind}>
      <Avatar name={author} src={srcOf(authorFace)} shape="portrait" size={32} decorative />
      <div className={styles.main}>
        <div className={styles.who}>
          <b>{author}</b>
          {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> {timeLabel}</span>}
        </div>
        {body}
        <span className="persona-sr-only" role="status" aria-live="polite">{announcement}</span>
      </div>
    </Tag>
  )
}
