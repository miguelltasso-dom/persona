import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AutonomyConfig, ConnectorGrantView, PersonaTeamworkView } from '@deepseek-ai/dsh-persona-host/types'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { pickProjectRootPath } from '../files/pick-project-root.ts'
import { hostModeToAutonomyLevel, patchAutonomyMode } from '../persona-editor/autonomy-map.ts'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import { isEngineEffortEnabled } from '../profile/engine-effort-flag.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { isTeamworkEnabled } from '../teamwork/teamwork-flag.ts'
import { sortPersonasForUi } from '../team/sort-personas.ts'
import { readFileTools, writeCanSaveFiles } from './file-tools.ts'
import { PersonasSettingsPanel, type SettingsPersonaRow } from './PersonasSettingsPanel.tsx'

export interface ConnectedPersonasSettingsInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  readonly persona?: PersonaRemoteClient | undefined
  readonly openEngineEditor?: ((personaId: string) => void) | undefined
  readonly refreshLive?: (() => void) | undefined
}

export type ConnectedPersonasSettingsProps = PropsLocale<'persona.shell'> & InjectFace<ConnectedPersonasSettingsInjected>

const DEFAULT_TEAMWORK: PersonaTeamworkView = {
  canAskColleagues: true,
  askCapPerDay: 6,
  askedToday: 0,
  maxOpinionRounds: 2,
}

/** A equipe de verdade (do host) na aba Personas de Configurações. */
export function ConnectedPersonasSettings({
  t,
  useLive,
  persona: client,
  openEngineEditor,
  refreshLive,
}: ConnectedPersonasSettingsProps): ReactNode {
  const tenant = useLive(state => state.tenant)
  const team = useLive(state => state.team)
  const [autonomyMap, setAutonomyMap] = useState<Readonly<Record<string, AutonomyConfig>>>({})
  const [grants, setGrants] = useState<readonly ConnectorGrantView[]>([])
  const [localRecruit, setLocalRecruit] = useState<Readonly<Record<string, boolean>>>({})
  const [localSaveFiles, setLocalSaveFiles] = useState<Readonly<Record<string, boolean>>>({})
  const [localTeamwork, setLocalTeamwork] = useState<Readonly<Record<string, PersonaTeamworkView>>>({})
  // v1.1 (Keel 13:56): "Usar as minhas skills do Claude" e "Contratar direto" ficam FORA desta tela. Eram estado local sem nada atrás (as skills pessoais não chegam ao host;
  // o setPersonaHireDirect existe por persona, mas a tela não o chama). Na v1.2 voltam ligados de verdade: devolver `houseSettings` ao painel.
  // v1.1 (Keel 14:53, achado #3): "Revisão antes de entregar" (modo e revisor) também fica FORA: era estado local (`reviewByProject`) e o host nunca soube da escolha —
  // "Desligada" aparecia confirmada e a revisão seguia ligada em toda entrega, e a tela abria sempre em "Todas · Coordenação" fosse qual fosse a política guardada.
  // O painel segue aceitando `reviewBeforeDelivery`. Na v1.1.x volta LIGADO de verdade: ler `getReviewPolicy` ao abrir e ao trocar de projeto, gravar com
  // `setReviewPolicy` (rollback no erro, como `onChangeCanRecruit`), e esconder "Só alguns tipos" até haver onde escolher os tipos (o host recusa a lista vazia).
  // Preparo pronto em .maestri/staging/forge-review-policy/.

  useEffect(() => {
    if (tenant === null || client === undefined || team === null) return
    let cancelled = false
    void (async () => {
      if ('getAutonomy' in client && typeof client.getAutonomy === 'function') {
        const entries: Record<string, AutonomyConfig> = {}
        for (const p of team.personas) {
          try {
            const cfg = await unwrapRemote(
              await client.getAutonomy({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, personaId: p.id }) as Parameters<typeof unwrapRemote>[0],
            ) as AutonomyConfig
            entries[p.id] = cfg
          } catch {
            /* host sem autonomia para esta persona */
          }
        }
        if (!cancelled) setAutonomyMap(entries)
      }
      if ('listConnectorGrants' in client && typeof client.listConnectorGrants === 'function') {
        try {
          const rows = await unwrapRemote(
            await client.listConnectorGrants({ workspaceId: tenant.workspaceId, projectId: tenant.projectId }) as Parameters<typeof unwrapRemote>[0],
          ) as ConnectorGrantView[]
          if (!cancelled) setGrants(rows)
        } catch {
          /* sem concessões */
        }
      }
    })()
    return () => { cancelled = true }
  }, [tenant, client, team])

  const onChangeAutonomy = useCallback((personaId: string, level: AutonomyLevel): void => {
    if (tenant === null || client === undefined || !('setAutonomy' in client) || typeof client.setAutonomy !== 'function') return
    const current = autonomyMap[personaId] ?? {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      personaId,
      mode: 'propose' as const,
      proposalBudget: 3,
      tokenBudget: 100000,
      executionBudget: 10,
      silenceStart: '',
      silenceEnd: '',
    }
    const next = patchAutonomyMode(current, level)
    setAutonomyMap(prev => ({ ...prev, [personaId]: next }))
    void (async () => {
      try {
        await unwrapRemote(await client.setAutonomy(next) as Parameters<typeof unwrapRemote>[0])
      } catch {
        setAutonomyMap(prev => ({ ...prev, [personaId]: current }))
      }
    })()
  }, [tenant, client, autonomyMap])

  const onChangeCanRecruit = useCallback((personaId: string, canRecruit: boolean): void => {
    setLocalRecruit(prev => ({ ...prev, [personaId]: canRecruit }))
    if (tenant === null || client === undefined || !('setPersonaCanRecruit' in client) || typeof client.setPersonaCanRecruit !== 'function') return
    void (async () => {
      try {
        await unwrapRemote(
          await client.setPersonaCanRecruit({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, personaId, canRecruit }) as Parameters<typeof unwrapRemote>[0],
        )
        refreshLive?.()
      } catch {
        setLocalRecruit(prev => ({ ...prev, [personaId]: !canRecruit }))
      }
    })()
  }, [tenant, client, refreshLive])

  const onChangeCanSaveFiles = useCallback((personaId: string, canSaveFiles: boolean): void => {
    setLocalSaveFiles(prev => ({ ...prev, [personaId]: canSaveFiles }))
    if (tenant === null) return
    void (async () => {
      const saved = await writeCanSaveFiles(client, tenant, personaId, canSaveFiles)
      if (saved) refreshLive?.()
      else setLocalSaveFiles(prev => ({ ...prev, [personaId]: !canSaveFiles }))
    })()
  }, [tenant, client, refreshLive])

  const onChooseFolder = useCallback((): void => {
    if (tenant === null || client === undefined || !('setProjectRoot' in client) || typeof client.setProjectRoot !== 'function') return
    void (async () => {
      const rootPath = await pickProjectRootPath()
      if (rootPath === null) return
      try {
        await unwrapRemote(await client.setProjectRoot({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, rootPath }) as Parameters<typeof unwrapRemote>[0])
        refreshLive?.()
      } catch {
        /* a pasta não foi definida: a frase continua e nada mais muda */
      }
    })()
  }, [tenant, client, refreshLive])

  const onChangeTeamwork = useCallback((
    personaId: string,
    patch: { readonly canAskColleagues?: boolean; readonly askCapPerDay?: number; readonly maxOpinionRounds?: number },
  ): void => {
    const base = localTeamwork[personaId]
      ?? team?.personas.find(p => p.id === personaId)?.teamwork
      ?? DEFAULT_TEAMWORK
    const next: PersonaTeamworkView = {
      canAskColleagues: patch.canAskColleagues ?? base.canAskColleagues,
      askCapPerDay: patch.askCapPerDay ?? base.askCapPerDay,
      askedToday: base.askedToday,
      maxOpinionRounds: patch.maxOpinionRounds ?? base.maxOpinionRounds,
    }
    setLocalTeamwork(prev => ({ ...prev, [personaId]: next }))
    if (tenant === null || client === undefined || !('setPersonaTeamwork' in client) || typeof client.setPersonaTeamwork !== 'function') return
    void (async () => {
      try {
        await unwrapRemote(
          await client.setPersonaTeamwork({
            workspaceId: tenant.workspaceId,
            projectId: tenant.projectId,
            personaId,
            ...patch,
          }) as Parameters<typeof unwrapRemote>[0],
        )
        refreshLive?.()
      } catch {
        setLocalTeamwork(prev => ({ ...prev, [personaId]: base }))
      }
    })()
  }, [tenant, client, team, localTeamwork, refreshLive])

  const onRevokeGrant = useCallback((personaId: string, cli: string, connectorId: string): void => {
    setGrants(prev => prev.filter(g => !(g.personaId === personaId && g.cli === cli && g.connectorId === connectorId)))
    if (tenant === null || client === undefined || !('revokeConnector' in client) || typeof client.revokeConnector !== 'function') return
    void (async () => {
      try {
        await unwrapRemote(
          await client.revokeConnector({ workspaceId: tenant.workspaceId, projectId: tenant.projectId, personaId, cli, connectorId }) as Parameters<typeof unwrapRemote>[0],
        )
      } catch {
        /* ignore */
      }
    })()
  }, [tenant, client])

  const teamworkFlag = isTeamworkEnabled()
  const effortFlag = isEngineEffortEnabled()
  const hasHost = client !== undefined

  const personas: readonly SettingsPersonaRow[] | null = team === null
    ? null
    : sortPersonasForUi(team.personas).map((row) => {
      const cfg = autonomyMap[row.id]
      const personaGrants = grants
        .filter(g => g.personaId === row.id)
        .map(g => ({ cli: g.cli, connectorId: g.connectorId, name: g.name, loadedAlways: g.loadedAlways }))
      const tw = localTeamwork[row.id] ?? row.teamwork ?? (teamworkFlag ? DEFAULT_TEAMWORK : undefined)
      const fileTools = readFileTools(row)
      const canSaveFiles = localSaveFiles[row.id] ?? fileTools.canSaveFiles
      const engineChoice = row.engine ?? (effortFlag ? { runnerKind: 'cli' as const, runnerCli: 'claude', runnerModel: null, runnerEffort: null } : undefined)
      return {
        id: row.id,
        name: row.name,
        title: row.title,
        characterId: row.avatarRef,
        ...(cfg !== undefined ? { autonomy: hostModeToAutonomyLevel(cfg.mode) } : (hasHost ? { autonomy: 'propose' as const } : {})),
        ...(engineChoice !== undefined ? { engine: engineChoice } : {}),
        ...(hasHost ? { canRecruit: localRecruit[row.id] ?? row.canRecruit } : {}),
        ...(hasHost && canSaveFiles !== undefined ? { canSaveFiles } : {}),
        ...(hasHost && fileTools.canSaveFilesAvailable !== undefined ? { canSaveFilesAvailable: fileTools.canSaveFilesAvailable } : {}),
        ...(tw !== undefined ? { teamwork: tw } : {}),
        ...(personaGrants.length > 0 ? { grants: personaGrants } : {}),
      }
    })

  return (
    <PersonasSettingsPanel
      t={t}
      personas={personas}
      {...(hasHost ? { onChangeAutonomy, onChangeCanRecruit, onChangeCanSaveFiles, onChooseFolder, onChangeTeamwork, onRevokeGrant } : {})}
      {...(openEngineEditor !== undefined ? { onOpenEngine: openEngineEditor } : {})}
      {...(teamworkFlag ? { reviewAlwaysOn: true } : {})}
    />
  )
}
