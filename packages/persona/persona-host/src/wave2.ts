/**
 * WAVE2 host helpers: subjects, accounts, teach drafts. Persistence is Anvil v14.
 */

import {
  accountAskNeedsYou,
  compileActiveSubject,
  normalizeAccountPolicy,
  pickAccount,
  vaultSnapshot,
  type AccountEngine,
  type AccountRotationPolicy,
  type CompileActiveSubjectInput,
  type ProviderAccount as DomainAccount,
  type VaultRecord,
} from '@deepseek-ai/dsh-persona-core'
import { draftTaughtSkill, fakeVisionPort } from '@deepseek-ai/dsh-persona-engine'
import { accountHomeDir, formatAccountSwitch, pickProviderAccount } from '@deepseek-ai/dsh-persona-runners'
import type { AccountRepos, ConversationTopic, ProviderAccount, TopicRepos } from '@deepseek-ai/dsh-persona-store'
import type {
  ConversationSubjectView,
  RunnerSwapPolicy,
  RunnerSwapPolicyScope,
  TeachStepView,
} from './types.ts'

export const TEACH_CONSENT = 'teach-v1'
export const TEACH_RETENTION_DAYS = 30

/**
 * Isolated CLI home — same path Rivet uses.
 * @param personId - Human owner.
 * @param provider - Engine family.
 * @param accountId - Stored account id.
 */
export function isolatedAccountHome(personId: string, provider: string, accountId: string): string {
  const root = process.env.PERSONA_HOME ?? process.env.DSH_HOME ?? process.cwd()
  const engine = provider === 'opencode' || provider === 'claude' || provider === 'codex'
    || provider === 'cursor' || provider === 'dsh' || provider === 'gemini'
    || provider === 'grok' || provider === 'openrouter' || provider === 'opencode-go'
    ? provider
    : 'dsh'
  return accountHomeDir(root, personId, engine, accountId)
}

/**
 * @param policy - Host / Lumen enum.
 */
export function toStorePolicy(policy: RunnerSwapPolicy): 'fixed' | 'next' | 'split' | 'ask' {
  if (policy === 'next_on_limit') return 'next'
  if (policy === 'round_robin') return 'split'
  if (policy === 'ask_before_swap') return 'ask'
  return 'fixed'
}

/**
 * @param mode - Store enum.
 */
export function toHostPolicy(mode: 'fixed' | 'next' | 'split' | 'ask'): RunnerSwapPolicy {
  if (mode === 'next') return 'next_on_limit'
  if (mode === 'split') return 'round_robin'
  if (mode === 'ask') return 'ask_before_swap'
  return 'fixed'
}

/**
 * @param topics - Topic repo.
 * @param input - Stream.
 * @param actorId - Reader.
 */
export function subjectViews(
  topics: TopicRepos,
  input: { workspaceId: string; projectId: string; streamKind: 'channel' | 'dm'; ownerId: string },
  actorId: string,
): ConversationSubjectView[] {
  let rows = topics.list(input.projectId, input.streamKind, input.ownerId, true)
  if (rows.length === 0) {
    topics.create({
      id: `${input.streamKind}:${input.ownerId}:t0`,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      streamKind: input.streamKind,
      ownerId: input.ownerId,
      colorIndex: 0,
      name: 'Geral',
    })
    rows = topics.list(input.projectId, input.streamKind, input.ownerId, true)
  }
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    colorIndex: row.colorIndex,
    unreadCount: topics.unreadCount(row.id, actorId),
    workingPersonaIds: [],
    archived: row.archived,
  }))
}

/**
 * Next free color 0–6, or the first archived slot.
 * @param rows - Existing topics.
 */
export function nextSubjectColor(rows: readonly ConversationTopic[]): number {
  const used = new Set(rows.filter(row => !row.archived).map(row => row.colorIndex))
  for (let color = 0; color <= 6; color += 1) {
    if (!used.has(color)) return color
  }
  throw new Error('subject-limit')
}

/**
 * @param vaultRecords - Cofre rows already listed.
 * @param projectId - Tenant.
 * @param topicId - Active subject.
 */
export async function compileSubjectVault(
  vaultRecords: readonly VaultRecord[],
  projectId: string,
  topicId: string,
  input: Omit<CompileActiveSubjectInput, 'snapshot' | 'activeSubjectId'>,
): Promise<void> {
  const snapshot = vaultSnapshot(vaultRecords, projectId, input.scope.policyRevision)
  await compileActiveSubject({ ...input, snapshot, activeSubjectId: topicId })
}

/**
 * Pick the isolated account for this persona. Uses Rivet execution + Forge domain.
 * @param accounts - Store seats.
 * @param policy - Persisted policy (host enum).
 * @param currentId - Last used id.
 * @param personaName - Activity subject.
 */
export function resolveAccountSeat(input: {
  readonly accounts: readonly ProviderAccount[]
  readonly policy: RunnerSwapPolicy
  readonly policyScope: RunnerSwapPolicyScope
  readonly preferredEngines: readonly AccountEngine[]
  readonly currentId?: string
  readonly personaName: string
}): {
  readonly home: string
  readonly accountId?: string
  readonly activity?: string
  readonly ask?: { readonly title: string; readonly body: string }
  readonly stop?: string
} {
  if (input.accounts.length === 0) return { home: '' }
  const domainAccounts: DomainAccount[] = input.accounts.map(row => ({
    id: row.id,
    engine: row.provider as AccountEngine,
    label: row.label,
    isolatedHome: row.homeDir === '' ? isolatedAccountHome('owner', row.provider, row.id) : row.homeDir,
    atLimit: row.status === 'limit',
    remainingQuota: row.status === 'limit' ? 0 : 80,
  }))
  const current = input.currentId ?? domainAccounts[0]!.id
  const domainPolicy: AccountRotationPolicy = normalizeAccountPolicy(input.policy)
  const decided = pickAccount({
    policy: {
      scope: input.policyScope === 'persona' ? 'persona' : 'workspace',
      ownerId: input.personaName,
      policy: domainPolicy,
      preferredEngines: input.preferredEngines.length === 0
        ? domainAccounts.map(row => row.engine)
        : input.preferredEngines,
    },
    accounts: domainAccounts,
    currentAccountId: current,
  })
  const rivet = pickProviderAccount({
    accounts: input.accounts.map(row => ({
      id: row.id,
      provider: row.provider,
      label: row.label,
      configDir: row.homeDir === '' ? isolatedAccountHome('owner', row.provider, row.id) : row.homeDir,
    })),
    policy: {
      kind: input.policy,
      scope: input.policyScope,
      accountIds: input.accounts.map(row => row.id),
    },
    quotas: input.accounts.map(row => ({
      accountId: row.id,
      exhausted: row.status === 'limit',
      remainingPercent: row.status === 'limit' ? 0 : 80,
    })),
    currentId: current,
    personaName: input.personaName,
  })
  if (decided.kind === 'ask' || rivet.action === 'ask') {
    const from = domainAccounts.find(row => row.id === current) ?? domainAccounts[0]!
    const to = domainAccounts.find(row => row.id !== current) ?? from
    return { home: from.isolatedHome, accountId: from.id, ask: accountAskNeedsYou(from, to) }
  }
  if (decided.kind === 'stop' || rivet.action === 'stop') {
    const hold = domainAccounts.find(row => row.id === current) ?? domainAccounts[0]!
    return { home: hold.isolatedHome, accountId: hold.id, stop: 'Esta conta chegou ao limite.' }
  }
  const useId = decided.kind === 'handoff' ? decided.toAccountId : decided.accountId
  const seat = domainAccounts.find(row => row.id === useId) ?? domainAccounts[0]!
  const switched = useId !== current
  return {
    home: seat.isolatedHome,
    accountId: seat.id,
    ...(switched
      ? {
        activity: formatAccountSwitch({
          personaName: input.personaName,
          provider: seat.engine,
          label: seat.label,
        }),
      }
      : {}),
  }
}

/**
 * @param accounts - Store.
 * @param workspaceId - Workspace.
 * @param provider - Engine.
 * @param personaId - Optional persona override.
 */
export function storedSwapPolicy(
  accounts: AccountRepos,
  workspaceId: string,
  provider: string,
  personaId?: string,
): { policy: RunnerSwapPolicy; scope: RunnerSwapPolicyScope } {
  const row = accounts.getPolicy(workspaceId, provider, personaId)
  if (row === undefined) return { policy: 'next_on_limit', scope: 'workspace' }
  return { policy: toHostPolicy(row.mode), scope: row.scope }
}

/**
 * @param steps - Engine draft steps.
 */
export function teachStepsOf(steps: readonly { order: number; instruction: string; verify: string; thumbnailRef: string }[]): TeachStepView[] {
  return steps.map(step => ({
    order: step.order,
    instruction: step.instruction,
    ...(step.thumbnailRef === '' ? {} : { thumbnailAssetId: step.thumbnailRef }),
    verifyHint: step.verify,
  }))
}

/**
 * Local draft from frames + transcript. Never enables the skill.
 * @param input - Persona, title, frames, transcript.
 */
export async function teachDraftFrom(input: {
  readonly personaId: string
  readonly title: string
  readonly frames: readonly { readonly atMs: number; readonly imageRef: string; readonly changeScore: number }[]
  readonly transcript: string
}): Promise<{ body: string; steps: TeachStepView[]; title: string }> {
  const slices = input.transcript.trim() === ''
    ? []
    : [{ atMs: 0, untilMs: Number.MAX_SAFE_INTEGER, text: input.transcript }]
  const draft = await draftTaughtSkill({
    personaId: input.personaId,
    title: input.title,
    frames: input.frames,
    transcript: slices,
    allowedTools: [],
    vision: fakeVisionPort(),
  })
  return { body: draft.skill.body, steps: teachStepsOf(draft.steps), title: draft.skill.name }
}
