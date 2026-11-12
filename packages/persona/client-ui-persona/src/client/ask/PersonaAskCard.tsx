/**
 * IV-10 · a pergunta estruturada da persona no fio (Colheita A(1); contracts/structured-question.md).
 *
 * Um cartão-sticker dentro da mensagem da persona: "Pergunta {i} de {n}", a pergunta, os CHIPS (escolha única: o toque responde;
 * várias: os chips marcam com ✓ e "Enviar {k}" envia) e, sempre, "ou escreva do seu jeito na caixa abaixo". Depois de respondida o
 * cartão perde a sombra, o chip escolhido fica âmbar com ✓, os outros esmaecem e aparece o "Respondida": só leitura.
 *
 * Teclado: os chips são um `radiogroup` (única) ou `checkbox`es (várias); as setas movem o foco, o Espaço/Enter escolhe.
 * Atrás de `persona.flag.personaAsk` (`ask-flag.ts`); sem ela este cartão nem é montado e o fio mostra a frase simples do host.
 * Nenhum controle morto: sem `onAnswer` o cartão é só leitura. Falha de envio: "Não enviado · Tentar de novo" (o padrão do P0-30).
 */

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Chip, UiIcon } from '../primitives/index.ts'
import { knownChoices, toggleOption, type PersonaAskLiveUi, type PersonaAskUi } from './persona-ask-model.ts'
import styles from './PersonaAskCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface PersonaAskCardProps {
  readonly t: ChatT
  readonly ask: PersonaAskUi
  /** O estado vivo do host (`listPersonaAsks`); ausente = aberta. */
  readonly live?: PersonaAskLiveUi | undefined
  /** O retrato da persona (o `characterId` do elenco); sem ele o avatar cai nas iniciais. */
  readonly characterId?: string | undefined
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  /** Manda a escolha ao host; rejeita quando o host não a aceitou. Ausente = só leitura (sem controle morto). */
  readonly onAnswer?: ((ask: PersonaAskUi, optionIds: readonly string[]) => Promise<void>) | undefined
}

type Phase = 'idle' | 'sending' | 'failed'

/** Os ids dos dois botões do cartão "Continuar" do host (persona-host/src/continue-card.ts): o primeiro retoma, o segundo só encerra. */
const CONTINUE_OPTION_ID = 'continuar'
const STOP_OPTION_ID = 'parar'

/** O cartão "Continuar" (item 7): exatamente estes dois botões. Ele ganha hierarquia: "Continuar" é a ação principal. */
export function isContinueCard(ask: PersonaAskUi): boolean {
  const ids = ask.options.map(option => option.id)
  return ids.length === 2 && ids.includes(CONTINUE_OPTION_ID) && ids.includes(STOP_OPTION_ID)
}

/** O cartão só existe quando há chips para tocar: pergunta só em palavras segue a mensagem de sempre (o composer responde). */
export function hasAskChips(ask: PersonaAskUi): boolean {
  return ask.options.length >= 2
}

export function PersonaAskCard({ t, ask, live, characterId, timeLabel, rowTag = 'li', onAnswer }: PersonaAskCardProps): ReactNode {
  const Tag = rowTag
  const questionId = useId()
  const [picked, setPicked] = useState<readonly string[]>([])
  const [attempt, setAttempt] = useState<readonly string[]>([])
  const [sent, setSent] = useState<readonly string[] | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [focusId, setFocusId] = useState<string | undefined>(undefined)
  const chipRefs = useRef(new Map<string, HTMLButtonElement>())

  const status = live?.status ?? 'open'
  const answered = status === 'answered' || (sent !== null && phase === 'idle')
  const cancelled = status === 'cancelled' && !answered
  const interactive = onAnswer !== undefined && !answered && !cancelled
  const chosen = answered
    ? knownChoices(ask.options, status === 'answered' && live !== undefined ? live.optionIds : sent ?? [])
    : phase === 'sending' || phase === 'failed' ? attempt : picked
  const chosenSet = new Set(chosen)

  const send = useCallback(async (ids: readonly string[]): Promise<void> => {
    if (onAnswer === undefined || ids.length === 0) return
    setAttempt(ids)
    setPhase('sending')
    try {
      await onAnswer(ask, ids)
      setSent(ids)
      setPhase('idle')
    } catch {
      setPhase('failed')
    }
  }, [ask, onAnswer])

  const choose = (id: string): void => {
    if (!interactive || phase === 'sending') return
    if (!ask.multiple) {
      void send([id])
      return
    }
    setPhase('idle')
    setPicked(current => toggleOption(ask.options, current, id, true))
  }

  const moveFocus = (from: string, key: string): void => {
    const ids = ask.options.map(option => option.id)
    const at = ids.indexOf(from)
    if (at < 0) return
    let next = at
    if (key === 'ArrowRight' || key === 'ArrowDown') next = (at + 1) % ids.length
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (at - 1 + ids.length) % ids.length
    else if (key === 'Home') next = 0
    else if (key === 'End') next = ids.length - 1
    else return
    const target = ids[next]
    if (target === undefined) return
    setFocusId(target)
    chipRefs.current.get(target)?.focus()
  }

  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string): void => {
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      moveFocus(id, event.key)
    }
  }

  const eyebrow = ask.step === undefined
    ? t('ask.eyebrow')
    : t('ask.step', { index: ask.step.index, total: ask.step.total })
  const face = characterId ?? ask.characterId
  const src = face === undefined ? undefined : AVATAR_96[face as keyof typeof AVATAR_96]
  const rovingId = focusId ?? chosen[0] ?? ask.options[0]?.id
  const groupRole = ask.multiple ? 'group' : 'radiogroup'
  const itemRole = ask.multiple ? 'checkbox' : 'radio'
  const nothingChosen = chosen.length === 0

  return (
    <Tag className={styles.row} data-persona-ask={ask.askId} data-persona-ask-state={cancelled ? 'cancelled' : answered ? 'answered' : 'open'}>
      <Avatar name={ask.personaName} src={src} shape="portrait" size={32} decorative className={styles.face} />
      <div className={styles.main}>
        <div className={styles.who}>
          <b>{ask.personaName}</b>
          {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> {timeLabel}</span>}
        </div>
        <section
          className={`${styles.card} ${answered || cancelled ? styles.done : ''}`}
          aria-label={t('ask.group', { name: ask.personaName })}
          data-variant={isContinueCard(ask) ? 'continue' : undefined}
        >
          <div className={styles.head}>
            <span className={styles.eyebrow}>
              {eyebrow}{ask.multiple && !answered ? ` · ${t('ask.multipleHint')}` : ''}
            </span>
            {answered && (
              <Chip tone="success" size="s" icon={<UiIcon name="check" size={12} />}>{t('ask.answered')}</Chip>
            )}
          </div>
          <p className={styles.question} id={questionId}>{ask.question}</p>
          {cancelled
            ? <p className={styles.note}>{t('ask.cancelled')}</p>
            : answered || !interactive
              ? (
                <ul className={styles.chips} aria-labelledby={questionId}>
                  {ask.options.map((option) => {
                    const isChosen = chosenSet.has(option.id)
                    return (
                      <li key={option.id} className={`${styles.chip} ${isChosen ? styles.picked : ''} ${answered && !isChosen ? styles.muted : ''}`} data-chosen={isChosen ? 'true' : undefined}>
                        {isChosen && <UiIcon name="check" size={14} />}
                        {option.label}
                        {isChosen && <span className="persona-sr-only"> ({t('ask.chosen')})</span>}
                      </li>
                    )
                  })}
                </ul>
              )
              : (
                <div className={styles.chips} role={groupRole} aria-labelledby={questionId} aria-busy={phase === 'sending' ? true : undefined}>
                  {ask.options.map((option) => {
                    const isChosen = chosenSet.has(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role={itemRole}
                        aria-checked={isChosen}
                        className={`${styles.chip} ${styles.button} ${isChosen ? styles.picked : ''} ${isContinueCard(ask) && option.id === CONTINUE_OPTION_ID ? styles.primary : ''}`}
                        disabled={phase === 'sending'}
                        tabIndex={ask.multiple || option.id === rovingId ? 0 : -1}
                        ref={(node) => {
                          if (node === null) chipRefs.current.delete(option.id)
                          else chipRefs.current.set(option.id, node)
                        }}
                        onFocus={() => { setFocusId(option.id) }}
                        onKeyDown={(event) => { onChipKeyDown(event, option.id) }}
                        onClick={() => { choose(option.id) }}
                      >
                        {isChosen && <UiIcon name="check" size={14} />}
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              )}
          {interactive && (
            <div className={styles.foot}>
              {ask.multiple && (
                // The button keeps its place while nothing is picked (visibility, not display): the chips below do not jump when it shows up.
                <button
                  type="button"
                  className={`${styles.send} ${nothingChosen ? styles.sendIdle : ''}`}
                  disabled={phase === 'sending' || nothingChosen}
                  tabIndex={nothingChosen ? -1 : undefined}
                  aria-hidden={nothingChosen ? true : undefined}
                  onClick={() => { void send(picked) }}
                >
                  {t('ask.send', { count: Math.max(picked.length, 1) })}
                </button>
              )}
              <span className={styles.hint}>{t('ask.orWrite')}</span>
            </div>
          )}
          {phase === 'failed' && interactive && (
            <p className={styles.failed} role="status">
              {t('message.notSent')} · <button type="button" className={styles.retry} onClick={() => { void send(attempt) }}>{t('runError.action.retry')}</button>
            </p>
          )}
        </section>
      </div>
    </Tag>
  )
}
