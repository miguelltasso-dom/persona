/**
 * EQUIPE-REAL-SPEC §0 (Muse, 05/11): o PLANO de um pedido, UMA vez, como cartão VIVO no #geral. A Coordenação diz "Dividi assim" e o cartão lista as
 * partes, cada uma com o rosto 24, o título curto e o estado num chip que MUDA NO LUGAR (o host reenvia a mesma mensagem; o cartão nunca ganha
 * linha nova). Os 8 estados: na fila · fazendo · esperando {nome} · com {nome} (rosto 16) · revisando (info) · precisa de você (warning, clicável:
 * abre o cartão que pede a decisão) · pronto (success) · parou (danger, com "Ver motivo"; só falha que pede ação).
 *
 * Atrás de `persona.flag.teamwork`. Cada ação só existe com destino: "precisa de você" só é clicável com `approvalId` e `onOpenApproval`; "Ver motivo" só
 * com o motivo. O texto das personas (títulos, motivo) é só texto.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Card, Chip, Modal, type ChipTone } from '../primitives/index.ts'
import type { TeamPartStatusWire } from '../remote/persona-remote-types.ts'
import type { TeamPlanPartUi, TeamPlanUi } from '../remote/map-host-ui.ts'
import styles from './TeamPlanCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface TeamPlanCardProps {
  readonly t: ChatT
  readonly plan: TeamPlanUi
  readonly rowTag?: 'li' | 'div'
  /** "precisa de você" abre Aprovações com este item selecionado; sem o handler o chip é só um rótulo. */
  readonly onOpenApproval?: ((approvalId: string) => void) | undefined
}

/** A cor do chip de cada estado (Muse): neutros para o andamento, info para revisando, warning/success/danger para o resto. */
export const PART_CHIP_TONE: Readonly<Record<TeamPartStatusWire, ChipTone>> = {
  queued: 'neutral',
  doing: 'neutral',
  waiting: 'neutral',
  'with-colleague': 'neutral',
  reviewing: 'info',
  'needs-you': 'warning',
  done: 'success',
  stopped: 'danger',
}

/** O texto do chip de um estado (o nome do colega entra em "esperando"/"com"). */
export function partStateText(t: ChatT, part: TeamPlanPartUi): string {
  switch (part.status) {
    case 'queued': return t('team.state.queued')
    case 'doing': return t('team.state.doing')
    case 'waiting': return part.withName === undefined ? t('team.state.waitingNobody') : t('team.state.waiting', { name: part.withName })
    case 'with-colleague': return part.withName === undefined ? t('team.state.withColleagueNobody') : t('team.state.withColleague', { name: part.withName })
    case 'reviewing': return t('team.state.reviewing')
    case 'needs-you': return t('team.state.needsYou')
    case 'done': return t('team.state.done')
    default: return t('team.state.stopped')
  }
}

function PartChip({ t, part, onOpenApproval, onSeeReason }: {
  readonly t: ChatT
  readonly part: TeamPlanPartUi
  readonly onOpenApproval?: ((approvalId: string) => void) | undefined
  readonly onSeeReason: () => void
}): ReactNode {
  const text = partStateText(t, part)
  const tone = PART_CHIP_TONE[part.status]
  // O rosto 16 do colega ("esperando Teo", "com Teo"): uma imagem pequena de verdade (o Avatar mais baixo tem 24 e cortaria dentro do chip).
  const withSrc = (part.status === 'waiting' || part.status === 'with-colleague') && part.withCharacterId !== undefined
    ? AVATAR_96[part.withCharacterId as keyof typeof AVATAR_96]
    : undefined
  const chip = <Chip tone={tone} size="s" icon={withSrc === undefined ? undefined : <img className={styles.face16} src={withSrc} alt="" aria-hidden="true" />}>{text}</Chip>
  if (part.status === 'needs-you' && part.approvalId !== undefined && onOpenApproval !== undefined) {
    const approvalId = part.approvalId
    return <button type="button" className={styles.chipButton} onClick={() => { onOpenApproval(approvalId) }}>{chip}</button>
  }
  return (
    <span className={styles.chipGroup}>
      {chip}
      {part.status === 'stopped' && part.reason !== undefined && (
        <button type="button" className={styles.link} onClick={onSeeReason}>{t('team.state.seeReason')}</button>
      )}
    </span>
  )
}

export function TeamPlanCard({ t, plan, rowTag = 'li', onOpenApproval }: TeamPlanCardProps): ReactNode {
  const Tag = rowTag
  const [reasonOf, setReasonOf] = useState<TeamPlanPartUi | null>(null)
  return (
    <Tag className={styles.row} data-team-plan="">
      <Card as="article" tone="brand" padding="m" aria-label={`${t('team.plan.eyebrow')} · ${plan.title}`} eyebrow={t('team.plan.eyebrow')} title={plan.title} className={styles.card}>
        <ul className={styles.parts} aria-label={t('team.plan.parts')}>
          {plan.parts.map((part, index) => {
            const who = part.personaName ?? t('team.somePersona')
            const face = part.characterId === undefined ? undefined : AVATAR_96[part.characterId as keyof typeof AVATAR_96]
            return (
              // taskId pode vir vazio (parte ainda não aberta, "na fila"): a chave é a posição + o id, nunca só o id
              <li key={`${index}-${part.taskId}`} className={styles.part} data-part-status={part.status}>
                <Avatar name={who} src={face} shape="portrait" size={24} decorative />
                <span className={styles.partText}>
                  <span className={styles.partTitle} {...(part.fullTitle === undefined ? {} : { title: part.fullTitle })}>{part.title}</span>
                  <span className="persona-sr-only"> ({who})</span>
                </span>
                <PartChip t={t} part={part} onOpenApproval={onOpenApproval} onSeeReason={() => { setReasonOf(part) }} />
              </li>
            )
          })}
        </ul>
      </Card>
      {reasonOf !== null && reasonOf.reason !== undefined && (
        <Modal open size="m" title={t('team.state.reasonTitle')} closeLabel={t('team.state.close')} onClose={() => { setReasonOf(null) }}>
          <p className={styles.reasonPart}>{reasonOf.title}</p>
          <p className={styles.reasonText}>{reasonOf.reason}</p>
        </Modal>
      )}
    </Tag>
  )
}
