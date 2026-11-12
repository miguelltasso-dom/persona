/**
 * Host remotes for Lumen screens: invites, import, rules, approvals, memory, skills.
 */

import { randomBytes } from 'node:crypto'
import {
  IMPORT_ADAPTERS,
  applyImport,
  applyVaultProposal,
  inviteStatus,
  issueInvite,
  nextSkillVersion,
  personaPropose,
  previewImport,
  proposeVaultUpdate,
  redeemInvite,
  revokeInvite,
  rollbackImport,
  rollbackSkill,
  type PersonaProposal,
  type PersonaSpec,
  type SkillRecord,
  type VaultProposal,
} from '@deepseek-ai/dsh-persona-core'
import {
  ScreenRepos,
  SqliteImportStore,
  SqliteInviteBook,
  type ProductRepos,
  type VaultRepos,
  type StoredPersona,
} from '@deepseek-ai/dsh-persona-store'
import { canSaveFiles } from './file-tools.ts'
import { resolveHireIdentity, type HireIdentity } from './hire-identity.ts'
import { HouseRules, KIND_QUIET, KIND_RULE, isHouseRuleKind } from './house-rules.ts'
import { memoryProofOf } from './owner-memory.ts'
import { declinePlaybookOffer } from './playbook.ts'
import type { Orchestration } from './orchestration.ts'
import type {
  ApprovalView,
  CanvasEdgeView,
  CanvasGraphView,
  CanvasNodeView,
  ConfirmImportRequest,
  DailySummaryView,
  DecideApprovalRequest,
  ImportBatchView,
  ImportPreviewView,
  InviteView,
  IssueInviteRequest,
  MemoryView,
  MemoryWriteRequest,
  ProjectLimitsView,
  ProposeHireRequest,
  ProposeSkillRequest,
  ProposeVaultRequest,
  PutQuietWindowRequest,
  PutSkillRequest,
  PutTriageRuleRequest,
  QuietWindowView,
  RedeemInviteRequest,
  ReviseSkillRequest,
  SimulateTriageRequest,
  SkillView,
  TriageLogView,
  TriageRuleView,
} from './types.ts'

const KIND_LIMITS = 'project_limits'
const KIND_HIRE = 'hire_proposal'
const KIND_VAULT = 'vault_proposal'
const KIND_SKILL_PROP = 'skill_proposal'
const KIND_MEMORY = 'memory_proposal'
const KIND_SKILL = 'skill'
/** Item 26.10/26.11: a version downloaded from the skill's source, waiting for the person's approval. */
const KIND_SKILL_UPDATE = 'skill_update'
const KIND_LOG = 'triage_log'
const LIMITS_ID = 'default'

interface StoredSkill extends SkillRecord {
  readonly history: readonly string[]
  readonly sharedWithTeam: boolean
  /** Item 26.10: where an imported skill came from (absent for one the person wrote). */
  readonly source?: { readonly url: string; readonly ref: string; readonly hash: string }
  /** Item 26.10: the body came from outside: it is DATA, never instructions to the host. */
  readonly untrusted?: boolean
}

interface MemoryProposal {
  readonly id: string
  readonly body: string
  readonly authorId: string
}

interface SkillProposal {
  readonly id: string
  readonly skillId: string
  readonly title: string
  readonly status: 'pending' | 'approved' | 'rejected'
  readonly creatorPersonaId: string
  readonly question?: string
}

/**
 * Screen remotes. Persistence is SQLite `screen_doc` plus invite/import/vault.
 */
export class ScreensHost {
  readonly product: ProductRepos
  readonly vault: VaultRepos
  readonly screens: ScreenRepos
  /** HONEST-1: the rules and windows the host obeys, and the books of how many times they applied. */
  readonly houseRules: HouseRules
  readonly invites: SqliteInviteBook
  readonly imports: SqliteImportStore
  readonly orchestration: Orchestration
  readonly now: () => string
  readonly nowMs: () => number

  /**
   * @param product - Members and personas.
   * @param vault - Memory records.
   * @param screens - JSON documents.
   * @param invites - Invite book.
   * @param imports - Import batches.
   * @param orchestration - Attention tickets.
   * @param initializePersona - Assigns the new hire's human responsibility and initiative ownership.
   * @param now - Instant factory.
   * @param nowMs - Epoch ms.
   */
  constructor(
    product: ProductRepos,
    vault: VaultRepos,
    screens: ScreenRepos,
    invites: SqliteInviteBook,
    imports: SqliteImportStore,
    orchestration: Orchestration,
    readonly initializePersona: (persona: StoredPersona) => void,
    now: () => string = () => new Date().toISOString(),
    nowMs: () => number = () => Date.now(),
  ) {
    this.product = product
    this.vault = vault
    this.screens = screens
    this.houseRules = new HouseRules(screens, now)
    this.invites = invites
    this.imports = imports
    this.orchestration = orchestration
    this.now = now
    this.nowMs = nowMs
  }

  /**
   * @param request - Invite fields.
   */
  issue(request: IssueInviteRequest): InviteView {
    const token = request.token === '' ? randomBytes(16).toString('hex') : request.token
    const invite = issueInvite(this.nowMs(), {
      id: request.inviteId,
      workspaceId: request.workspaceId,
      token,
      grant: { workspaceRole: request.role, projectIds: [request.projectId], channelIds: [], dmIds: [] },
    })
    this.invites.putInvite(invite)
    return toInviteView(invite, this.nowMs())
  }

  /**
   * @param workspaceId - Workspace.
   */
  listInvites(workspaceId: string): InviteView[] {
    const clock = this.nowMs()
    return this.invites.listInvites(workspaceId).map(invite => toInviteView(invite, clock))
  }

  /**
   * @param request - Token and new member.
   */
  redeem(request: RedeemInviteRequest): InviteView {
    const invite = this.invites.getInviteByToken(request.workspaceId, request.token)
    if (invite === undefined) throw new Error('invite-not-found')
    const actor = {
      kind: 'user' as const,
      id: request.memberId,
      workspaceId: request.workspaceId,
      workspaceRole: 'guest' as const,
      projectIds: [] as string[],
    }
    const redeemed = redeemInvite(invite, this.nowMs(), actor)
    this.invites.putInvite(redeemed.invite)
    this.invites.putActor(redeemed.actor)
    this.product.createMember({
      id: request.memberId,
      workspaceId: request.workspaceId,
      displayName: request.displayName,
      handle: request.handle,
      role: redeemed.invite.grant.workspaceRole === 'member' ? 'member' : 'guest',
    })
    return toInviteView(redeemed.invite, this.nowMs())
  }

  /**
   * @param workspaceId - Workspace.
   * @param inviteId - Invite.
   */
  revoke(workspaceId: string, inviteId: string): InviteView {
    const invite = this.invites.getInvite(inviteId)
    if (invite === undefined || invite.workspaceId !== workspaceId) throw new Error('invite-not-found')
    const next = revokeInvite(invite, this.nowMs())
    this.invites.putInvite(next)
    return toInviteView(next, this.nowMs())
  }

  /**
   * @param files - User files.
   */
  preview(files: readonly { name: string; text: string }[]): ImportPreviewView {
    const preview = previewImport(IMPORT_ADAPTERS, files)
    return {
      adapterId: preview.adapterId,
      accepted: preview.accepted.length,
      rejected: preview.rejected.length,
      bodies: preview.accepted.map(item => item.body),
    }
  }

  /**
   * @param request - Batch id and files.
   */
  confirm(request: ConfirmImportRequest): ImportBatchView {
    const preview = previewImport(IMPORT_ADAPTERS, request.files)
    const batch = applyImport(this.imports, preview, request.batchId)
    for (const row of batch.applied) {
      this.screens.put(request.projectId, KIND_MEMORY, `import:${row.externalId}`, {
        id: `import:${row.externalId}`,
        body: row.body,
        authorId: 'import',
      })
    }
    return toBatchView(batch)
  }

  /**
   * @param batchId - Batch.
   */
  importBatch(batchId: string): ImportBatchView {
    const batch = this.imports.getBatch(batchId)
    if (batch === undefined) throw new Error('import-not-found')
    return toBatchView(batch)
  }

  /**
   * @param batchId - Batch.
   */
  rollback(batchId: string): ImportBatchView {
    return toBatchView(rollbackImport(this.imports, batchId))
  }

  /**
   * @param projectId - Tenant.
   */
  listRules(projectId: string): TriageRuleView[] {
    return this.houseRules.rules(projectId).map(row => this.houseRules.ruleView(projectId, row))
  }

  /**
   * @param request - Rule.
   */
  putRule(request: PutTriageRuleRequest): TriageRuleView {
    // HONEST-1: only a kind the host obeys is stored as a lock; anything else is refused, never kept as if it worked.
    if (request.kind !== undefined && !isHouseRuleKind(request.kind)) throw new Error('rule-kind-unknown')
    const row: TriageRuleView = {
      id: request.id,
      gateText: request.gateText,
      assessmentText: request.assessmentText,
      logOnly: request.logOnly,
      speculativeEnabled: request.speculativeEnabled,
      ...(request.kind === undefined ? {} : { kind: request.kind }),
    }
    this.screens.put(request.projectId, KIND_RULE, request.id, row)
    return this.houseRules.ruleView(request.projectId, row)
  }

  /**
   * @param projectId - Tenant.
   * @param id - Rule.
   */
  deleteRule(projectId: string, id: string): boolean {
    this.screens.delete(projectId, KIND_RULE, id)
    this.houseRules.forget(projectId, id)
    return true
  }

  /**
   * @param projectId - Tenant.
   */
  listQuiet(projectId: string): QuietWindowView[] {
    return this.houseRules.windows(projectId).map(row => this.houseRules.windowView(projectId, row))
  }

  /**
   * Turn a quiet window OFF by removing it. What it held back stays in the book (the history is the team's); putting the same window back is `putQuiet`.
   * @param projectId - Tenant.
   * @param id - Window.
   * @returns Whether the window existed.
   */
  deleteQuiet(projectId: string, id: string): boolean {
    if (this.screens.get<QuietWindowView>(projectId, KIND_QUIET, id) === undefined) return false
    this.screens.delete(projectId, KIND_QUIET, id)
    return true
  }

  /**
   * @param request - Window.
   */
  putQuiet(request: PutQuietWindowRequest): QuietWindowView {
    const row: QuietWindowView = {
      id: request.id, label: request.label, start: request.start, end: request.end,
    }
    this.screens.put(request.projectId, KIND_QUIET, request.id, row)
    return this.houseRules.windowView(request.projectId, row)
  }

  /**
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   */
  getLimits(workspaceId: string, projectId: string): ProjectLimitsView {
    return this.screens.get<ProjectLimitsView>(projectId, KIND_LIMITS, LIMITS_ID) ?? {
      workspaceId, projectId, maxProposalsPerDay: 3, tokensPerPersonaMonth: 50_000, tokensPerProjectMonth: 200_000,
    }
  }

  /**
   * @param row - Limits.
   */
  setLimits(row: ProjectLimitsView): ProjectLimitsView {
    this.screens.put(row.projectId, KIND_LIMITS, LIMITS_ID, row)
    return row
  }

  /**
   * @param projectId - Tenant.
   */
  listLog(projectId: string): TriageLogView[] {
    return this.screens.list<TriageLogView>(projectId, KIND_LOG)
  }

  /**
   * @param request - Rule and text.
   */
  simulate(request: SimulateTriageRequest): TriageLogView {
    const rule = this.screens.get<TriageRuleView>(request.projectId, KIND_RULE, request.ruleId)
    const mode = rule?.logOnly === false ? 'execute' : 'logOnly'
    const row: TriageLogView = {
      id: `log:${request.ruleId}:${this.now()}`,
      at: this.now(),
      summary: rule === undefined
        ? `Regra ${request.ruleId} ausente.`
        : `Teria aplicado «${rule.gateText}» a «${request.text.slice(0, 80)}».`,
      mode,
      threadId: request.ruleId,
      gateText: rule?.gateText ?? '',
      assessmentText: rule?.assessmentText ?? '',
      decidedBy: 'simulate',
      reason: mode,
    }
    this.screens.put(request.projectId, KIND_LOG, row.id, row)
    return row
  }

  /**
   * @param request - Hire spec.
   */
  proposeHire(request: ProposeHireRequest): ApprovalView {
    const creator = this.product.getPersona(request.creatorPersonaId)
    if (creator === undefined) throw new Error('persona-not-found')
    // The card must not show the name or face of someone already on the team (A-4).
    const identity = this.hireIdentity(request.projectId, request.name, '')
    const proposal = personaPropose({
      id: request.id,
      workspaceId: request.workspaceId,
      creator,
      spec: {
        name: identity.name,
        avatar: { kind: 'gallery', ref: identity.avatarRef },
        title: request.title,
        description: request.description,
        personality: 'Proposta.',
        instructions: 'Aguardando aprovação.',
        runner: { kind: 'dsh', model: 'default' },
        tools: canSaveFiles(creator.tools) ? { files: 'write' } : {}, // D-099: never more access than the persona who hires her
        skills: [],
        limits: {},
        systemRoles: [],
        canRecruit: false,
      },
      policy: 'approval',
      createdAt: this.now(),
    })
    const reason = request.reason?.trim() ?? ''
    const stored: StoredHire = reason === '' ? proposal : { ...proposal, reason }
    this.screens.put(request.projectId, KIND_HIRE, request.id, stored)
    return hireCard(stored, this.personaName(request.projectId, request.creatorPersonaId))
  }

  /**
   * Name and animal for a proposed hire: never one already on the team or in another pending proposal.
   * @param projectId - Tenant.
   * @param name - Requested name.
   * @param avatarRef - Requested gallery ref (empty ⇒ derived from the name).
   */
  private hireIdentity(projectId: string, name: string, avatarRef: string): HireIdentity {
    const pending = this.screens.list<StoredHire>(projectId, KIND_HIRE).filter(row => row.status === 'pending')
    const refOf = (avatar: { kind: string; ref?: string }): string => (avatar.kind === 'gallery' ? (avatar.ref ?? '') : '')
    return resolveHireIdentity(name, avatarRef, {
      names: [...this.product.listPersonas(projectId).map(persona => persona.name), ...pending.map(row => row.spec.name)],
      avatarRefs: [
        ...this.product.listPersonas(projectId).map(persona => refOf(persona.avatar)),
        ...pending.map(row => refOf(row.spec.avatar)),
      ],
    })
  }

  /**
   * @param request - Vault edit.
   */
  proposeVault(request: ProposeVaultRequest): ApprovalView {
    const record = this.vault.getRecord(request.recordId)
    if (record === undefined) throw new Error('vault-not-found')
    const proposal = proposeVaultUpdate({
      id: request.id,
      creator: {
        kind: 'persona',
        id: request.creatorPersonaId,
        workspaceId: request.workspaceId,
        workspaceRole: 'member',
        projectIds: [request.projectId],
      },
      current: record,
      nextBody: request.nextBody,
      nextVisibility: record.visibility,
      policy: 'approval',
      createdAt: this.now(),
    })
    this.screens.put(request.projectId, KIND_VAULT, request.id, proposal)
    return vaultCard(proposal, this.personaName(request.projectId, request.creatorPersonaId))
  }

  /**
   * @param request - Skill card.
   */
  proposeSkill(request: ProposeSkillRequest): ApprovalView {
    const row: SkillProposal = {
      id: request.id, skillId: request.skillId, title: request.title, status: 'pending',
      creatorPersonaId: request.creatorPersonaId,
      ...(request.question === undefined ? {} : { question: request.question }),
    }
    this.screens.put(request.projectId, KIND_SKILL_PROP, request.id, row)
    return {
      id: row.id, kind: 'skill', title: row.title, question: row.question ?? `Ativar ${row.title}?`,
      status: 'pending', personaId: request.creatorPersonaId, personaName: this.personaName(request.projectId, request.creatorPersonaId),
      permissionAction: 'skill.activate', permissionTarget: `skill:${row.skillId}`,
    }
  }

  /**
   * Persist a real intake decision (gate + assessment) for a thread.
   * @param projectId - Tenant.
   * @param entry - Trail line without id.
   */
  recordTriage(projectId: string, entry: Omit<TriageLogView, 'id'>): TriageLogView {
    const row: TriageLogView = { ...entry, id: `triage:${entry.threadId}:${entry.at}` }
    this.screens.put(projectId, KIND_LOG, row.id, row)
    return row
  }

  /**
   * Today's pending proposals grouped by the proposing persona.
   * @param projectId - Tenant.
   */
  listDailySummaries(projectId: string): DailySummaryView[] {
    const date = this.now().slice(0, 10)
    const pending = this.listApprovals(projectId).filter(item => item.status === 'pending' && item.kind !== 'attention')
    const byPersona = new Map<string, DailySummaryView>()
    for (const item of pending) {
      const key = item.personaId === '' ? 'team' : item.personaId
      const existing = byPersona.get(key)
      if (existing === undefined) {
        byPersona.set(key, {
          personaId: item.personaId,
          personaName: item.personaName,
          date,
          proposals: [item],
        })
        continue
      }
      byPersona.set(key, { ...existing, proposals: [...existing.proposals, item] })
    }
    return [...byPersona.values()]
  }

  /**
   * Personas, open tickets and decisions as a spatial graph.
   * @param projectId - Tenant.
   */
  listCanvas(projectId: string): CanvasGraphView {
    const personas = this.product.listPersonas(projectId)
    const tickets = this.orchestration.runtime(projectId).repo.tickets.list()
    const nodes: CanvasNodeView[] = []
    const edges: CanvasEdgeView[] = []
    personas.forEach((persona, index) => {
      nodes.push({
        id: `persona:${persona.id}`,
        kind: 'persona',
        label: persona.name,
        x: 80,
        y: 80 + index * 90,
      })
    })
    tickets.forEach((ticket, index) => {
      const nodeId = `task:${ticket.id}`
      nodes.push({
        id: nodeId,
        kind: 'task',
        label: ticket.title,
        x: 280,
        y: 80 + index * 90,
      })
      const owner = personas.find(persona => persona.name === ticket.execution?.name)
        ?? personas.find(persona => persona.systemRoles.includes('coordination'))
      if (owner !== undefined) {
        edges.push({ id: `e:${owner.id}:${ticket.id}`, from: `persona:${owner.id}`, to: nodeId })
      }
    })
    return { nodes, edges }
  }

  /**
   * @param projectId - Tenant.
   */
  /** Cards of other modules (the connector requests): each returns what it has for a project. */
  readonly extraApprovals: Array<(projectId: string) => ApprovalView[]> = []

  listApprovals(projectId: string): ApprovalView[] {
    const cards: ApprovalView[] = [
      ...this.screens.list<StoredHire>(projectId, KIND_HIRE).map(row => hireCard(row, this.personaName(projectId, row.creatorPersonaId))),
      ...this.screens.list<VaultProposal>(projectId, KIND_VAULT).map(row => vaultCard(row, this.personaName(projectId, row.creatorPersonaId))),
      ...this.screens.list<SkillProposal>(projectId, KIND_SKILL_PROP).map(row => ({
        id: row.id, kind: 'skill' as const, title: row.title, question: row.question ?? `Ativar ${row.title}?`, status: row.status,
        personaId: row.creatorPersonaId, personaName: this.personaName(projectId, row.creatorPersonaId),
        permissionAction: 'skill.activate', permissionTarget: `skill:${row.skillId}`,
      })),
    ]
    for (const ticket of this.orchestration.runtime(projectId).repo.tickets.list()) {
      if (ticket.attention === undefined) continue
      const persona = this.product.listPersonas(projectId).find(row => row.name === ticket.execution?.name)
      cards.push({
        id: ticket.id, kind: 'attention', title: ticket.title, question: ticket.title, status: 'pending',
        personaId: persona?.id ?? '', personaName: ticket.execution?.name ?? '',
      })
    }
    for (const provider of this.extraApprovals) cards.push(...provider(projectId))
    return cards
  }

  /**
   * @param request - Decision.
   */
  decide(request: DecideApprovalRequest): ApprovalView {
    if (request.kind === 'hire') return this.decideHire(request)
    if (request.kind === 'vault') return this.decideVault(request)
    if (request.kind === 'skill') return this.decideSkill(request)
    if (request.kind === 'connector') throw new Error('approval-not-found') // answered by the connector requests, never here
    this.orchestration.runtime(request.projectId).engine.note(
      request.id, request.accept ? 'approved' : 'rejected',
    )
    return {
      id: request.id, kind: 'attention', title: request.id,
      question: request.id, status: request.accept ? 'approved' : 'rejected',
      personaId: '', personaName: '',
    }
  }

  private personaName(projectId: string, personaId: string): string {
    return this.product.getPersona(personaId)?.name ?? this.product.listPersonas(projectId).find(item => item.id === personaId)?.name ?? personaId
  }

  /**
   * @param projectId - Tenant.
   * @param viewerId - The member looking at the list: a memory they said themselves reads "Você disse…".
   */
  listMemory(projectId: string, viewerId: string = ''): MemoryView[] {
    const pending = this.screens.list<MemoryProposal>(projectId, KIND_MEMORY).map(row => ({
      id: row.id, body: row.body, status: 'pending' as const, origin: 'conversation' as const,
    }))
    // Item 16: a memory the owner asked for carries its proof (the words, who, where, when); a RULE the owner dictated is listed too.
    const stored = this.vault.listRecords(projectId)
      .flatMap((record): MemoryView[] => {
        const proof = memoryProofOf(this.screens, projectId, record.id)
        if (record.kind !== 'memory' && proof === undefined) return []
        // "Revisão aceita: <id do ticket>" (written by the review, not by anyone): a technical receipt, not a memory. The playbook notes what matters, quietly.
        if (record.authorId === 'review') return []
        return [{
          id: record.id, body: record.body,
          status: record.status === 'revoked' ? 'revoked' as const : 'active' as const,
          origin: 'vault' as const,
          ...(proof === undefined ? {} : {
            source: { quote: proof.quote, by: proof.by, mine: viewerId !== '' && proof.byId === viewerId, at: proof.at, where: proof.where, place: proof.place },
            scope: proof.scope,
            rule: record.kind === 'constraint',
            ...(record.visibility.kind === 'persona' ? this.dmTarget(projectId, record.visibility.personaId) : {}),
          }),
        }]
      })
    return [...pending, ...stored]
  }

  /** The persona a DM memory was said to (her name, no article: the product keeps no gender); nothing when she is gone. */
  private dmTarget(projectId: string, personaId: string): Pick<MemoryView, 'to'> {
    const name = this.personaName(projectId, personaId)
    return name === personaId ? {} : { to: { name } }
  }

  /**
   * @param request - New pending memory.
   */
  proposeMemory(request: MemoryWriteRequest): MemoryView {
    const row: MemoryProposal = { id: request.id, body: request.body, authorId: request.authorId }
    this.screens.put(request.projectId, KIND_MEMORY, request.id, row)
    return { id: row.id, body: row.body, status: 'pending', origin: 'conversation' }
  }

  /**
   * @param request - Approve pending or keep vault row.
   */
  approveMemory(request: MemoryWriteRequest): MemoryView {
    const pending = this.screens.get<MemoryProposal>(request.projectId, KIND_MEMORY, request.id)
    if (pending !== undefined) {
      const record = this.vault.createRecord({
        id: pending.id,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        kind: 'memory',
        body: pending.body,
        authorId: pending.authorId,
        visibility: { kind: 'workspace' },
      })
      this.screens.delete(request.projectId, KIND_MEMORY, request.id)
      return { id: record.id, body: record.body, status: 'active', origin: 'vault' }
    }
    const record = this.vault.getRecord(request.id)
    if (record === undefined) throw new Error('memory-not-found')
    return { id: record.id, body: record.body, status: 'active', origin: 'vault' }
  }

  /**
   * @param request - New body.
   */
  editMemory(request: MemoryWriteRequest): MemoryView {
    const pending = this.screens.get<MemoryProposal>(request.projectId, KIND_MEMORY, request.id)
    if (pending !== undefined) {
      const next: MemoryProposal = { ...pending, body: request.body, authorId: request.authorId }
      this.screens.put(request.projectId, KIND_MEMORY, request.id, next)
      return { id: next.id, body: next.body, status: 'pending', origin: 'conversation' }
    }
    const record = this.vault.updateRecord(request.id, request.body, request.authorId)
    return { id: record.id, body: record.body, status: 'active', origin: 'vault' }
  }

  /**
   * @param projectId - Tenant.
   * @param id - Memory.
   */
  forgetMemory(projectId: string, id: string): MemoryView {
    const pending = this.screens.get<MemoryProposal>(projectId, KIND_MEMORY, id)
    if (pending !== undefined) {
      this.screens.delete(projectId, KIND_MEMORY, id)
      return { id, body: pending.body, status: 'revoked', origin: 'conversation' }
    }
    const record = this.vault.revokeRecord(id)
    return { id: record.id, body: record.body, status: 'revoked', origin: 'vault' }
  }

  /**
   * @param projectId - Tenant.
   */
  listSkills(projectId: string): SkillView[] {
    return this.screens.list<StoredSkill>(projectId, KIND_SKILL).map(toSkillView)
  }

  /**
   * Item 26.10: write a skill that came from outside. The body is marked untrusted (data, never instructions) and carries its source, so
   * "Atualizar" can tell the same content from a new one.
   * @param projectId - Tenant.
   * @param input - The skill and where it came from.
   * @returns The stored skill.
   */
  importSkill(projectId: string, input: {
    readonly id: string
    readonly name: string
    readonly body: string
    readonly sharedWithTeam: boolean
    readonly source: { readonly url: string; readonly ref: string; readonly hash: string }
  }): SkillView {
    const current = this.screens.get<StoredSkill>(projectId, KIND_SKILL, input.id)
    const stored: StoredSkill = {
      id: input.id,
      name: input.name,
      version: current === undefined ? 1 : current.version,
      scope: input.sharedWithTeam ? 'team' : 'persona',
      origin: 'library',
      body: input.body,
      enabled: true,
      history: current === undefined ? [input.body] : [...current.history, input.body],
      sharedWithTeam: input.sharedWithTeam,
      source: input.source,
      untrusted: true,
    }
    this.screens.put(projectId, KIND_SKILL, input.id, stored)
    return toSkillView(stored)
  }

  /**
   * Item 26.10/26.11: a new version downloaded from the source waits here until the person approves it.
   * @param projectId - Tenant.
   * @param input - Skill id, the new body and its hash.
   */
  stageSkillUpdate(projectId: string, input: { readonly id: string; readonly body: string; readonly hash: string }): void {
    this.screens.put(projectId, KIND_SKILL_UPDATE, input.id, { id: input.id, body: input.body, hash: input.hash, at: this.now() })
  }

  /**
   * @param projectId - Tenant.
   * @param id - Skill id.
   * @returns The update waiting for approval, if any.
   */
  pendingSkillUpdate(projectId: string, id: string): { readonly id: string; readonly body: string; readonly hash: string } | undefined {
    return this.screens.get<{ id: string; body: string; hash: string }>(projectId, KIND_SKILL_UPDATE, id)
  }

  /**
   * Item 26.11: apply the staged update (the history keeps the previous body, so "Desfazer" still works).
   * @param projectId - Tenant.
   * @param id - Skill id.
   * @returns The updated skill, or undefined when nothing was waiting.
   */
  approveSkillUpdate(projectId: string, id: string): SkillView | undefined {
    const pending = this.pendingSkillUpdate(projectId, id)
    if (pending === undefined) return undefined
    const current = this.screens.get<StoredSkill>(projectId, KIND_SKILL, id)
    if (current === undefined) return undefined
    const next = nextSkillVersion({ ...current, body: pending.body }, pending.body)
    const stored: StoredSkill = {
      ...current,
      body: next.body,
      version: next.version,
      history: [...current.history, pending.body],
      ...(current.source === undefined ? {} : { source: { ...current.source, hash: pending.hash } }),
    }
    this.screens.put(projectId, KIND_SKILL, id, stored)
    this.screens.delete(projectId, KIND_SKILL_UPDATE, id)
    return toSkillView(stored)
  }

  /**
   * User-imported persona. Always pending — never applies itself.
   * @param request - Tenant, id, creator, full spec.
   */
  proposeImportedPersona(request: {
    workspaceId: string
    projectId: string
    id: string
    creatorPersonaId: string
    spec: PersonaSpec
  }): ApprovalView {
    const identity = this.hireIdentity(
      request.projectId, request.spec.name, request.spec.avatar.kind === 'gallery' ? request.spec.avatar.ref : '',
    )
    const proposal: PersonaProposal = {
      id: request.id,
      workspaceId: request.workspaceId,
      creatorPersonaId: request.creatorPersonaId,
      spec: {
        ...request.spec,
        name: identity.name,
        ...(request.spec.avatar.kind === 'gallery' ? { avatar: { kind: 'gallery' as const, ref: identity.avatarRef } } : {}),
      },
      policy: 'approval',
      status: 'pending',
      createdAt: this.now(),
    }
    this.screens.put(request.projectId, KIND_HIRE, request.id, proposal)
    return hireCard(proposal, this.personaName(request.projectId, request.creatorPersonaId))
  }

  /**
   * Learned CLI skill. Stays disabled until someone enables it.
   * @param request - Tenant, persona, body.
   */
  putCandidateSkill(request: {
    projectId: string
    personaId: string
    id: string
    name: string
    body: string
    origin?: SkillRecord['origin']
  }): SkillView {
    const row: StoredSkill = {
      id: request.id,
      name: request.name,
      version: 1,
      scope: 'persona',
      origin: request.origin ?? 'learned',
      body: request.body,
      enabled: false,
      personaId: request.personaId,
      projectId: request.projectId,
      history: [request.body],
      sharedWithTeam: false,
    }
    this.screens.put(request.projectId, KIND_SKILL, request.id, row)
    return toSkillView(row)
  }

  /**
   * Stored skill row, including origin. Missing id is undefined.
   * @param projectId - Tenant.
   * @param id - Skill.
   */
  getSkillRecord(projectId: string, id: string): SkillRecord | undefined {
    return this.screens.get<StoredSkill>(projectId, KIND_SKILL, id)
  }

  /**
   * Replace a stored skill (activate / rollback). Keeps history.
   * @param projectId - Tenant.
   * @param skill - Next record.
   */
  saveSkillRecord(projectId: string, skill: SkillRecord): SkillView {
    const current = this.screens.get<StoredSkill>(projectId, KIND_SKILL, skill.id)
    const stored: StoredSkill = {
      ...skill,
      history: current === undefined ? [skill.body] : [...current.history, skill.body],
      sharedWithTeam: skill.scope !== 'persona',
    }
    this.screens.put(projectId, KIND_SKILL, skill.id, stored)
    return toSkillView(stored)
  }

  /**
   * @param request - Skill.
   */
  putSkill(request: PutSkillRequest): SkillView {
    const row: StoredSkill = {
      id: request.id,
      name: request.name,
      version: 1,
      scope: request.sharedWithTeam ? 'team' : 'persona',
      origin: 'library',
      body: request.body,
      enabled: true,
      projectId: request.projectId,
      history: [request.body],
      sharedWithTeam: request.sharedWithTeam,
    }
    this.screens.put(request.projectId, KIND_SKILL, request.id, row)
    return toSkillView(row)
  }

  /**
   * @param request - New body (candidate until approved).
   */
  reviseSkill(request: ReviseSkillRequest): SkillView {
    const current = this.requireSkill(request.projectId, request.id)
    const next = nextSkillVersion(current, request.body)
    const stored: StoredSkill = {
      ...next,
      history: [...current.history, request.body],
      sharedWithTeam: current.sharedWithTeam,
    }
    this.screens.put(request.projectId, KIND_SKILL, request.id, stored)
    return toSkillView(stored)
  }

  /**
   * @param projectId - Tenant.
   * @param id - Skill.
   */
  rollbackSkill(projectId: string, id: string): SkillView {
    const current = this.requireSkill(projectId, id)
    const previous = current.history.at(-2)
    if (previous === undefined) return toSkillView(current)
    const next = rollbackSkill(current, previous)
    const stored: StoredSkill = {
      ...next,
      history: [...current.history, previous],
      sharedWithTeam: current.sharedWithTeam,
    }
    this.screens.put(projectId, KIND_SKILL, id, stored)
    return toSkillView(stored)
  }

  private requireSkill(projectId: string, id: string): StoredSkill {
    const current = this.screens.get<StoredSkill>(projectId, KIND_SKILL, id)
    if (current === undefined) throw new Error('skill-not-found')
    return current
  }

  private decideHire(request: DecideApprovalRequest): ApprovalView {
    const proposal = this.screens.get<StoredHire>(request.projectId, KIND_HIRE, request.id)
    if (proposal === undefined) throw new Error('approval-not-found')
    const next = { ...proposal, status: request.accept ? 'approved' as const : 'rejected' as const }
    this.screens.put(request.projectId, KIND_HIRE, request.id, next)
    if (request.accept) {
      const now = this.now()
      const created = this.product.createPersona({
        ...proposal.spec,
        id: `hire:${proposal.id}`,
        workspaceId: request.workspaceId,
        createdAt: now,
        updatedAt: now,
        createdBy: proposal.creatorPersonaId,
      }, request.projectId)
      this.initializePersona(created)
    }
    return hireCard(next, this.personaName(request.projectId, next.creatorPersonaId))
  }

  private decideVault(request: DecideApprovalRequest): ApprovalView {
    const proposal = this.screens.get<VaultProposal>(request.projectId, KIND_VAULT, request.id)
    if (proposal === undefined) throw new Error('approval-not-found')
    const current = this.vault.getRecord(proposal.recordId)
    if (current === undefined) throw new Error('vault-not-found')
    const decided = { ...proposal, status: request.accept ? 'approved' as const : 'rejected' as const }
    this.screens.put(request.projectId, KIND_VAULT, request.id, decided)
    if (request.accept) {
      applyVaultProposal(current, decided)
      this.vault.updateRecord(proposal.recordId, proposal.nextBody, proposal.creatorPersonaId)
    }
    return vaultCard(decided, this.personaName(request.projectId, decided.creatorPersonaId))
  }

  private decideSkill(request: DecideApprovalRequest): ApprovalView {
    const row = this.screens.get<SkillProposal>(request.projectId, KIND_SKILL_PROP, request.id)
    if (row === undefined) throw new Error('approval-not-found')
    const next: SkillProposal = { ...row, status: request.accept ? 'approved' : 'rejected' }
    this.screens.put(request.projectId, KIND_SKILL_PROP, request.id, next)
    if (request.accept) {
      const skill = this.screens.get<StoredSkill>(request.projectId, KIND_SKILL, row.skillId)
      if (skill !== undefined) {
        this.screens.put(request.projectId, KIND_SKILL, skill.id, { ...skill, enabled: true })
      }
    } else {
      // "Agora não" on what a persona learned by herself: the note stays, and the offer comes back only after three more uses (playbook.ts).
      declinePlaybookOffer({ screens: this, now: this.now }, request.projectId, request.id)
    }
    return {
      id: next.id, kind: 'skill', title: next.title, question: next.question ?? `Ativar ${next.title}?`, status: next.status,
      personaId: next.creatorPersonaId, personaName: this.personaName(request.projectId, next.creatorPersonaId),
    }
  }
}

function toInviteView(invite: Parameters<typeof inviteStatus>[0], now: number): InviteView {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    token: invite.token,
    status: inviteStatus(invite, now),
    expiresAt: invite.expiresAt,
  }
}

function toBatchView(batch: { id: string; adapterId: string; applied: readonly unknown[]; rolledBack: boolean }): ImportBatchView {
  return { id: batch.id, adapterId: batch.adapterId, applied: batch.applied.length, rolledBack: batch.rolledBack }
}

/** A stored hire proposal; `reason` is the proposer's real motive, absent when it gave none. */
type StoredHire = PersonaProposal & { readonly reason?: string }

/**
 * `description` describes the persona; `reason` is only a real motive (the UI labels it “Por que”). `monthlyTasks` is
 * never sent: the host cannot measure it for someone not yet hired.
 * @param proposal - Stored proposal.
 * @param personaName - Proposer's name.
 */
function hireCard(proposal: StoredHire, personaName: string): ApprovalView {
  const hireAvatarRef = proposal.spec.avatar.kind === 'gallery' ? proposal.spec.avatar.ref : undefined
  return {
    id: proposal.id, kind: 'hire', title: proposal.spec.name,
    question: `Contratar ${proposal.spec.name}?`, status: proposal.status,
    roleTitle: proposal.spec.title,
    description: proposal.spec.description,
    personaId: proposal.creatorPersonaId, personaName,
    ...(proposal.reason === undefined || proposal.reason === '' ? {} : { reason: proposal.reason }),
    ...(hireAvatarRef === undefined ? {} : { hireAvatarRef }),
  }
}

function vaultCard(proposal: VaultProposal, personaName: string): ApprovalView {
  return {
    id: proposal.id, kind: 'vault', title: proposal.recordId,
    question: 'Atualizar registro no Cofre?', status: proposal.status,
    personaId: proposal.creatorPersonaId, personaName,
    permissionAction: 'vault.update', permissionTarget: `vault:${proposal.recordId}`,
  }
}

function toSkillView(skill: StoredSkill): SkillView {
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    status: skill.enabled ? 'active' : 'candidate',
    body: skill.body,
    sharedWithTeam: skill.sharedWithTeam,
    ...(skill.source === undefined ? {} : { source: skill.source }),
    ...(skill.untrusted === true ? { untrusted: true } : {}),
  }
}
