/** Persona editor wired to host Remote (PRO-4 autonomy persist; hire draft when available). */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type {
  ConnectionView,
  PersonaDraft as WirePersonaDraft,
  ProjectScopeRequest,
} from '@deepseek-ai/dsh-persona-host/types'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import { PersonaEditor, type RunnerOptionUi } from '../persona-editor/PersonaEditor.tsx'
import { hostModeToAutonomyLevel } from '../persona-editor/autonomy-map.ts'
import { personaViewToDraft } from '../persona-editor/map-persona-view-to-draft.ts'
import { MOCK_PERSONA_DRAFT, type PersonaDraft } from '../persona-editor/persona-draft.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { HIRE_PERSONA_PROFILE_ID, type ShellState } from '../shell/create-shell-store.ts'
import type { PersonaLiveStore } from './persona-live-store.ts'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { draftToCreatePersonaRequest } from '../hire/map-draft-to-create-persona.ts'
import { connectionsToRunnerOptions } from '../hire/connections-to-runner-options.ts'
import { createEmptyHireDraft } from '../hire/empty-hire-draft.ts'
import { pickUnusedGalleryAnimal } from '../hire/gallery-animals.ts'
import { fallbackPersonaDraftWire } from '../hire/fallback-persona-draft-wire.ts'
import { wirePersonaDraftToUi } from '../hire/wire-persona-draft-to-ui.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { StructureAssistant } from '../governance/StructureAssistant.tsx'
import type { RecommendedPersona, StructurePlan } from '../governance/structure-types.ts'
import { structureRoleToDraft } from '../governance/structure-role-to-draft.ts'
import { applyPersonaGovernanceIfSupported } from '../governance/apply-persona-governance.ts'
import { applyGestorSettingsIfSupported } from '../persona-editor/apply-gestor-settings.ts'
import { DEFAULT_GESTOR_LIMITS_UI, mandateViewToGestorLimits } from '../persona-editor/gestor-editor-map.ts'
import { applyStructurePlan } from '../governance/fetch-apply-structure.ts'
import { buildMemberPicklist, buildSectorPicklist } from '../governance/governance-picklists.ts'

type EditorRemote = LumenRemoteInjected['persona'] & {
  getGestorMandate?(request: { workspaceId: string; personaId: string }): unknown
  setGestorLimits?(request: unknown): unknown
  setPersonaSystemRoles?(request: unknown): unknown
  draftPersona?(request: {
    workspaceId: string
    projectId: string
    description: string
    createdBy: string
  }): unknown
  listConnections?(request: ProjectScopeRequest): unknown
}

export type ConnectedPersonaEditorProps = {
  readonly dict: LocaleDict
  readonly governanceDict: LocaleDict
  readonly persona: EditorRemote
  readonly useTenant: LumenRemotePanelProps['useTenant']
  readonly useShell: <T>(selector: (state: ShellState) => T) => T
  readonly live: PersonaLiveStore
  /** After successful hire `createPersona` (closes editor shell state). */
  readonly onHireComplete?: () => void
}

type EditorLoadResult =
  | {
    readonly hireMode: true
    readonly personaId: null
    readonly initial: PersonaDraft
    readonly runners: readonly RunnerOptionUi[]
  }
  | {
    readonly hireMode: false
    readonly personaId: string
    readonly initial: PersonaDraft
  }

function useScope(useTenant: LumenRemotePanelProps['useTenant']): ProjectScopeRequest | null {
  const { gate } = useRemoteTenantGate(useTenant)
  return gate === 'loading' || gate === 'error' ? null : gate
}

export function ConnectedPersonaEditor({
  dict,
  governanceDict,
  persona,
  useTenant,
  useShell,
  live,
  onHireComplete,
}: ConnectedPersonaEditorProps): ReactNode {
  const scope = useScope(useTenant)
  const profilePersonaId = useShell((state: ShellState) => state.profilePersonaId)
  const hireMode = profilePersonaId === HIRE_PERSONA_PROFILE_ID
  const [hirePhase, setHirePhase] = useState<'assistant' | 'editor'>('assistant')
  const [editorSeed, setEditorSeed] = useState<PersonaDraft | null>(null)

  const load = useCallback(async (): Promise<EditorLoadResult | null> => {
    if (scope === null) return null
    const tenantMember = live.observable.getSnapshot().tenant?.memberId ?? ''
    if (hireMode) {
      const personas = await unwrapRemote(await persona.listPersonas(scope))
      const avatarRef = pickUnusedGalleryAnimal(personas.map(row => row.avatarRef))
      const initial = {
        ...createEmptyHireDraft(avatarRef),
        responsibleMemberId: tenantMember,
      }
      let runners: readonly RunnerOptionUi[] = []
      if (persona.listConnections !== undefined) {
        const rows = await unwrapRemote<ConnectionView[]>(
          await persona.listConnections(scope) as RemoteResult<ConnectionView[]>,
        )
        runners = connectionsToRunnerOptions(rows)
      }
      return { hireMode: true, personaId: null, initial, runners }
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
    let gestorLimits = DEFAULT_GESTOR_LIMITS_UI
    if (persona.getGestorMandate !== undefined && picked.systemRoles.includes('team_manager')) {
      try {
        const mandate = await unwrapRemote(
          await persona.getGestorMandate({
            workspaceId: scope.workspaceId,
            personaId: picked.id,
          }) as Parameters<typeof unwrapRemote>[0],
        ) as import('@deepseek-ai/dsh-persona-host/types').GestorMandateView
        gestorLimits = mandateViewToGestorLimits(mandate)
      } catch {
        /* default limits */
      }
    }
    return {
      hireMode: false as const,
      personaId: picked.id,
      initial: {
        ...personaViewToDraft(picked, autonomyLevel),
        gestorLimits,
        responsibleMemberId: tenantMember,
      },
    }
  }, [scope, persona, profilePersonaId, hireMode, live])

  const loadKey = scope === null
    ? ''
    : `${scope.workspaceId}:${scope.projectId}:${profilePersonaId ?? 'default'}`
  const { state } = usePersonaRemoteLoad(scope !== null, loadKey, load)

  const liveSnap = live.observable.getSnapshot()
  const tenant = liveSnap.tenant
  const governanceUi = useMemo(() => {
    const memberId = tenant?.memberId ?? ''
    const members = (liveSnap.team?.members ?? []).map(row => ({
      id: row.id,
      name: row.displayName,
    }))
    return {
      sectors: buildSectorPicklist(governanceDict),
      members: buildMemberPicklist(governanceDict, members, memberId),
    }
  }, [governanceDict, liveSnap.team, tenant?.memberId])

  const gestorAreaOptions = useMemo(() => {
    const sectors = governanceUi.sectors.map(row => ({ id: row.id, label: row.label }))
    const projects = liveSnap.projects.map(row => ({ id: row.id, label: row.name }))
    return [...sectors, ...projects]
  }, [governanceUi.sectors, liveSnap.projects])

  const persistHireDraft = async (draft: PersonaDraft): Promise<void> => {
    if (scope === null || tenant === null || !('createPersona' in persona)) return
    const request = draftToCreatePersonaRequest(draft, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      memberId: tenant.memberId,
    })
    await unwrapRemote(await persona.createPersona(request))
    await live.setPersonaAutonomyLevel(request.id, draft.autonomyLevel)
    await applyPersonaGovernanceIfSupported(persona, scope, request.id, draft)
    const sectorIds = governanceUi.sectors.map(row => row.id)
    const projectIds = live.observable.getSnapshot().projects.map(row => row.id)
    await applyGestorSettingsIfSupported(persona, scope, request.id, draft, sectorIds, projectIds)
  }

  const onSave = async (draft: PersonaDraft): Promise<void> => {
    if (scope === null || state.status !== 'ready' || state.data === null) return
    if (state.data.hireMode) {
      try {
        await persistHireDraft(draft)
        await live.refresh()
        onHireComplete?.()
      } catch {
        /* host/runners may reject — Muse hire card shows outcome later */
      }
      return
    }
    const personaId = state.data.personaId
    if (personaId === null) return
    await live.setPersonaAutonomyLevel(personaId, draft.autonomyLevel)
    await applyPersonaGovernanceIfSupported(persona, scope, personaId, draft)
    const sectorIds = governanceUi.sectors.map(row => row.id)
    const projectIds = live.observable.getSnapshot().projects.map(row => row.id)
    await applyGestorSettingsIfSupported(persona, scope, personaId, draft, sectorIds, projectIds)
    await live.refresh()
  }

  const structureInputFromPlan = (plan: StructurePlan): {
    companyModel: StructurePlan['companyModel']
    activeSectorIds: readonly string[]
    weeklyWorkNotes: string
  } => ({
    companyModel: plan.companyModel,
    activeSectorIds: plan.sectors.map(row => row.id),
    weeklyWorkNotes: '',
  })

  const hireAll = async (plan: StructurePlan): Promise<void> => {
    if (scope === null || tenant === null) return
    try {
      await applyStructurePlan(persona, scope.workspaceId, structureInputFromPlan(plan))
      for (let index = 0; index < plan.personas.length; index++) {
        const role = plan.personas[index]
        if (role === undefined) continue
        const draft = structureRoleToDraft(role, index, { responsibleMemberId: tenant.memberId })
        await persistHireDraft(draft)
      }
      await live.refresh()
      onHireComplete?.()
    } catch {
      /* partial hire — user can retry from editor */
    }
  }

  const onDraftFromDescription = hireMode && scope !== null
    ? async (description: string): Promise<PersonaDraft | null> => {
      const avatarFallback = state.status === 'ready' && state.data?.hireMode === true
        ? state.data.initial.avatarRef ?? 'capivara'
        : 'capivara'
      try {
        if (persona.draftPersona !== undefined && tenant !== null) {
          const raw = await unwrapRemote(
            await persona.draftPersona({
              workspaceId: scope.workspaceId,
              projectId: scope.projectId,
              description,
              createdBy: tenant.memberId,
            }) as Parameters<typeof unwrapRemote>[0],
          ) as WirePersonaDraft
          return wirePersonaDraftToUi(raw, avatarFallback)
        }
      } catch {
        /* host draft failed — deterministic client fallback (no persona-host/src import) */
      }
      return wirePersonaDraftToUi(fallbackPersonaDraftWire(description), avatarFallback)
    }
    : undefined

  if (state.status === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="title.edit" skeletonColumns={1} />
  }

  if (hireMode && hirePhase === 'assistant' && state.status === 'ready' && state.data?.hireMode === true) {
    return (
      <StructureAssistant
        dict={governanceDict}
        humanLabel={tenant?.memberId ?? ''}
        {...(scope === null
          ? {}
          : {
            structureRemote: {
              client: persona,
              workspaceId: scope.workspaceId,
            },
          })}
        onSkip={() => { setHirePhase('editor') }}
        onHireOne={(role: RecommendedPersona, plan: StructurePlan) => {
          const index = plan.personas.findIndex(row => row.id === role.id)
          const draft = structureRoleToDraft(role, index >= 0 ? index : 0, {
            responsibleMemberId: tenant?.memberId ?? '',
          })
          setEditorSeed(draft)
          setHirePhase('editor')
        }}
        onHireAll={hireAll}
      />
    )
  }

  const editorInitial = editorSeed
    ?? (state.status === 'ready' && state.data !== null ? state.data.initial : MOCK_PERSONA_DRAFT)

  if (state.status === 'error' || state.data === null) {
    return (
      <PersonaEditor
        dict={dict}
        mode={hireMode ? 'new' : 'edit'}
        initial={editorInitial}
        governance={governanceUi}
        gestorAreaOptions={gestorAreaOptions}
        onSave={onSave}
        {...(onDraftFromDescription === undefined ? {} : { onDraftFromDescription })}
      />
    )
  }
  return (
    <PersonaEditor
      dict={dict}
      mode={state.data.hireMode ? 'new' : 'edit'}
      initial={editorInitial}
      governance={governanceUi}
      gestorAreaOptions={gestorAreaOptions}
      onSave={onSave}
      {...(onDraftFromDescription === undefined ? {} : { onDraftFromDescription })}
      {...(state.data.hireMode && state.data.runners.length > 0 ? { runners: state.data.runners } : {})}
    />
  )
}
