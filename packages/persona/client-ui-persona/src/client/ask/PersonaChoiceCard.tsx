/**
 * Colheita item 11 · o cartão de escolha do fim da vez (variante `fimDoTurno` do cartão de pergunta, IV-10; spec: design/COLHEITA-MUSE.md §11).
 *
 * A persona termina a vez oferecendo de 2 a 6 caminhos. Ninguém espera por este cartão: o estado dela volta a Disponível. Cada opção é uma
 * linha-botão de 40 px com a letra A a F num círculo de 24 px; o toque manda a escolha (o host posta a mensagem curta `✓ B · …` da pessoa e
 * ela abre o turno novo). Depois do toque a escolhida fica âmbar com ✓ (o traço desenha), as outras vão a 50% e o cartão fica só leitura.
 *
 * Teclado: o cartão é um `radiogroup`; as setas movem o foco, Enter/Espaço confirmam a opção focada e as teclas A a F escolhem direto
 * quando o foco está dentro do cartão. Atrás de `persona.flag.personaAsk` (a mesma do cartão de pergunta); sem `onAnswer` é só leitura.
 * Falha de envio: "Não enviado · Tentar de novo" (o padrão do P0-30).
 */

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar } from '../primitives/index.ts'
import type { PersonaAskLiveUi, PersonaAskUi } from './persona-ask-model.ts'
import styles from './PersonaChoiceCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface PersonaChoiceCardProps {
  readonly t: ChatT
  readonly ask: PersonaAskUi
  /** O estado vivo do host (`listPersonaAsks`); ausente = aberta. */
  readonly live?: PersonaAskLiveUi | undefined
  readonly characterId?: string | undefined
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  /**
   * `true` quando a mensagem da persona (as palavras antes do cartão) já mostra quem fala: o cartão entra logo abaixo dela, alinhado ao
   * texto, sem repetir o rosto e o nome.
   */
  readonly continued?: boolean
  /** Manda a escolha ao host; rejeita quando o host não a aceitou. Ausente = só leitura (sem controle morto). */
  readonly onAnswer?: ((ask: PersonaAskUi, optionIds: readonly string[]) => Promise<void>) | undefined
}

type Phase = 'idle' | 'sending' | 'failed'

/** A letra de cada opção, na ordem (A a F). */
export function letterOf(index: number): string {
  return String.fromCharCode(65 + index)
}

function clockOf(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? undefined : at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function PersonaChoiceCard({ t, ask, live, characterId, timeLabel, rowTag = 'li', continued = false, onAnswer }: PersonaChoiceCardProps): ReactNode {
  const Tag = rowTag
  const questionId = useId()
  const [sent, setSent] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState<string | undefined>(undefined)
  const [phase, setPhase] = useState<Phase>('idle')
  const [focusId, setFocusId] = useState<string | undefined>(undefined)
  /** Só o toque desta sessão desenha o ✓; um cartão que já chegou respondido aparece pronto. */
  const [justChosen, setJustChosen] = useState(false)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())

  const answered = live?.status === 'answered' || (sent !== undefined && phase === 'idle')
  const interactive = onAnswer !== undefined && !answered
  const chosenId = answered
    ? (live?.status === 'answered' ? live.optionIds[0] : sent)
    : phase === 'sending' || phase === 'failed' ? attempt : undefined
  const chosenIndex = chosenId === undefined ? -1 : ask.options.findIndex(option => option.id === chosenId)

  const send = useCallback(async (id: string): Promise<void> => {
    if (onAnswer === undefined) return
    setAttempt(id)
    setPhase('sending')
    try {
      await onAnswer(ask, [id])
      setSent(id)
      setJustChosen(true)
      setPhase('idle')
    } catch {
      setPhase('failed')
    }
  }, [ask, onAnswer])

  const focusOption = (id: string | undefined): void => {
    if (id === undefined) return
    setFocusId(id)
    buttonRefs.current.get(id)?.focus()
  }

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const ids = ask.options.map(option => option.id)
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % ids.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + ids.length) % ids.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ids.length - 1
    else return
    event.preventDefault()
    focusOption(ids[next])
  }

  /** As teclas A a F escolhem direto quando o foco está dentro do cartão (sem Ctrl, Alt ou Meta). */
  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!interactive || phase === 'sending' || event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return
    const index = event.key.toUpperCase().charCodeAt(0) - 65
    const option = ask.options[index]
    if (index < 0 || option === undefined) return
    event.preventDefault()
    void send(option.id)
  }

  const face = characterId ?? ask.characterId
  const src = face === undefined ? undefined : AVATAR_96[face as keyof typeof AVATAR_96]
  const rovingId = focusId ?? chosenId ?? ask.options[0]?.id
  const firstLetter = letterOf(0)
  const lastLetter = letterOf(Math.max(ask.options.length - 1, 0))
  const doneTime = clockOf(live?.answeredAt)
  const footer = answered
    ? (chosenIndex < 0
      ? ''
      : doneTime === undefined
        ? t('askEnd.footDoneNoTime', { letter: letterOf(chosenIndex) })
        : t('askEnd.footDone', { letter: letterOf(chosenIndex), time: doneTime }))
    : t('askEnd.footOpen', { name: ask.personaName })

  return (
    <Tag className={`${styles.row} ${continued ? styles.continued : ''}`} data-persona-ask={ask.askId} data-persona-ask-kind="fimDoTurno" data-persona-ask-state={answered ? 'answered' : 'open'}>
      {continued
        ? <span className={styles.gutter} aria-hidden="true" />
        : <Avatar name={ask.personaName} src={src} shape="portrait" size={32} decorative />}
      <div className={styles.main}>
        {!continued && (
          <div className={styles.who}>
            <b>{ask.personaName}</b>
            {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> {timeLabel}</span>}
          </div>
        )}
        <section
          className={`${styles.card} ${answered ? styles.done : ''}`}
          aria-label={t('askEnd.group', { name: ask.personaName })}
          onKeyDown={onCardKeyDown}
        >
          <span className={styles.eyebrow}>{t('askEnd.eyebrow')}</span>
          <p className={styles.question} id={questionId}>{ask.question}</p>
          <div
            className={styles.options}
            role="radiogroup"
            aria-labelledby={questionId}
            aria-busy={phase === 'sending' ? true : undefined}
            aria-disabled={interactive ? undefined : true}
          >
            {ask.options.map((option, index) => {
              const isChosen = index === chosenIndex
              const letter = letterOf(index)
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  aria-disabled={interactive ? undefined : true}
                  className={`${styles.option} ${isChosen ? styles.picked : ''} ${answered && !isChosen ? styles.muted : ''} ${interactive ? '' : styles.readonly}`}
                  data-letter={letter}
                  data-chosen={isChosen ? 'true' : undefined}
                  data-fresh={isChosen && justChosen ? 'true' : undefined}
                  disabled={phase === 'sending'}
                  tabIndex={interactive && option.id === rovingId ? 0 : -1}
                  ref={(node) => {
                    if (node === null) buttonRefs.current.delete(option.id)
                    else buttonRefs.current.set(option.id, node)
                  }}
                  onFocus={() => { setFocusId(option.id) }}
                  onKeyDown={(event) => { onOptionKeyDown(event, index) }}
                  onClick={() => { if (interactive && phase !== 'sending') void send(option.id) }}
                >
                  <span className={styles.letter} aria-hidden="true">{letter}</span>
                  <span className="persona-sr-only">{t('askEnd.option', { letter })} </span>
                  <span className={styles.text}>{option.label}</span>
                  {isChosen && (
                    <svg className={styles.check} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d="M3 8.5 6.5 12 13 4.5" pathLength="1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          {interactive && <p className={styles.hint}>{t('ask.orWrite')}</p>}
          {phase === 'failed' && interactive && attempt !== undefined && (
            <p className={styles.failed} role="status">
              {t('message.notSent')} · <button type="button" className={styles.retry} onClick={() => { void send(attempt) }}>{t('runError.action.retry')}</button>
            </p>
          )}
          {footer !== '' && (
            <p className={styles.foot} data-phase={answered ? 'answered' : 'open'}>
              {footer}
              {interactive && ask.options.length > 1 && <span className="persona-sr-only"> {t('askEnd.keys', { first: firstLetter, last: lastLetter })}</span>}
            </p>
          )}
        </section>
      </div>
    </Tag>
  )
}
