/**
 * S5 onboarding: one idempotent transaction that materializes Pessoal + team.
 * Cofre seed is proposed (approval), never written through.
 */

import { createDraftDriver, createScriptedRunner, fallbackDraft } from '@deepseek-ai/dsh-persona-runners'
import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { withDefaultGestor } from './gestor.ts'
import type { ScreensHost } from './screens.ts'
import type {
  CompleteOnboardingRequest,
  OnboardingPersonaSpec,
  OnboardingState,
} from './types.ts'

const KIND = 'onboarding'
const COMPLETE_ID = 'complete'
const SYSTEM_WELCOME = 'Boas-vindas à Persona.'
const COORD_WELCOME = 'Boas-vindas! Estou aqui para coordenar a equipe.'

/**
 * Persist and apply first-run setup.
 */
export class OnboardingHost {
  readonly product: ProductRepos
  readonly events: EventRepos
  readonly screens: ScreenRepos
  readonly proposals: ScreensHost
  readonly now: () => string

  /**
   * @param product - Workspace/personas.
   * @param events - Channel posts.
   * @param screens - Completion flag.
   * @param proposals - Memory/vault proposals.
   * @param now - Instant factory.
   */
  constructor(
    product: ProductRepos,
    events: EventRepos,
    screens: ScreenRepos,
    proposals: ScreensHost,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.product = product
    this.events = events
    this.screens = screens
    this.proposals = proposals
    this.now = now
  }

  /**
   * @param workspaceId - Workspace.
   */
  read(workspaceId: string): OnboardingState {
    const personal = this.product.listProjects(workspaceId).find(item => item.kind === 'personal')
    const completed = personal !== undefined
      && this.screens.get<{ completed: boolean }>(personal.id, KIND, COMPLETE_ID)?.completed === true
    return {
      hasPersonalProject: personal !== undefined,
      firstUse: !completed,
      personalProjectId: personal?.id ?? '',
      completed,
    }
  }

  /**
   * Drafts: overlay team, else Rivet `createDraftDriver`, else `fallbackDraft`.
   * @param request - Team or template ids.
   */
  async resolveTeam(request: CompleteOnboardingRequest): Promise<OnboardingPersonaSpec[]> {
    if (request.team.length > 0) return [...request.team]
    const seeds = request.templateIds.length > 0
      ? request.templateIds.slice(0, 8)
      : [request.displayName === '' ? 'Guia' : request.displayName]
    try {
      const driver = createDraftDriver({ runner: createScriptedRunner() })
      const drafts: OnboardingPersonaSpec[] = []
      for (const seed of seeds) drafts.push(toSpec(await driver.draftPersona(seed)))
      return drafts
    } catch {
      return seeds.map(seed => toSpec(fallbackDraft(seed)))
    }
  }

  /**
   * Idempotent first-run. Existing completion is a no-op.
   * @param request - Display name, team or templates, optional cofre seed.
   * @param drafts - Resolved team (from {@link resolveTeam} or overlay).
   */
  complete(request: CompleteOnboardingRequest, drafts?: readonly OnboardingPersonaSpec[]): OnboardingState {
    return this.product.store.tx(() => this.apply(request, drafts ?? this.teamOf(request)))
  }

  private apply(request: CompleteOnboardingRequest, drafts: readonly OnboardingPersonaSpec[]): OnboardingState {
    const existing = this.product.getWorkspace(request.workspaceId)
    if (existing === undefined) {
      this.product.createWorkspace({
        id: request.workspaceId,
        name: request.displayName === '' ? 'Pessoal' : request.displayName,
        personalProjectId: request.personalProjectId,
      })
    }
    const personal = this.product.listProjects(request.workspaceId).find(item => item.kind === 'personal')
    const projectId = personal?.id ?? request.personalProjectId
    if (this.screens.get<{ completed: boolean }>(projectId, KIND, COMPLETE_ID)?.completed === true) {
      return this.read(request.workspaceId)
    }
    if (this.product.getMember('owner') === undefined && this.product.listMembers(request.workspaceId).length === 0) {
      this.product.createMember({
        id: 'owner',
        workspaceId: request.workspaceId,
        displayName: request.displayName === '' ? 'Você' : request.displayName,
        handle: slug(request.displayName === '' ? 'voce' : request.displayName),
        role: 'owner',
      })
    }
    if (this.product.getChannel('geral') === undefined) {
      this.product.createChannel({
        id: 'geral',
        workspaceId: request.workspaceId,
        projectId,
        name: 'geral',
        topic: '',
      })
    }
    const createdAt = this.now()
    drafts.forEach((draft, index) => {
      if (this.product.getPersona(`onb-${index + 1}`) !== undefined) return
      this.product.createPersona({
        id: `onb-${index + 1}`,
        workspaceId: request.workspaceId,
        name: draft.name,
        title: draft.title,
        description: draft.description,
        personality: draft.personality,
        instructions: draft.instructions,
        avatar: { kind: draft.avatarKind, ref: draft.avatarRef },
        runner: runnerOfDraft(draft, request.runnerChoices),
        tools: {},
        skills: [],
        limits: {},
        systemRoles: withDefaultGestor(draft.systemRoles),
        canRecruit: draft.canRecruit,
        createdAt,
        updatedAt: createdAt,
        createdBy: 'owner',
      }, projectId)
    })
    const seed = request.cofreSeed.trim()
    if (seed !== '') {
      this.proposals.proposeMemory({
        workspaceId: request.workspaceId,
        projectId,
        id: 'onb-cofre',
        authorId: 'owner',
        body: seed,
      })
    }
    const coord = this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
    if (!this.events.has('onb-welcome')) {
      this.events.append({
        id: 'onb-welcome',
        workspaceId: request.workspaceId,
        projectId,
        streamKind: 'channel',
        ownerId: 'geral',
        type: 'message',
        body: coord === undefined ? SYSTEM_WELCOME : COORD_WELCOME,
        actorId: coord?.id ?? 'system',
        subjectId: 'welcome',
        occurredAt: this.now(),
      })
    }
    this.screens.put(projectId, KIND, COMPLETE_ID, { completed: true })
    return this.read(request.workspaceId)
  }

  private teamOf(request: CompleteOnboardingRequest): OnboardingPersonaSpec[] {
    if (request.team.length > 0) return [...request.team]
    if (request.templateIds.length === 0) {
      return [toSpec(fallbackDraft(request.displayName === '' ? 'Guia' : request.displayName))]
    }
    return request.templateIds.slice(0, 8).map(id => toSpec(fallbackDraft(id)))
  }
}

function toSpec(draft: ReturnType<typeof fallbackDraft>): OnboardingPersonaSpec {
  return {
    name: draft.name,
    title: draft.title,
    description: draft.description,
    personality: draft.personality,
    instructions: draft.instructions,
    avatarKind: draft.avatarKind,
    avatarRef: draft.avatarRef,
    runnerKind: draft.runnerKind,
    runnerCli: draft.runnerCli,
    runnerModel: draft.runnerModel,
    canRecruit: draft.canRecruit,
    systemRoles: withDefaultGestor(draft.systemRoles),
  }
}

/** First-run ask id on #geral (`firstDeliveryAsk` from the engine). */
export const FIRST_DELIVERY_EVENT_ID = 'first-delivery'

/** Feed event for the sealed milestone. Append only — do not ingest. */
export const FIRST_DELIVERY_MILESTONE_EVENT_ID = 'first-delivery-milestone'

function runnerOfDraft(
  draft: OnboardingPersonaSpec,
  choices: readonly string[],
): { kind: 'dsh'; model: string } | { kind: 'cli'; cli: 'claude' | 'codex' | 'opencode' | 'cursor'; model: string } {
  const model = draft.runnerModel === '' ? 'default' : draft.runnerModel
  if (draft.runnerKind === 'cli' && isCli(draft.runnerCli)) {
    return { kind: 'cli', cli: draft.runnerCli, model }
  }
  const chosen = choices.find(isCli)
  if (chosen !== undefined) return { kind: 'cli', cli: chosen, model }
  return { kind: 'dsh', model }
}

function isCli(value: string): value is 'claude' | 'codex' | 'opencode' | 'cursor' {
  return value === 'claude' || value === 'codex' || value === 'opencode' || value === 'cursor'
}

function slug(value: string): string {
  const trimmed = value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
  return trimmed === '' ? 'voce' : trimmed.slice(0, 32)
}
