/**
 * Equipe › Personas (NAV-SPEC "Personas · Quem cuida de quem · Saúde"; Keel 03:33 + Muse 03:34): a LISTA das personas da equipe, uma por cartão, no lugar do
 * "Membros e convites" que esta aba abria (as pessoas ficam só em Configurações › Membros). Cada cartão: o rosto com a pose do estado, o nome, a função, o
 * estado EM PALAVRAS, a tarefa atual, "Fila: n" e "Quem cuida: {nome}" quando o host diz. O clique abre o perfil. "Contratar persona" no topo.
 *
 * A ordem é calculada ao ABRIR a aba (Coordenação, Precisa de ajuda, Aguardando você, Trabalhando, o resto por nome) e não reordena ao vivo: o estado muda
 * no lugar, o cartão não pula. Sem nenhuma persona: o vazio "Sua equipe ainda está vazia" com "Contratar persona".
 */

import { useRef, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { poseUrl } from '../assets/asset-url.ts'
import { Avatar, Button, Chip, EmptyState, Screen, ScreenHeader, Skeleton, UiIcon } from '../primitives/index.ts'
import { orderRosterIds, type RosterEntry } from './personas-roster.ts'
import { PERSONA_STATE_CHIP_TONE, PERSONA_STATE_LABEL, PERSONA_STATE_POSE, personaStateOf } from './persona-state.ts'
import styles from './PersonasTeamPanel.module.css'

export interface PersonasTeamPanelProps extends PropsLocale<'persona.shell'> {
  readonly roster: readonly RosterEntry[]
  /** Os dados do host ainda não chegaram (recarregar): esqueleto em vez do vazio "sua equipe está vazia". */
  readonly loading?: boolean | undefined
  /** O clique no cartão abre o perfil da persona. */
  readonly onOpenPersona?: ((personaId: string) => void) | undefined
  /** "Contratar persona" (o fluxo de contratação que já existe). Sem ele o botão não existe. */
  readonly onHire?: (() => void) | undefined
}

/** A ordem de abertura: os ids que já estavam na tela mantêm o lugar; quem chegou depois entra no fim. */
function useOpenOrder(roster: readonly RosterEntry[]): readonly string[] {
  const frozen = useRef<readonly string[] | null>(null)
  if (roster.length === 0) {
    frozen.current = null
    return []
  }
  if (frozen.current === null) {
    frozen.current = orderRosterIds(roster)
    return frozen.current
  }
  const known = new Set(frozen.current)
  const arrived = roster.filter(entry => !known.has(entry.id))
  if (arrived.length > 0) frozen.current = [...frozen.current, ...orderRosterIds(arrived)]
  const present = new Set(roster.map(entry => entry.id))
  return frozen.current.filter(id => present.has(id))
}

function PersonaFace({ entry }: { readonly entry: RosterEntry }): ReactNode {
  // O rosto 96 com a pose do estado (descansando, trabalhando…); sem a pose, o retrato da galeria.
  const pose = poseUrl(entry.characterId, PERSONA_STATE_POSE[personaStateOf(entry)])
  const portrait = AVATAR_96[entry.characterId as keyof typeof AVATAR_96]
  if (pose !== undefined) return <img className={styles.pose} src={pose} alt="" aria-hidden="true" width={96} height={96} />
  return <Avatar name={entry.name} src={portrait} shape="portrait" size={96} decorative />
}

export function PersonasTeamPanel({ t, roster, loading = false, onOpenPersona, onHire }: PersonasTeamPanelProps): ReactNode {
  const order = useOpenOrder(roster)
  const byId = new Map(roster.map(entry => [entry.id, entry]))
  const hire = onHire === undefined ? undefined : (
    <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={onHire}>{t('sidebar.team.hire')}</Button>
  )
  const showLoading = loading && roster.length === 0
  return (
    <Screen>
      <ScreenHeader icon="equipe" eyebrow={t('place.team')} title={t('team.personas.title')} actions={hire} />
      {showLoading && (
        <ul className={styles.grid} aria-busy="true" data-loading="" aria-label={t('team.personas.listLabel')}>
          {[0, 1, 2].map(index => (
            <li key={index} className={styles.skeleton} aria-hidden="true">
              <Skeleton width={96} height={96} shape="block" />
              <Skeleton width="60%" height={16} />
            </li>
          ))}
        </ul>
      )}
      {!showLoading && roster.length === 0 && (
        <EmptyState
          illustration={ILLUSTRATIONS['empty-equipe-remota']}
          title={t('team.personas.emptyTitle')}
          action={hire}
        />
      )}
      {roster.length > 0 && (
        <ul className={styles.grid} aria-label={t('team.personas.listLabel')} data-personas-grid="">
          {order.map((id) => {
            const entry = byId.get(id)
            if (entry === undefined) return null
            const personaState = personaStateOf(entry)
            const state = t(PERSONA_STATE_LABEL[personaState])
            return (
              <li key={entry.id} className={styles.cell}>
                <button
                  type="button"
                  className={styles.card}
                  data-state={entry.state}
                  data-persona-state={personaState}
                  data-persona-card-id={entry.id}
                  aria-label={t('team.personas.cardLabel', { name: entry.name, role: entry.role, state })}
                  onClick={() => { onOpenPersona?.(entry.id) }}
                  disabled={onOpenPersona === undefined}
                >
                  <span className={styles.face}><PersonaFace entry={entry} /></span>
                  <span className={styles.text} aria-hidden="true">
                    <span className={styles.name}>{entry.name}</span>
                    <span className={styles.role}>{entry.role}</span>
                    <span className={styles.chips}>
                      <Chip size="s" tone={PERSONA_STATE_CHIP_TONE[personaState]}>{state}</Chip>
                      <span className={styles.queue}>
                        {entry.queueCount > 0 ? t('overview.nowQueue', { count: String(entry.queueCount) }) : t('overview.queueEmpty')}
                      </span>
                    </span>
                    <span className={entry.currentTask === undefined ? `${styles.task} ${styles.taskIdle}` : styles.task}>
                      {entry.currentTask ?? t('overview.nowNoTask')}
                    </span>
                    {entry.caretaker !== undefined && <span className={styles.caretaker}>{t('team.personas.caretaker', { name: entry.caretaker })}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}
