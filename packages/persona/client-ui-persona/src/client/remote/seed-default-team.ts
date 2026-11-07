import { pickUnusedGalleryAnimal } from '../hire/gallery-animals.ts'
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
import { seedDevTeam30 } from './dev-seed-team30.ts'

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
  const refs = rosterGalleryRefs(roster)
  return roster.map((person, index) => {
    const systemRoles = person.systemRoles ?? []
    return {
      name: person.name,
      title: person.role,
      description: person.role,
      personality: 'Proativo e claro.',
      instructions: 'Trabalhe até concluir; reporte com evidência.',
      avatarKind: 'gallery',
      avatarRef: refs[index] ?? galleryRefForRosterPerson(person),
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
export function galleryRefForRosterPerson(person: OnboardingRosterPerson, used: readonly string[] = []): string {
  if (person.galleryRef !== undefined && person.galleryRef.length > 0) return person.galleryRef
  // Muse (D-069): toda persona nasce com um bicho padrão, o 1º livre da galeria; o slug do nome NÃO é um animal e fazia o rosto cair nas iniciais.
  return pickUnusedGalleryAnimal(used)
}

/**
 * Os bichos de TODA a equipe do onboarding, na ordem: quem já escolheu um animal o mantém e quem não escolheu ganha o 1º livre da galeria
 * (sem repetir um que outro da equipe já tem).
 */
export function rosterGalleryRefs(roster: readonly OnboardingRosterPerson[], alreadyOnTeam: readonly string[] = []): readonly string[] {
  const used = [...alreadyOnTeam, ...roster.flatMap(person => (person.galleryRef !== undefined && person.galleryRef.length > 0 ? [person.galleryRef] : []))]
  return roster.map((person) => {
    const ref = galleryRefForRosterPerson(person, used)
    if (person.galleryRef === undefined || person.galleryRef.length === 0) used.push(ref)
    return ref
  })
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
  listTeam(request: { readonly workspaceId: string; readonly projectId: string }): { personas: readonly { id: string; name: string }[] }
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
  proposeSkill?(request: {
    workspaceId: string
    projectId: string
    id: string
    skillId: string
    title: string
    creatorPersonaId: string
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
    limit: 200,
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
      limit: 200,
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
  let team = unwrap(await Promise.resolve(remote.listTeam({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })))
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
    team = unwrap(await Promise.resolve(remote.listTeam({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })))
  }
  if (team.personas.length === 0) {
    await seedDevTeamIfEmpty(remote, tenant)
    team = unwrap(await Promise.resolve(remote.listTeam({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })))
  }
  // Capturas da barra única com 30 personas (CV-1): só com `persona.devSeed.v1` E `persona.devSeed.team30`; sem as duas, nada.
  await seedDevTeam30(remote, tenant)

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
    limit: 200,
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

  await seedDevHarnessDecisions(remote, tenant, atlasId, approvals)
  await seedDevHarnessThreadCards(remote, tenant, team.personas, messageClock)

  if (atlasId !== undefined) {
    await seedDevHarnessGestorPlanMessage(remote, tenant, atlasId, messageClock)
    await seedDevHarnessBrainGrant(remote, tenant, atlasId)
  }

  return true
}

/**
 * Captures of the single decision cycle need several cards ("Aprovar" on the line, "Ver todas (n)"). Opt-in, dev only:
 * `localStorage['persona.devSeed.decisions'] = '1'`.
 */
const DEV_DECISIONS_KEY = 'persona.devSeed.decisions'
const DEV_DECISIONS_RUN_KEY = 'persona.devSeed.decisionsRun'
const DEV_HARNESS_SKILLS: readonly { readonly id: string; readonly title: string }[] = [
  { id: 'dev-harness-v1-skill-1', title: 'Resumo semanal das vendas' },
  { id: 'dev-harness-v1-skill-2', title: 'Lembrete de contratos a vencer' },
  { id: 'dev-harness-v1-skill-3', title: 'Revisão ortográfica dos textos' },
]

async function seedDevHarnessDecisions(
  remote: DevHarnessSeedRemote,
  tenant: PersonaTenantScope,
  atlasId: string | undefined,
  approvals: readonly { id: string }[],
): Promise<void> {
  if (atlasId === undefined || remote.proposeSkill === undefined || !readClientDevSeedEnabled()) return
  try {
    if (localStorage.getItem(DEV_DECISIONS_KEY) !== '1') return
  } catch {
    return
  }
  // A capture that DECIDES these cards (the inbox's out-of-order and batch proofs) shares one host with the next capture:
  // `persona.devSeed.decisionsRun` gives that capture its own set of ids, so it starts from fresh cards.
  let run = ''
  try {
    run = localStorage.getItem(DEV_DECISIONS_RUN_KEY) ?? ''
  } catch {
    run = ''
  }
  for (const skill of DEV_HARNESS_SKILLS) {
    const id = `${skill.id}${run}`
    if (approvals.some(row => row.id === id)) continue
    try {
      await Promise.resolve(remote.proposeSkill({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        id,
        skillId: id,
        title: skill.title,
        creatorPersonaId: atlasId,
      }))
    } catch {
      /* duplicate */
    }
  }
}

/**
 * Captures of the cards that live in the #geral thread (IV-10's structured question with chips, P1-9's "Proposta de {persona}") need their
 * messages in the host: the card is read from the marker at the end of the body, like the Gestor's plan. Opt-in, dev only:
 * `localStorage['persona.devSeed.threadCards'] = '1'`. Only the OPEN states can be seeded this way (the live state — answered, accepted — is
 * the host's own record, `listPersonaAsks` / `listTaskProposals`); the ids below are never real tickets.
 */
const DEV_THREAD_CARDS_KEY = 'persona.devSeed.threadCards'

async function seedDevHarnessThreadCards(
  remote: DevHarnessSeedRemote,
  tenant: PersonaTenantScope,
  personas: readonly { readonly id: string; readonly name: string }[],
  messageClock?: DevHarnessMessageClock,
): Promise<void> {
  if (!readClientDevSeedEnabled() || messageClock === undefined) return
  try {
    if (localStorage.getItem(DEV_THREAD_CARDS_KEY) !== '1') return
  } catch {
    return
  }
  const named = (name: string): { readonly id: string; readonly name: string } | undefined => personas.find(row => row.name === name)
  const atlas = named('Atlas')
  const nina = named('Nina')
  const bento = named('Bento')
  if (atlas === undefined || nina === undefined || bento === undefined) return
  const option = (id: string, label: string): { readonly id: string; readonly label: string } => ({ id, label })
  const posts: readonly { readonly id: string; readonly actorId: string; readonly body: string }[] = [
    {
      id: 'dev-harness-v1-ask-single',
      actorId: atlas.id,
      body: [
        'Atlas pergunta: O que a sua empresa faz? Com isso eu monto uma equipe pronta, e você só confere.',
        'Opções: Padaria · Agência · Loja online · Clínica ou consultório · Escritório de serviços · Outra coisa',
        `[[persona-ask:${JSON.stringify({
          askId: 'dev-ask-1', ticketId: 'dev-ticket-ask-1', personaId: atlas.id, personaName: atlas.name,
          question: 'O que a sua empresa faz? Com isso eu monto uma equipe pronta, e você só confere.',
          options: [option('padaria', 'Padaria'), option('agencia', 'Agência'), option('loja', 'Loja online'), option('clinica', 'Clínica ou consultório'), option('escritorio', 'Escritório de serviços'), option('outra', 'Outra coisa')],
          multiple: false, step: { index: 1, total: 3 },
        })}]]`,
      ].join('\n'),
    },
    {
      id: 'dev-harness-v1-ask-multiple',
      actorId: atlas.id,
      body: [
        'Atlas pergunta: O que mais toma o seu tempo hoje?',
        'Opções: Responder clientes · Cobrar quem atrasou · Postar nas redes · Fazer orçamentos · Organizar a agenda · Controlar o estoque',
        `[[persona-ask:${JSON.stringify({
          askId: 'dev-ask-2', ticketId: 'dev-ticket-ask-2', personaId: atlas.id, personaName: atlas.name,
          question: 'O que mais toma o seu tempo hoje?',
          options: [option('clientes', 'Responder clientes'), option('cobrar', 'Cobrar quem atrasou'), option('redes', 'Postar nas redes'), option('orcamentos', 'Fazer orçamentos'), option('agenda', 'Organizar a agenda'), option('estoque', 'Controlar o estoque')],
          multiple: true, step: { index: 2, total: 3 },
        })}]]`,
      ].join('\n'),
    },
    {
      id: 'dev-harness-v1-proposal-single',
      actorId: nina.id,
      body: [
        'Nina sugeriu: Posso retomar “Relatório de sexta”? (Está parado há 3 dias.)',
        `[[task-proposal:${JSON.stringify({
          kind: 'single',
          items: [{ id: 'dev-proposal-1', personaId: nina.id, personaName: nina.name, question: 'Posso retomar “Relatório de sexta”?', reason: 'Está parado há 3 dias.' }],
        })}]]`,
      ].join('\n'),
    },
    {
      id: 'dev-harness-v1-proposal-digest',
      actorId: atlas.id,
      body: [
        'A equipe tem 3 sugestões para você. Abra a Persona para responder.',
        `[[task-proposal:${JSON.stringify({
          kind: 'digest',
          items: [
            { id: 'dev-proposal-2', personaId: nina.id, personaName: nina.name, question: 'Posso retomar “Relatório de sexta”?', reason: 'Está parado há 3 dias.' },
            { id: 'dev-proposal-3', personaId: bento.id, personaName: bento.name, question: 'Posso destravar “Formulário de pedidos”?', reason: 'Falta o preço do bolo de cenoura.' },
            { id: 'dev-proposal-4', personaId: atlas.id, personaName: atlas.name, question: 'Posso dar o próximo passo em “Site da padaria”?', reason: 'O objetivo está aberto e nada está andando.' },
          ],
        })}]]`,
      ].join('\n'),
    },
  ]
  for (const post of posts) {
    if (await hasChannelMessage(remote, tenant, post.id)) continue
    try {
      await Promise.resolve(remote.postMessage({
        id: post.id,
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        streamKind: 'channel',
        ownerId: tenant.channelId,
        body: post.body,
        actorId: post.actorId,
        subjectId: post.id,
        occurredAt: messageClock.next(),
        topicId: DEFAULT_CONVERSATION_SUBJECT_ID,
      }))
    } catch {
      /* duplicate */
    }
  }
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
  const team = await Promise.resolve(remote.listTeam({ workspaceId: tenant.workspaceId, projectId: tenant.projectId }))
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
