import type {
  CompleteOnboardingRequest,
  GestorPlanView,
  OnboardingPersonaSpec,
  ProposeGestorAssembleView,
} from '@deepseek-ai/dsh-persona-host/types'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from '../chat/conversation-subjects.ts'
import { gestorPlanMarker } from '../chat/gestor-plan-message.ts'
import type { PersonaTenantScope } from './persona-remote-types.ts'
import { readClientDevSeedEnabled } from './persona-dev-seed.ts'

/** Dev harness: pending Gestor assemble plan + #geral card (Muse gallery). */
export const DEV_HARNESS_GESTOR_PLAN_ID = 'dev-harness-v1-gestor-assemble'
export const DEV_HARNESS_GESTOR_MSG_ID = 'dev-harness-v1-gestor-plan'

/** Stable marker: scenario channel + tasks seeded (idempotent). */
export const DEV_HARNESS_SCENARIO_MARKER = 'dev-harness-v1-miguel'
/** Dev harness only: Segundo cérebro grant for dogfood AG-004 (never onboarding real). */
export const DEV_HARNESS_BRAIN_GRANT_ID = 'dev-harness-v1-brain-grant'

/** Example gallery cards for onboarding step 4 (user picks/edits/removes; not auto-created). */
export const SUGGESTED_TEAM_GALLERY = [
  { id: 'gallery-atlas', name: 'Atlas', title: 'Coordenação', avatarRef: 'atlas', systemRoles: ['coordination'] as const, canRecruit: true },
  { id: 'gallery-bento', name: 'Bento', title: 'Engenharia', avatarRef: 'bento', systemRoles: [] as const, canRecruit: false },
  { id: 'gallery-nina', name: 'Nina', title: 'Pesquisa', avatarRef: 'nina', systemRoles: [] as const, canRecruit: false },
  { id: 'gallery-sol', name: 'Sol', title: 'Relacionamento', avatarRef: 'sol', systemRoles: [] as const, canRecruit: false },
  { id: 'gallery-luna', name: 'Luna', title: 'Vigia', avatarRef: 'luna', systemRoles: ['watchdog'] as const, canRecruit: false },
] as const

/** @deprecated Use {@link SUGGESTED_TEAM_GALLERY}. */
export const DEFAULT_SUGGESTED_PERSONAS = SUGGESTED_TEAM_GALLERY

export interface OnboardingRosterPerson {
  readonly name: string
  readonly role: string
  readonly galleryRef?: string
  readonly systemRoles?: readonly ('coordination' | 'watchdog')[]
}

/** Wizard roster → host `CompleteOnboardingRequest.team` (DF-002). */
export function rosterToHostTeam(roster: readonly OnboardingRosterPerson[]): readonly OnboardingPersonaSpec[] {
  return roster.map((person) => {
    const systemRoles = person.systemRoles ?? []
    return {
      name: person.name,
      title: person.role,
      description: person.role,
      personality: 'Proativo e claro.',
      instructions: 'Trabalhe até concluir; reporte com evidência.',
      avatarKind: 'gallery',
      avatarRef: galleryRefForRosterPerson(person),
      runnerKind: 'dsh',
      runnerCli: '',
      runnerModel: 'default',
      canRecruit: systemRoles.includes('coordination'),
      systemRoles: [...systemRoles],
    }
  })
}

/** Host onboarding team payload from gallery cards. */
export function suggestedGalleryToHostTeam(): readonly OnboardingPersonaSpec[] {
  return SUGGESTED_TEAM_GALLERY.map(row => ({
    name: row.name,
    title: row.title,
    description: row.title,
    personality: 'Proativo e claro.',
    instructions: 'Trabalhe até concluir; reporte com evidência.',
    avatarKind: 'gallery',
    avatarRef: row.avatarRef,
    runnerKind: 'dsh',
    runnerCli: '',
    runnerModel: 'default',
    canRecruit: row.canRecruit,
    systemRoles: [...row.systemRoles],
  }))
}

/** Gallery ref from draft row (explicit ref wins; else neutral slug). */
export function galleryRefForRosterPerson(person: OnboardingRosterPerson): string {
  if (person.galleryRef !== undefined && person.galleryRef.length > 0) return person.galleryRef
  const slug = person.name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
  return slug.length > 0 ? slug.slice(0, 32) : 'neutral'
}

type PersonaCreatorRemote = {
  createPersona(request: {
    workspaceId: string
    projectId: string
    id: string
    name: string
    title: string
    description: string
    personality: string
    instructions: string
    avatarKind: 'gallery'
    avatarRef: string
    runnerKind: 'dsh'
    runnerCli: string
    runnerModel: string
    canRecruit: boolean
    createdBy: string
    systemRoles?: readonly ('coordination' | 'watchdog')[]
  }): unknown
  listTeam(request: PersonaTenantScope): { personas: readonly { id: string; name: string }[] }
}

export type DevHarnessSeedRemote = PersonaCreatorRemote & {
  getOnboarding(request: { workspaceId: string; projectId: string }): {
    completed: boolean
    personalProjectId: string
  }
  completeOnboarding?(request: CompleteOnboardingRequest): unknown
  listMessages(request: {
    workspaceId: string
    projectId: string
    streamKind: 'channel'
    ownerId: string
    actorId: string
    afterSeq: number
    limit: number
  }): { events: readonly { id: string; occurredAt?: string }[] }
  postMessage(request: {
    id: string
    workspaceId: string
    projectId: string
    streamKind: 'channel'
    ownerId: string
    body: string
    actorId: string
    subjectId: string
    occurredAt: string
    topicId?: string
  }): unknown
  listApprovals?(request: PersonaTenantScope): readonly { id: string; status: string }[]
  proposeHire?(request: {
    workspaceId: string
    projectId: string
    id: string
    creatorPersonaId: string
    name: string
    title: string
    description: string
  }): unknown
  setPersonaSystemRoles?(request: {
    workspaceId: string
    projectId: string
    personaId: string
    systemRoles: readonly string[]
  }): unknown
  proposeGestorAssemble?(request: {
    workspaceId: string
    projectId: string
    gestorId: string
    id: string
    goal: string
  }): unknown
  listGestorPlans?(request: { workspaceId: string }): readonly GestorPlanView[]
  listBrainPermissions?(request: PersonaTenantScope): readonly { id: string }[]
  grantBrainPermission?(request: {
    workspaceId: string
    projectId: string
    id: string
    personaId: string
    action: string
    target: string
    validity: 'once' | '7d' | 'until-revoke'
  }): unknown
}

function unwrap<T>(result: T | { ok: boolean; value?: T }): T {
  if (result !== null && typeof result === 'object' && 'ok' in result) {
    const row = result as { ok: boolean; value?: T }
    if (!row.ok) throw new Error('remote-failed')
    return row.value as T
  }
  return result as T
}

async function hasChannelMessage(remote: DevHarnessSeedRemote, tenant: PersonaTenantScope, id: string): Promise<boolean> {
  const page = await Promise.resolve(remote.listMessages({
    workspaceId: tenant.workspaceId,
    projectId: tenant.projectId,
    streamKind: 'channel',
    ownerId: tenant.channelId,
    actorId: tenant.memberId,
    afterSeq: 0,
    limit: 300,
  }))
  return page.events.some(event => event.id === id)
}

function personaIdByName(
  team: { personas: readonly { id: string; name: string }[] },
  name: string,
): string | undefined {
  return team.personas.find(row => row.name === name)?.id
}

async function ensureAtlasGestorRole(
  remote: DevHarnessSeedRemote,
  tenant: PersonaTenantScope,
  atlasId: string,
): Promise<void> {
  if (remote.setPersonaSystemRoles === undefined) return
  try {
    await Promise.resolve(remote.setPersonaSystemRoles({
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      personaId: atlasId,
      systemRoles: ['coordination', 'team_manager'],
    }))
  } catch {
    /* already gestor */
  }
}

export interface DevHarnessMessageClock {
  next(): string
}

/** Monotonic occurredAt for dev seed posts (same batch shares one clock). */
export function createDevHarnessMessageClock(
  existing: readonly { occurredAt?: string }[],
  nowMs: number = Date.now(),
  pendingOccurredAt: readonly string[] = [],
): DevHarnessMessageClock {
  let anchor = nowMs
  for (const event of existing) {
    if (event.occurredAt === undefined || event.occurredAt.length === 0) continue
    const parsed = Date.parse(event.occurredAt)
    if (!Number.isNaN(parsed)) anchor = Math.max(anchor, parsed)
  }
  for (const at of pendingOccurredAt) {
    const parsed = Date.parse(at)
    if (!Number.isNaN(parsed)) anchor = Math.max(anchor, parsed)
  }
  return {
    next(): string {
      anchor += 60_000
      return new Date(anchor).toISOString()
    },
  }
}

async function seedDevHarnessGestorPlanMessage(
  remote: DevHarnessSeedRemote,
  tenant: PersonaTenantScope,
  atlasId: string,
  messageClock?: DevHarnessMessageClock,
): Promise<void> {
  if (remote.proposeGestorAssemble === undefined) return
  if (await hasChannelMessage(remote, tenant, DEV_HARNESS_GESTOR_MSG_ID)) return

  await ensureAtlasGestorRole(remote, tenant, atlasId)

  let plan: GestorPlanView | undefined
  try {
    const pack = unwrap<ProposeGestorAssembleView>(
      await remote.proposeGestorAssemble({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        gestorId: atlasId,
        id: DEV_HARNESS_GESTOR_PLAN_ID,
        goal: 'Monte um time para o Site',
      }) as ProposeGestorAssembleView | { ok: boolean; value?: ProposeGestorAssembleView },
    )
    plan = pack.plan
  } catch {
    if (remote.listGestorPlans !== undefined) {
      const open = unwrap<readonly GestorPlanView[]>(await remote.listGestorPlans({ workspaceId: tenant.workspaceId }))
      plan = open.find(row => row.id === DEV_HARNESS_GESTOR_PLAN_ID)
    }
  }
  if (plan === undefined || plan.status !== 'proposed') return

  const channelPage = messageClock === undefined
    ? await Promise.resolve(remote.listMessages({
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      streamKind: 'channel',
      ownerId: tenant.channelId,
      actorId: tenant.memberId,
      afterSeq: 0,
      limit: 300,
    }))
    : null
  const at = messageClock !== undefined
    ? messageClock.next()
    : devHarnessMessageTimes(channelPage!.events, 1)[0]!
  const body = `${plan.summary.trim()}${gestorPlanMarker(plan.id)}`
  try {
    await Promise.resolve(remote.postMessage({
      id: DEV_HARNESS_GESTOR_MSG_ID,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      streamKind: 'channel',
      ownerId: tenant.channelId,
      body,
      actorId: atlasId,
      subjectId: DEV_HARNESS_GESTOR_MSG_ID,
      occurredAt: at,
      topicId: DEFAULT_CONVERSATION_SUBJECT_ID,
    }))
  } catch {
    /* duplicate */
  }
}

/** Dev harness posts: occurredAt strictly after existing stream tail (seq order matches clock). */
export function devHarnessMessageTimes(
  existing: readonly { occurredAt?: string }[],
  count: number,
  nowMs: number = Date.now(),
  pendingOccurredAt: readonly string[] = [],
): string[] {
  const clock = createDevHarnessMessageClock(existing, nowMs, pendingOccurredAt)
  return Array.from({ length: count }, () => clock.next())
}

/**
 * Dev harness scenario (Probe/Muse): Miguel + animal team, #geral thread, hire approval, work ticket.
 * Gated by {@link readClientDevSeedEnabled}; idempotent via fixed message ids.
 */
export async function seedDevHarnessScenario(
  remote: DevHarnessSeedRemote,
  tenant: PersonaTenantScope,
): Promise<boolean> {
  if (!readClientDevSeedEnabled()) return false

  const scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  const onboarding = unwrap(await Promise.resolve(remote.getOnboarding(scope)))
  let team = unwrap(await Promise.resolve(remote.listTeam(tenant)))
  if (team.personas.length === 0 && remote.completeOnboarding !== undefined) {
    const personalProjectId = onboarding.personalProjectId.length > 0
      ? onboarding.personalProjectId
      : tenant.projectId
    const request: CompleteOnboardingRequest = {
      workspaceId: tenant.workspaceId,
      personalProjectId,
      displayName: 'Miguel',
      team: [...suggestedGalleryToHostTeam()],
      templateIds: [],
      runnerChoices: ['dsh'],
      cofreSeed: '',
    }
    try {
      await Promise.resolve(remote.completeOnboarding(request))
    } catch (completeError) {
      console.info('[persona] dev seed completeOnboarding', { skipped: completeError instanceof Error ? completeError.message : String(completeError) })
    }
    team = unwrap(await Promise.resolve(remote.listTeam(tenant)))
  }
  if (team.personas.length === 0) {
    await seedDevTeamIfEmpty(remote, tenant)
    team = unwrap(await Promise.resolve(remote.listTeam(tenant)))
  }

  const atlasId = personaIdByName(team, 'Atlas')
  const bentoId = personaIdByName(team, 'Bento')
  const ninaId = personaIdByName(team, 'Nina')
  const channelId = tenant.channelId
  const channelPage = await Promise.resolve(remote.listMessages({
    workspaceId: tenant.workspaceId,
    projectId: tenant.projectId,
    streamKind: 'channel',
    ownerId: channelId,
    actorId: tenant.memberId,
    afterSeq: 0,
    limit: 300,
  }))
  const messageClock = createDevHarnessMessageClock(channelPage.events)

  const postDrafts: readonly {
    readonly id: string
    readonly actorId: string
    readonly body: string
  }[] = [
    {
      id: DEV_HARNESS_SCENARIO_MARKER,
      actorId: tenant.memberId,
      body: 'Bom dia, equipe! Preciso fechar a proposta de contratação até amanhã.',
    },
    {
      id: 'dev-harness-v1-atlas',
      actorId: atlasId ?? tenant.memberId,
      body: 'Coloquei no quadro e pedi à Nina uma revisão das cláusulas.',
    },
    {
      id: 'dev-harness-v1-nina',
      actorId: ninaId ?? tenant.memberId,
      body: 'Encontrei dois pontos que precisam da sua aprovação antes de enviar.',
    },
    {
      id: 'dev-harness-v1-bento',
      actorId: bentoId ?? tenant.memberId,
      body: 'Já deixei o rascunho do contrato no Cofre.',
    },
  ]
  const posts = postDrafts.map(post => ({ ...post, at: messageClock.next() }))

  for (const post of posts) {
    if (await hasChannelMessage(remote, tenant, post.id)) continue
    try {
      await Promise.resolve(remote.postMessage({
        id: post.id,
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        streamKind: 'channel',
        ownerId: channelId,
        body: post.body,
        actorId: post.actorId,
        subjectId: post.id,
        occurredAt: post.at,
        topicId: DEFAULT_CONVERSATION_SUBJECT_ID,
      }))
    } catch {
      /* duplicate */
    }
  }

  const hireId = 'dev-harness-v1-hire'
  const approvals = remote.listApprovals !== undefined
    ? await Promise.resolve(unwrap(remote.listApprovals!(tenant)))
    : []
  if (remote.proposeHire !== undefined && atlasId !== undefined && !approvals.some(row => row.id === hireId)) {
    try {
      await Promise.resolve(remote.proposeHire({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        id: hireId,
        creatorPersonaId: atlasId,
        name: 'Cláusulas de rescisão',
        title: 'Aprovar envio do contrato',
        description: 'Dois pontos da Nina precisam da sua decisão antes do envio.',
      }))
    } catch {
      /* duplicate */
    }
  }

  if (atlasId !== undefined) {
    await seedDevHarnessGestorPlanMessage(remote, tenant, atlasId, messageClock)
    await seedDevHarnessBrainGrant(remote, tenant, atlasId)
  }

  return true
}

/** Dogfood AG-004: remembered grant for Permissões UI — dev harness only. */
async function seedDevHarnessBrainGrant(
  remote: DevHarnessSeedRemote,
  tenant: PersonaTenantScope,
  personaId: string,
): Promise<void> {
  if (!readClientDevSeedEnabled()) return
  if (remote.grantBrainPermission === undefined) return
  const scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  const existing = remote.listBrainPermissions !== undefined
    ? unwrap(await Promise.resolve(remote.listBrainPermissions(tenant)))
    : []
  if (existing.some(row => row.id === DEV_HARNESS_BRAIN_GRANT_ID)) return
  try {
    await Promise.resolve(remote.grantBrainPermission({
      ...scope,
      id: DEV_HARNESS_BRAIN_GRANT_ID,
      personaId,
      action: 'reply-whatsapp',
      target: 'clientes-aprovados',
      validity: 'until-revoke',
    }))
  } catch {
    /* duplicate or host unavailable */
  }
}

/**
 * Dev harness only (`persona.devSeed.v1`). Legacy roster RPC when host onboarding is unavailable.
 */
export async function seedDevTeamIfEmpty(remote: PersonaCreatorRemote, tenant: PersonaTenantScope): Promise<boolean> {
  if (!readClientDevSeedEnabled()) return false
  const team = await Promise.resolve(remote.listTeam(tenant))
  if (team.personas.length > 0) return false

  for (const persona of SUGGESTED_TEAM_GALLERY) {
    try {
      await Promise.resolve(remote.createPersona({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        id: persona.id,
        name: persona.name,
        title: persona.title,
        description: persona.title,
        personality: 'Proativo e claro.',
        instructions: 'Trabalhe até concluir; reporte com evidência.',
        avatarKind: 'gallery',
        avatarRef: persona.avatarRef,
        runnerKind: 'dsh',
        runnerCli: '',
        runnerModel: 'default',
        canRecruit: persona.canRecruit,
        createdBy: tenant.memberId,
        systemRoles: [...persona.systemRoles],
      }))
    } catch {
      /* duplicate or race */
    }
  }
  return true
}

/** @deprecated Use {@link seedDevHarnessScenario}. */
export const seedDefaultTeamIfEmpty = seedDevTeamIfEmpty

/** @deprecated Use {@link galleryRefForRosterPerson}. */
export function avatarRefForPersonaName(name: string): string {
  return galleryRefForRosterPerson({ name, role: '' })
}
