/** Persona editor wired to host Remote (PRO-4 autonomy persist; hire draft when available). */

import { useCallback, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import { PersonaEditor } from '../persona-editor/PersonaEditor.tsx'
import { hostModeToAutonomyLevel } from '../persona-editor/autonomy-map.ts'
import { personaViewToDraft } from '../persona-editor/map-persona-view-to-draft.ts'
import { MOCK_PERSONA_DRAFT, type PersonaDraft } from '../persona-editor/persona-draft.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { HIRE_PERSONA_PROFILE_ID, type ShellState } from '../shell/create-shell-store.ts'
import type { PersonaLiveStore } from './persona-live-store.ts'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { draftToCreatePersonaRequest } from '../hire/map-draft-to-create-persona.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'

type EditorRemote = LumenRemoteInjected['persona'] & {
  draftPersona?(request: {
    workspaceId: string
    projectId: string
    description: string
  }): unknown
}

export type ConnectedPersonaEditorProps = {
  readonly dict: LocaleDict
  readonly persona: EditorRemote
  readonly useTenant: LumenRemotePanelProps['useTenant']
  readonly useShell: <T>(selector: (state: ShellState) => T) => T
  readonly live: PersonaLiveStore
}

function useScope(useTenant: LumenRemotePanelProps['useTenant']): ProjectScopeRequest | null {
  const { gate } = useRemoteTenantGate(useTenant)
  return gate === 'loading' || gate === 'error' ? null : gate
}

function draftFromHostWire(raw: {
  name: string
  title: string
  description: string
  personality: string
  instructions: string
  avatarKind: string
  runnerKind: string
  runnerCli: string
  runnerModel: string
  canRecruit: boolean
  systemRoles: readonly ('coordination' | 'watchdog')[]
}): PersonaDraft {
  return personaViewToDraft({
    id: '',
    workspaceId: '',
    projectId: '',
    name: raw.name,
    title: raw.title,
    description: raw.description,
    avatarKind: raw.avatarKind === 'upload' || raw.avatarKind === 'silhouette' ? raw.avatarKind : 'gallery',
    avatarRef: '',
    systemRoles: [...raw.systemRoles],
    canRecruit: raw.canRecruit,
  }, 'propose')
}

export function ConnectedPersonaEditor({
  dict,
  persona,
  useTenant,
  useShell,
  live,
}: ConnectedPersonaEditorProps): ReactNode {
  const scope = useScope(useTenant)
  const profilePersonaId = useShell((state: ShellState) => state.profilePersonaId)
  const hireMode = profilePersonaId === HIRE_PERSONA_PROFILE_ID

  const load = useCallback(async () => {
    if (scope === null) return null
    if (hireMode) {
      if (persona.draftPersona !== undefined) {
        const rawDraft = await persona.draftPersona({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          description: 'Nova persona para o projeto',
        })
        const wire = await unwrapRemote(rawDraft as Parameters<typeof unwrapRemote>[0]) as Parameters<typeof draftFromHostWire>[0]
        return {
          hireMode: true as const,
          personaId: null as string | null,
          initial: {
            ...draftFromHostWire(wire),
            personality: wire.personality,
            instructions: wire.instructions,
            harness: wire.runnerCli.length > 0 ? wire.runnerCli : 'dsh',
            model: wire.runnerModel,
          },
        }
      }
      return { hireMode: true as const, personaId: null as string | null, initial: MOCK_PERSONA_DRAFT }
    }
    const personas = await unwrapRemote(await persona.listPersonas(scope))
    const picked = profilePersonaId === null
      ? personas[0]
      : personas.find(row => row.id === profilePersonaId) ?? personas[0]
    if (picked === undefined) return null
    let autonomyLevel = MOCK_PERSONA_DRAFT.autonomyLevel
    if (persona.getAutonomy !== undefined) {
      try {
        const row = await unwrapRemote(await persona.getAutonomy({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          personaId: picked.id,
        }))
        autonomyLevel = hostModeToAutonomyLevel(row.mode)
      } catch {
        /* keep default tier */
      }
    }
    return {
      hireMode: false as const,
      personaId: picked.id,
      initial: personaViewToDraft(picked, autonomyLevel),
    }
  }, [scope, persona, profilePersonaId, hireMode])

  const loadKey = scope === null
    ? ''
    : `${scope.workspaceId}:${scope.projectId}:${profilePersonaId ?? 'default'}`
  const { state } = usePersonaRemoteLoad(scope !== null, loadKey, load)

  const onSave = async (draft: PersonaDraft): Promise<void> => {
    if (scope === null || state.status !== 'ready' || state.data === null) return
    if (state.data.hireMode) {
      const tenant = live.observable.getSnapshot().tenant
      if (tenant === null || !('createPersona' in persona)) return
      const request = draftToCreatePersonaRequest(draft, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        memberId: tenant.memberId,
      })
      try {
        await unwrapRemote(await persona.createPersona(request))
        await live.setPersonaAutonomyLevel(request.id, draft.autonomyLevel)
        await live.refresh()
      } catch {
        /* host/runners may reject — Muse hire card shows outcome later */
      }
      return
    }
    const personaId = state.data.personaId
    if (personaId === null) return
    await live.setPersonaAutonomyLevel(personaId, draft.autonomyLevel)
  }

  if (state.status === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="title.edit" skeletonColumns={1} />
  }
  if (state.status === 'error' || state.data === null) {
    return <PersonaEditor dict={dict} initial={MOCK_PERSONA_DRAFT} onSave={onSave} />
  }
  return (
    <PersonaEditor
      dict={dict}
      initial={state.data.initial}
      onSave={onSave}
    />
  )
}
