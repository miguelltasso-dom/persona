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
import {
  draftTaughtSkill,
  fakeVisionPort,
  type TaughtSkillDraft,
  type TeachStepDraft,
} from '@deepseek-ai/dsh-persona-engine'
import { createHash } from 'node:crypto'
import { accountHomeDir, accountIsolationEnv, formatAccountSwitch, pickProviderAccount } from '@deepseek-ai/dsh-persona-runners'
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
  const segment = (id: string): string => createHash('sha256').update(id).digest('hex').slice(0, 32)
  return accountHomeDir(root, segment(personId), engine, segment(accountId))
}

/**
 * PowerShell login command scoped to the account's own configuration directory.
 * @param provider - Supported CLI family.
 * @param homeDir - Persisted isolated directory, never native default credentials.
 * @returns Shell command without reading authentication files, or undefined for providers without a CLI login.
 */
export function isolatedAccountLoginCommand(provider: string, homeDir: string): string | undefined {
  if (homeDir === '') return undefined
  const cli = provider === 'claude' ? 'claude login' : provider === 'codex' ? 'codex login'
    : provider === 'cursor' ? 'cursor-agent login' : provider === 'opencode' ? 'opencode auth login' : undefined
  if (cli === undefined) return undefined
  const engine = provider === 'claude' || provider === 'codex' || provider === 'cursor' ? provider : 'opencode'
  const env = accountIsolationEnv(engine, homeDir)
  const assignments = Object.entries(env).map(([name, value]) => value === null
    ? `Remove-Item Env:${name} -ErrorAction SilentlyContinue`
    : `$env:${name}='${value.replaceAll("'", "''")}'`)
  return [...assignments, cli].join('; ')
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
 * Open tickets → subject → mandate actors (WAVE2 "persona trabalhando").
 * @param tickets - Engine tickets.
 * @param subjectOf - Bound assunto (`ticket_subject` screen).
 */
export function workingBySubject(
  tickets: readonly { readonly id: string; readonly ended?: unknown; readonly mandate?: { readonly actor: { readonly id: string } } }[],
  subjectOf: (ticketId: string) => string | undefined,
): Readonly<Record<string, readonly string[]>> {
  const collected = new Map<string, string[]>()
  for (const ticket of tickets) {
    if (ticket.ended !== undefined) continue
    const personaId = ticket.mandate?.actor.id
    const subjectId = subjectOf(ticket.id)
    if (personaId === undefined || subjectId === undefined || subjectId === '') continue
    const row = collected.get(subjectId) ?? []
    if (!row.includes(personaId)) row.push(personaId)
    collected.set(subjectId, row)
  }
  return Object.fromEntries(collected)
}

/**
 * Colored subjects for one stream, plus who is working on each.
 * @param topics - Topic repo.
 * @param input - Stream.
 * @param actorId - Reader (unread counts).
 * @param working - Persona ids per subject from {@link workingBySubject}.
 */
export function subjectViews(
  topics: TopicRepos,
  input: { workspaceId: string; projectId: string; streamKind: 'channel' | 'dm'; ownerId: string },
  actorId: string,
  working: Readonly<Record<string, readonly string[]>> = {},
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
    workingPersonaIds: working[row.id] ?? [],
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
  // D-078: "perguntar antes de trocar" is the DEFAULT; switching alone needs a policy the person chose (a stored row).
  if (row === undefined) return { policy: 'ask_before_swap', scope: 'workspace' }
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

/**
 * Rebuild the engine draft from the reviewed host steps. Stays disabled.
 * @param input - Session, persona, edited steps.
 * @returns Engine draft with `origin: taught` and `enabled: false`.
 */
export function taughtDraftOf(input: {
  readonly sessionId: string
  readonly personaId: string
  readonly projectId: string
  readonly title: string
  readonly steps: readonly TeachStepView[]
}): TaughtSkillDraft {
  const title = input.title.trim() || 'Skill ensinada'
  const steps: TeachStepDraft[] = input.steps.map(step => ({
    order: step.order,
    title: `Passo ${String(step.order)}`,
    instruction: step.instruction,
    verify: step.verifyHint ?? '',
    thumbnailRef: step.thumbnailAssetId ?? '',
    tools: toolsListedIn(step.instruction),
  }))
  const body = [
    `# ${title}`,
    '',
    ...steps.map(step => [
      `## ${String(step.order)}. ${step.title}`,
      step.instruction,
      step.verify === '' ? undefined : `Verificar: ${step.verify}`,
      step.thumbnailRef === '' ? undefined : `Miniatura: ${step.thumbnailRef}`,
      step.tools.length === 0 ? undefined : `Ferramentas: ${step.tools.join(', ')}`,
    ].filter((line): line is string => line !== undefined).join('\n')),
  ].join('\n')
  return {
    local: true,
    steps,
    skill: {
      id: `taught-${input.sessionId}`,
      name: title.slice(0, 64),
      version: 1,
      scope: 'persona',
      origin: 'taught',
      body,
      enabled: false,
      personaId: input.personaId,
      projectId: input.projectId,
    },
  }
}

/**
 * Union of `Ferramentas:` lines in a taught body.
 * @param body - Skill markdown.
 * @returns Tool names in first-seen order.
 */
export function taughtStepToolsOf(body: string): string[] {
  const tools: string[] = []
  for (const line of body.split('\n')) {
    const hit = line.match(/^Ferramentas:\s*(.+)$/)
    if (hit === null) continue
    for (const name of hit[1]!.split(',')) {
      const trimmed = name.trim()
      if (trimmed !== '' && !tools.includes(trimmed)) tools.push(trimmed)
    }
  }
  return tools
}

/**
 * Persona mandate names that are not `none`.
 * @param tools - Stored tool levels.
 * @returns Allow-list for engine `activateTaughtSkill`.
 */
export function allowedToolsOf(tools: Readonly<Record<string, string>>): string[] {
  return Object.entries(tools)
    .filter(([, level]) => level !== 'none')
    .map(([name]) => name)
}

function toolsListedIn(instruction: string): string[] {
  const hit = instruction.match(/^Ferramentas:\s*(.+)$/m)
  if (hit === null) return []
  return hit[1]!.split(',').map(part => part.trim()).filter(part => part !== '')
}
