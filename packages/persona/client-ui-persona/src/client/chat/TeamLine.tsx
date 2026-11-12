/**
 * TEAM-8 (EQUIPE-REAL-SPEC, D-090): as linhas do fio quando uma persona passa trabalho a outra ou pede revisão — a mesma família da linha
 * do HT-3 (`HarnessEventLine`): sem balão, os DOIS rostos 24 com uma seta entre eles e a frase. O host manda campos (`MessageView.handoff` /
 * `MessageView.review`); as palavras são daqui. Nunca um id e nunca o bilhete (o bilhete mora na Tarefa, não no canal).
 *
 * Só com `persona.flag.teamwork` (quem monta decide). Nenhuma ação sem destino: "Ver tarefa" só existe com `onOpenTask` e uma tarefa conhecida.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, BrandIcon, UiIcon, type BrandIconName } from '../primitives/index.ts'
import {
  handoffLineText,
  reviewLineText,
  type HandoffLineUi,
  type LineText,
  type ReviewLineUi,
  type TeamPersonaUi,
} from '../teamwork/team-lines-model.ts'
import { faceTone, sameFace } from './team-line-faces.ts'
import styles from './TeamLine.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** DESIGN-01 (Fio real c): o rosto de 28 px com o anel da função; com `named` (rostos iguais) o nome vem ao lado do rosto. */
function face(persona: TeamPersonaUi, named = false): ReactNode {
  const src = persona.characterId === undefined ? undefined : AVATAR_96[persona.characterId as keyof typeof AVATAR_96]
  const tone = faceTone(persona)
  return (
    <>
      <span className={styles.face} data-team-face="" data-tint={tone === undefined ? undefined : String(tone)}>
        <Avatar name={persona.name} src={src} shape="portrait" size={28} decorative />
      </span>
      {named && <span className={styles.faceName} data-team-face-name="">{persona.name}</span>}
    </>
  )
}

/** A frase da linha, sem marcação (também usada pelos testes). `undefined` = sem texto na spec: o corpo simples do host aparece. */
export function teamLineSentence(t: ChatT, text: LineText | undefined): string | undefined {
  return text === undefined ? undefined : t(text.key, text.params)
}

interface EventShellProps {
  readonly left: TeamPersonaUi
  readonly right: TeamPersonaUi
  readonly rowTag: 'li' | 'div'
  readonly kind: string
  readonly sentence: string
  readonly timeLabel?: string | undefined
  readonly actions?: ReactNode
  /** O ícone da linha (BR-P6), sempre ao lado do texto. */
  readonly icon?: BrandIconName | undefined
}

function EventShell({ left, right, rowTag, kind, sentence, timeLabel, actions, icon }: EventShellProps): ReactNode {
  const Tag = rowTag
  // Se os dois rostos se confundem (o mesmo bicho e a mesma função), o nome vem antes da seta.
  const named = sameFace(left, right)
  return (
    <Tag className={styles.line} data-team-line={kind}>
      <span className={styles.faces} aria-hidden="true">
        {face(left, named)}
        <span className={styles.arrow} data-team-arrow=""><UiIcon name="arrowRight" size={14} /></span>
        {face(right, named)}
      </span>
      <div className={styles.body}>
        <p className={styles.text}>
          {icon !== undefined && <BrandIcon name={icon} size={16} className={styles.lineIcon} />}
          {sentence}
          {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> · {timeLabel}</span>}
        </p>
        {actions}
      </div>
    </Tag>
  )
}

/** Ícone da passagem (BR-P6): passou adiante, pediu ajuda, ajudou, entregou; o "pediu a revisão" usa o da revisão. */
function handoffIcon(line: HandoffLineUi): BrandIconName | undefined {
  if (line.purpose === 'review') return 'revisao'
  if (line.status === 'asked') return line.mode === 'handoff' ? 'passar-adiante' : 'pedir-ajuda'
  if (line.status === 'delivered') return line.mode === 'help' ? 'ajudou' : 'entregou'
  return undefined
}

/** Ícone da revisão (BR-P6): aprovou usa o da revisão; pediu ajustes usa o seu. */
function reviewIcon(line: ReviewLineUi): BrandIconName | undefined {
  if (line.kind === 'reviewed') return 'revisao'
  if (line.kind === 'returned') return 'pediu-ajustes'
  return undefined
}

export interface HandoffLineProps {
  readonly t: ChatT
  readonly line: HandoffLineUi
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  /** "Ver tarefa" / "Ver": abre a tarefa no quadro. Sem ele (ou sem tarefa conhecida) não há botão. */
  readonly onOpenTask?: ((taskId: string) => void) | undefined
  /** "Liberar para {B}" (o conector que falta ao colega); só com a permissão do D-084 ligada. */
  readonly onAllow?: ((personaId: string, connector: string) => void) | undefined
}

/** Quem age e quem recebe, para os rostos: o colega que ENTREGOU/AJUDOU olha para quem pediu. */
function handoffFaces(line: HandoffLineUi): readonly [TeamPersonaUi, TeamPersonaUi] {
  return line.status === 'delivered' ? [line.to, line.from] : [line.from, line.to]
}

export function HandoffLine({ t, line, timeLabel, rowTag = 'li', onOpenTask, onAllow }: HandoffLineProps): ReactNode | null {
  const sentence = teamLineSentence(t, handoffLineText(line))
  if (sentence === undefined) return null
  const [left, right] = handoffFaces(line)
  const canOpen = onOpenTask !== undefined && line.taskId !== ''
  const canAllow = line.status === 'blocked' && line.connector !== undefined && onAllow !== undefined
  const openLabel = line.status === 'delivered' ? t('daily.see') : t('harness.action.openTask')
  const actions = (canOpen || canAllow)
    ? (
      <div className={styles.actions}>
        {canOpen && <button type="button" className={styles.action} onClick={() => { onOpenTask(line.taskId) }}>{openLabel}</button>}
        {canAllow && <button type="button" className={styles.action} onClick={() => { onAllow(line.to.id, line.connector ?? '') }}>{t('handoff.allow', { name: line.to.name })}</button>}
      </div>
    )
    : undefined
  return <EventShell left={left} right={right} rowTag={rowTag} kind={`handoff-${line.status}`} sentence={sentence} timeLabel={timeLabel} actions={actions} icon={handoffIcon(line)} />
}

export interface ReviewLineProps {
  readonly t: ChatT
  readonly line: ReviewLineUi
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  readonly onOpenTask?: ((taskId: string) => void) | undefined
}

export function ReviewLine({ t, line, timeLabel, rowTag = 'li', onOpenTask }: ReviewLineProps): ReactNode | null {
  const sentence = teamLineSentence(t, reviewLineText(line))
  if (sentence === undefined) return null
  const canOpen = onOpenTask !== undefined && line.taskId !== ''
  const actions = canOpen
    ? (
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => { onOpenTask(line.taskId) }}>{t('harness.action.openTask')}</button>
      </div>
    )
    : undefined
  // A revisora fala COM a autora: ela é quem age, os rostos vão dela para quem escreveu.
  return <EventShell left={line.reviewer} right={line.author} rowTag={rowTag} kind={`review-${line.kind}`} sentence={sentence} timeLabel={timeLabel} actions={actions} icon={reviewIcon(line)} />
}

export interface HandoffGroupProps {
  readonly t: ChatT
  readonly lines: readonly HandoffLineUi[]
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  readonly onOpenTask?: ((taskId: string) => void) | undefined
}

/** Várias passagens no mesmo minuto: "A Bia pediu ajuda a 2 colegas", aberto por padrão só quando são no máximo 2. */
export function HandoffGroup({ t, lines, timeLabel, rowTag = 'li', onOpenTask }: HandoffGroupProps): ReactNode | null {
  const first = lines[0]
  const [open, setOpen] = useState(lines.length <= 2)
  if (first === undefined) return null
  const Tag = rowTag
  return (
    <Tag className={`${styles.line} ${styles.group}`} data-team-line="handoff-group">
      <span className={styles.faces} aria-hidden="true">{face(first.from)}</span>
      <div className={styles.body}>
        <p className={styles.text}>
          <BrandIcon name="pedir-ajuda" size={16} className={styles.lineIcon} />
          {t('handoff.groupMany', { from: first.from.name, count: lines.length })}
          {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> · {timeLabel}</span>}
        </p>
        <button type="button" className={styles.action} aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
          {open ? t('daily.seeLess') : t('daily.seeAll')}
        </button>
        {open && (
          <ul className={styles.groupList}>
            {lines.map((line, index) => (
              <HandoffLine
                key={`${line.taskId}-${String(index)}`}
                t={t}
                line={line}
                rowTag="li"
                {...(onOpenTask === undefined ? {} : { onOpenTask })}
              />
            ))}
          </ul>
        )}
      </div>
    </Tag>
  )
}
