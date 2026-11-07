import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { fetchOrgChart } from '../governance/governance-remote.ts'
import { PersonasTeamPanel } from '../team/PersonasTeamPanel.tsx'
import { buildRoster } from '../team/personas-roster.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedPersonasTeamInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  /** O Remote da Persona: só para "Quem cuida: {nome}" (o organograma por pessoa). Sem ele, os cartões não têm essa linha. */
  persona?: PersonaRemoteClient | undefined
  /** O clique no cartão abre o perfil da persona. */
  openPersonaProfile(personaId: string): void
  /** "Contratar persona" (o fluxo de contratação que já existe). */
  hirePersona?(): void
}

export type ConnectedPersonasTeamPanelProps = PropsLocale<'persona.shell'> & InjectFace<ConnectedPersonasTeamInjected>

/** Quem cuida de cada persona, do organograma POR PESSOA do host (`getOrgChart`); qualquer falha só deixa os cartões sem essa linha. */
function useCaretakers(persona: PersonaRemoteClient | undefined, workspaceId: string | undefined): ReadonlyMap<string, string> {
  const [caretakers, setCaretakers] = useState<ReadonlyMap<string, string>>(() => new Map())
  useEffect(() => {
    if (persona === undefined || workspaceId === undefined) return undefined
    let alive = true
    void fetchOrgChart(persona, workspaceId, 'person').then((chart) => {
      if (!alive) return
      const next = new Map<string, string>()
      for (const group of chart.groups) {
        if (group.kind !== 'person') continue
        for (const member of group.members) next.set(member.id, group.title)
      }
      setCaretakers(next)
    }).catch(() => { /* sem organograma: nenhum "Quem cuida" */ })
    return () => { alive = false }
  }, [persona, workspaceId])
  return caretakers
}

/** Equipe › Personas, com os dados vivos da equipe (a mesma fonte do "Agora" da Visão geral e da faixa da equipe). */
export function ConnectedPersonasTeamPanel({ t, useLive, persona, openPersonaProfile, hirePersona }: ConnectedPersonasTeamPanelProps): ReactNode {
  const live = useLive(state => state)
  const caretakers = useCaretakers(persona, live.tenant?.workspaceId)
  const roster = useMemo(
    () => buildRoster(live.team, live.stripMembers, live.nowRows, caretakers),
    [live.team, live.stripMembers, live.nowRows, caretakers],
  )
  return (
    <PersonasTeamPanel
      t={t}
      roster={roster}
      loading={!live.ready}
      onOpenPersona={openPersonaProfile}
      {...(hirePersona === undefined ? {} : { onHire: hirePersona })}
    />
  )
}
