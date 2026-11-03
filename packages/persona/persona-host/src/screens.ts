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
  type SkillRecord,
  type VaultProposal,
} from '@deepseek-ai/dsh-persona-core'
import {
  ScreenRepos,
  SqliteImportStore,
  SqliteInviteBook,
  type ProductRepos,
  type VaultRepos,
} from '@deepseek-ai/dsh-persona-store'
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

const KIND_RULE = 'triage_rule'
const KIND_QUIET = 'quiet_window'
const KIND_LIMITS = 'project_limits'
const KIND_HIRE = 'hire_proposal'
const KIND_VAULT = 'vault_proposal'
const KIND_SKILL_PROP = 'skill_proposal'
const KIND_MEMORY = 'memory_proposal'
const KIND_SKILL = 'skill'
const KIND_LOG = 'triage_log'
const LIMITS_ID = 'default'

interface StoredSkill extends SkillRecord {
  readonly history: readonly string[]
  readonly sharedWithTeam: boolean
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
}

/**
 * Screen remotes. Persistence is SQLite `screen_doc` plus invite/import/vault.
 */
export class ScreensHost {
  readonly product: ProductRepos
  readonly vault: VaultRepos
  readonly screens: ScreenRepos
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
    now: () => string = () => new Date().toISOString(),
    nowMs: () => number = () => Date.now(),
  ) {
    this.product = product
    this.vault = vault
    this.screens = screens
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
    return this.screens.list<TriageRuleView>(projectId, KIND_RULE)
  }

  /**
   * @param request - Rule.
   */
  putRule(request: PutTriageRuleRequest): TriageRuleView {
    const row: TriageRuleView = {
      id: request.id,
      gateText: request.gateText,
      assessmentText: request.assessmentText,
      logOnly: request.logOnly,
      speculativeEnabled: request.speculativeEnabled,
    }
    this.screens.put(request.projectId, KIND_RULE, request.id, row)
    return row
  }

  /**
   * @param projectId - Tenant.
   * @param id - Rule.
   */
  deleteRule(projectId: string, id: string): boolean {
    this.screens.delete(projectId, KIND_RULE, id)
    return true
  }

  /**
   * @param projectId - Tenant.
   */
  listQuiet(projectId: string): QuietWindowView[] {
    return this.screens.list<QuietWindowView>(projectId, KIND_QUIET)
  }

  /**
   * @param request - Window.
   */
  putQuiet(request: PutQuietWindowRequest): QuietWindowView {
    const row: QuietWindowView = {
      id: request.id, label: request.label, start: request.start, end: request.end,
    }
    this.screens.put(request.projectId, KIND_QUIET, request.id, row)
    return row
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
    const proposal = personaPropose({
      id: request.id,
      workspaceId: request.workspaceId,
      creator,
      spec: {
        name: request.name,
        avatar: { kind: 'gallery', ref: request.name.toLowerCase() },
        title: request.title,
        description: request.description,
        personality: 'Proposta.',
        instructions: 'Aguardando aprovação.',
        runner: { kind: 'dsh', model: 'default' },
        tools: {},
        skills: [],
        limits: {},
        systemRoles: [],
        canRecruit: false,
      },
      policy: 'approval',
      createdAt: this.now(),
    })
    this.screens.put(request.projectId, KIND_HIRE, request.id, proposal)
    return hireCard(proposal, this.personaName(request.projectId, request.creatorPersonaId))
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
    }
    this.screens.put(request.projectId, KIND_SKILL_PROP, request.id, row)
    return {
      id: row.id, kind: 'skill', title: row.title, question: `Ativar ${row.title}?`,
      status: 'pending', personaId: request.creatorPersonaId, personaName: this.personaName(request.projectId, request.creatorPersonaId),
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
  listApprovals(projectId: string): ApprovalView[] {
    const cards: ApprovalView[] = [
      ...this.screens.list<PersonaProposal>(projectId, KIND_HIRE).map(row => hireCard(row, this.personaName(projectId, row.creatorPersonaId))),
      ...this.screens.list<VaultProposal>(projectId, KIND_VAULT).map(row => vaultCard(row, this.personaName(projectId, row.creatorPersonaId))),
      ...this.screens.list<SkillProposal>(projectId, KIND_SKILL_PROP).map(row => ({
        id: row.id, kind: 'skill' as const, title: row.title, question: `Ativar ${row.title}?`, status: row.status,
        personaId: row.creatorPersonaId, personaName: this.personaName(projectId, row.creatorPersonaId),
      })),
    ]
    for (const ticket of this.orchestration.runtime(projectId).repo.tickets.list()) {
      if (ticket.attention === undefined) continue
      cards.push({
        id: ticket.id, kind: 'attention', title: ticket.title, question: ticket.title, status: 'pending',
        personaId: '', personaName: ticket.execution?.name ?? '',
      })
    }
    return cards
  }

  /**
   * @param request - Decision.
   */
  decide(request: DecideApprovalRequest): ApprovalView {
    if (request.kind === 'hire') return this.decideHire(request)
    if (request.kind === 'vault') return this.decideVault(request)
    if (request.kind === 'skill') return this.decideSkill(request)
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
   */
  listMemory(projectId: string): MemoryView[] {
    const pending = this.screens.list<MemoryProposal>(projectId, KIND_MEMORY).map(row => ({
      id: row.id, body: row.body, status: 'pending' as const, origin: 'conversation' as const,
    }))
    const stored = this.vault.listRecords(projectId)
      .filter(record => record.kind === 'memory')
      .map(record => ({
        id: record.id, body: record.body,
        status: record.status === 'revoked' ? 'revoked' as const : 'active' as const,
        origin: 'vault' as const,
      }))
    return [...pending, ...stored]
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
    const proposal = this.screens.get<PersonaProposal>(request.projectId, KIND_HIRE, request.id)
    if (proposal === undefined) throw new Error('approval-not-found')
    const next = { ...proposal, status: request.accept ? 'approved' as const : 'rejected' as const }
    this.screens.put(request.projectId, KIND_HIRE, request.id, next)
    if (request.accept) {
      const now = this.now()
      this.product.createPersona({
        ...proposal.spec,
        id: `hire:${proposal.id}`,
        workspaceId: request.workspaceId,
        createdAt: now,
        updatedAt: now,
        createdBy: proposal.creatorPersonaId,
      }, request.projectId)
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
    }
    return {
      id: next.id, kind: 'skill', title: next.title, question: `Ativar ${next.title}?`, status: next.status,
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

function hireCard(proposal: PersonaProposal, personaName: string): ApprovalView {
  return {
    id: proposal.id, kind: 'hire', title: proposal.spec.name,
    question: `Contratar ${proposal.spec.name}?`, status: proposal.status,
    personaId: proposal.creatorPersonaId, personaName,
  }
}

function vaultCard(proposal: VaultProposal, personaName: string): ApprovalView {
  return {
    id: proposal.id, kind: 'vault', title: proposal.recordId,
    question: 'Atualizar registro no Cofre?', status: proposal.status,
    personaId: proposal.creatorPersonaId, personaName,
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
  }
}
