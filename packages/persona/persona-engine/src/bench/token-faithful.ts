/**
 * Faithful scripted token runner (OPT-2). Every number comes from prompts built
 * by the SAME composers the host uses (talk, coordination, worker, vigia,
 * initiative) over realistic fixtures — never from hard-coded constants.
 *
 * Model of the provider (documented, offline, no CLI):
 * - input tokens = estimateTokens(full prompt of the turn);
 * - prefix cache = longest common prefix with the previous prompt of the same
 *   cache key (persona + purpose), so an unstable prefix really loses hits;
 * - quality = the scripted "model" only states a fact when the evidence is in
 *   its prompt, so a context budget that drops the evidence lowers quality.
 * Real vendor runs stay opt-in (`PERSONA_PAIR_REAL=1`); this is the cheap gate.
 */

import {
  estimateTokens,
  incrementalSubjectSummary,
  measureLayers,
  minifyToolDescription,
  turnFromLayers,
  type TurnKind,
  type TurnLayerSizes,
  type TurnLedgerEntry,
} from '@deepseek-ai/dsh-persona-core'
import { batchInitiative, INITIATIVE_DAILY_TOKEN_BUDGET, leanChannelReply, trimInitiativeToBudget, type InitiativeDraft } from '../lean-output.ts'
import { preRoute, type PreRouteInput } from '../preroute/rules.ts'
import { ROUTER_FORBIDDEN_TOOLS } from '../ports/runner.ts'
import { fitRowsToBudget, relevanceOverlap } from '../prompts/context-budget.ts'
import { clipTextToTokens, composeStablePrefix, toolsForTurn, trimVariableAlreadyInPrefix, VARIABLE_LAYER_BUDGET } from '../prompts/stable-prefix.ts'
import { capTalkContext, wrapAsData, type TalkColleague } from '../prompts/talk.ts'
import { composePrompt, WORKER_LEAN_REPORT_RULE } from '../prompts/templates.ts'
import { composeVoicePolicy, composePersonaPrompt, voiceSurfaceHint, type PersonaVoiceFields } from '../prompts/voice.ts'
import { vigiaTick } from '../watchdog.ts'
import {
  FIXTURE_ATLAS,
  FIXTURE_BENTO,
  FIXTURE_HEDGE,
  FIXTURE_MANDATE_TOOLS,
  FIXTURE_NARRATION,
  FIXTURE_NINA,
  FIXTURE_RECALL_ROWS,
  FIXTURE_REQUIRED_VAULT,
  FIXTURE_SUBJECT_HISTORY,
  FIXTURE_TEAM,
  FIXTURE_TOOL_DESCRIPTIONS,
  FIXTURE_TOOL_SCHEMA,
  type FixturePersona,
} from './token-fixtures.ts'

/** How the variable layers (subject / recall) are fitted to a budget. */
export type ContextPolicy = 'raw' | 'headClip' | 'ranked'

/**
 * Which Persona MCP tools the prompt/tool list carries. The host of 04/11 sends NONE: the MCP gateway and
 * the Persona tool servers are exported and tested but no adapter calls them (the vendor's own tool schema
 * is what costs tokens there, and only a real run measures it). 'all' / 'needed' price the day they are wired.
 */
export type ToolsListing = 'all' | 'needed' | 'none'

/** What the worker prompt carries: the ticket title only (the host), or Cofre + subject + tools too (a naive harness). */
export type WorkerContext = 'title' | 'full'

/** One switch per token lever (TOKEN-OPTIMIZATION §2). */
export interface LeverSet {
  /** §2.1 deterministic pre-router: courtesy, empty, slash, injection never reach a model. */
  readonly preroute: boolean
  /**
   * A courtesy line ("valeu!", "ok") gets NO model call. The pre-router classifies it (`react`, modelCalled false), but the
   * host's ingest still runs `finishReply` for it: one talk call on the cheap tier (probe 04/11: oi, obrigado, valeu!, ok = 1 delivery each).
   */
  readonly courtesyNoModel: boolean
  /** §2.1 Vigia / routines by rules: an idle day spends no model. */
  readonly vigiaRules: boolean
  /** §2.2 OPT-3: fixed order, required Cofre in the cached prefix, nothing volatile before the tail. */
  readonly stablePrefix: boolean
  /** §2.3 OPT-4: incremental subject summary + last N instead of the raw history. */
  readonly summarizeSubject: boolean
  /** §2.3 OPT-4: budget per variable layer (head clip = Forge today; ranked = relevance first). */
  readonly context: ContextPolicy
  /** §2.4 OPT-4: only the tools the task asks for, one-line descriptions. */
  readonly toolsListing: ToolsListing
  /** §2.3 OPT-4: owner norms written once in the worker prompt. */
  readonly dedupeNorms: boolean
  /** §2.6 OPT-6: channel text without echo, step narration or hedge, capped at 100 words (host `finishHostTalk`). */
  readonly leanTalk: boolean
  /** §2.6 OPT-6: the worker prompt asks for a short structured report (Resultado / Bloqueio); evaluation reads that, not a transcript. */
  readonly leanReports: boolean
  /** §2.5 OPT-5: the chat reply runs on the cheap talk model (host `purpose: 'talk'`). */
  readonly talkOnCheap: boolean
  /** §2.5 OPT-5: triage / Vigia / initiative / librarian run on the cheap engine. Evaluation stays on the persona engine. */
  readonly supportOnCheap: boolean
  /** §2.3: what the worker prompt carries. The host sends the ticket title only (`bindExecution`). */
  readonly workerContext: WorkerContext
  /** §2.1: do not spend the coordination triage call: the host never reads its answer (no tools are served, the Ticket comes from the router). */
  readonly skipTriage: boolean
  /** §2.5 OPT-5: coordination session is warm — the system prompt is delivered once. */
  readonly warmSession: boolean
  /** §2.7 OPT-6: initiative in daily batches, only when something changed, inside a token budget. */
  readonly initiativeBudget: boolean
}

/** Everything off: what a naive harness would send. */
export const LEVERS_LEGACY: LeverSet = {
  preroute: false,
  courtesyNoModel: false,
  vigiaRules: false,
  stablePrefix: false,
  summarizeSubject: false,
  context: 'raw',
  toolsListing: 'all',
  dedupeNorms: false,
  leanTalk: false,
  leanReports: false,
  talkOnCheap: false,
  supportOnCheap: false,
  workerContext: 'full',
  skipTriage: false,
  warmSession: false,
  initiativeBudget: false,
}

/** One ladder step: a lever (or a lever policy) switched on. */
export interface LadderStep {
  readonly id: string
  readonly patch: Partial<LeverSet>
}

/** Order the ladder turns levers on; each step is one lever's before → after. */
export const LEVER_LADDER: readonly LadderStep[] = [
  { id: 'preroute', patch: { preroute: true, courtesyNoModel: true } },
  { id: 'vigiaRules', patch: { vigiaRules: true } },
  { id: 'workerContext', patch: { workerContext: 'title' } },
  { id: 'stablePrefix', patch: { stablePrefix: true } },
  { id: 'summarizeSubject', patch: { summarizeSubject: true } },
  { id: 'context:headClip', patch: { context: 'headClip' } },
  { id: 'context:ranked', patch: { context: 'ranked' } },
  { id: 'toolsListing', patch: { toolsListing: 'none' } },
  { id: 'dedupeNorms', patch: { dedupeNorms: true } },
  { id: 'leanTalk', patch: { leanTalk: true } },
  { id: 'leanReports', patch: { leanReports: true } },
  { id: 'talkOnCheap', patch: { talkOnCheap: true } },
  { id: 'supportOnCheap', patch: { supportOnCheap: true } },
  { id: 'skipTriage', patch: { skipTriage: true } },
  { id: 'warmSession', patch: { warmSession: true } },
  { id: 'initiativeBudget', patch: { initiativeBudget: true } },
]

/** Optimized configuration (what the repo ships). */
export const LEVERS_OPTIMIZED: LeverSet = {
  preroute: true,
  courtesyNoModel: true,
  vigiaRules: true,
  stablePrefix: true,
  summarizeSubject: true,
  context: 'ranked',
  toolsListing: 'none',
  dedupeNorms: true,
  leanTalk: true,
  leanReports: true,
  talkOnCheap: true,
  supportOnCheap: true,
  workerContext: 'title',
  skipTriage: true,
  warmSession: true,
  initiativeBudget: true,
}

/**
 * Lever set after switching on the first `count` ladder steps.
 * @param count - 0 = legacy, `LEVER_LADDER.length` = optimized.
 * @returns Cumulative configuration.
 */
export function leversAtStep(count: number): LeverSet {
  let next: LeverSet = LEVERS_LEGACY
  for (const step of LEVER_LADDER.slice(0, count)) next = { ...next, ...step.patch }
  return next
}

export const FAITHFUL_SCENARIO_IDS = [
  'geral-simple',
  'geral-question',
  'multi-review',
  'idle-routines',
  'initiative-30',
  'initiative-30-busy',
  'padaria-lua',
  'dia-padaria',
  'dia-espacado',
] as const

export type FaithfulScenarioId = (typeof FAITHFUL_SCENARIO_IDS)[number]

/** Cheap support engine vs the persona's own engine; list price USD per million tokens. */
export type ModelTier = 'cheap' | 'persona'

/** Public list-price shape (Haiku-class vs Sonnet-class). Estimate, not a bill. */
export const TIER_PRICE: Record<ModelTier, { readonly input: number; readonly output: number }> = {
  cheap: { input: 1, output: 5 },
  persona: { input: 3, output: 15 },
}
const CACHE_READ_FACTOR = 0.1
/** Write price of the 5 min ephemeral cache, × the input price. The 1 h cache writes at {@link CACHE_WRITE_FACTOR_1H}. */
const CACHE_WRITE_FACTOR = 1.25
export const CACHE_WRITE_FACTOR_1H = 2

const AT = '2026-11-04T09:00:00.000Z'

/** One scripted model call with its cost view. */
export interface FaithfulTurn {
  readonly entry: TurnLedgerEntry
  readonly tier: ModelTier
  /** Tokens the provider had to read fresh (input − cache read) + output. */
  readonly freshTokens: number
  /** Estimated cost in micro-USD. */
  readonly costMicroUsd: number
  /** True when an earlier call under the same cache key already warmed the prefix. */
  readonly warm: boolean
  /** The full prompt the call carried (the paired real run replays these). */
  readonly prompt: string
  /** Cache key (persona + purpose): calls with the same key share a prefix. */
  readonly cacheKey: string
  /** Prefix tokens (system + tools + required) the provider served from cache on this call. */
  readonly prefixRead: number
  /** Channel text that reached a person, when this turn posts one. */
  readonly posted?: string
}

export interface FaithfulQuality {
  readonly needles: readonly string[]
  readonly missing: readonly string[]
  /** Fraction of needles present in the final channel text (TOKEN-OPTIMIZATION §3 ready criterion). */
  readonly score: number
}

/** Engines the bench can attribute turns to; cache fields are reported only where the adapter reads them. */
export type FaithfulEngine = 'claude' | 'codex' | 'opencode' | 'cursor'

/** Vendors whose totals carry cache read/write (Rivet `cacheFromVendor`). Absence is not 0%. */
export const ENGINE_REPORTS_CACHE: Record<FaithfulEngine, boolean> = {
  claude: true,
  codex: true,
  opencode: false,
  cursor: false,
}

export interface FaithfulOptions {
  readonly engine?: FaithfulEngine
  /**
   * Steady state: play the scenario once to warm the prefix cache and the sessions, then measure
   * the second pass (a task that is not the first of the day). Default: cold, first of the day.
   */
  readonly warm?: boolean
  /** Provider cache TTL in minutes (default {@link PROVIDER_CACHE_TTL_MIN}). */
  readonly cacheTtlMin?: number
  /** Cache write price × input price. Default 1.25 (5 min cache); a 1 h TTL writes at {@link CACHE_WRITE_FACTOR_1H}. */
  readonly cacheWriteFactor?: number
}

export interface FaithfulReport {
  readonly id: FaithfulScenarioId
  readonly engine: FaithfulEngine
  /** False when the engine does not report cache: `cacheHitRate` is then not a measurement. */
  readonly cacheReported: boolean
  readonly levers: LeverSet
  readonly turns: readonly FaithfulTurn[]
  readonly entries: readonly TurnLedgerEntry[]
  /** Ledger convention: input + output (cached prefix counts as input). */
  readonly totalTokens: number
  readonly freshTokens: number
  readonly costMicroUsd: number
  readonly calls: number
  /** read / (read + write) over every call. */
  readonly cacheHitRate: number
  /** Share of the prefix served from cache once warm (the OPT-8 ≥ 60% target). 0 when nothing was warm. */
  readonly prefixHitRate: number
  readonly quality: FaithfulQuality
  /** Final text a person reads. */
  readonly finalText: string
}

/** Longest common prefix in characters. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i += 1
  return i
}

/** Provider prefix cache TTL (ephemeral cache, minutes). A gap longer than this finds the prefix cold. */
export const PROVIDER_CACHE_TTL_MIN = 5

/** OAR keeps a CLI Session in memory this long without traffic (Rivet, 04/11). */
export const SESSION_TTL_MIN = 10

/** Provider prefix cache: previous prompt and time per cache key. */
class PrefixCacheModel {
  private readonly last = new Map<string, { readonly prompt: string; readonly at: number }>()

  /**
   * @param key - Persona + purpose.
   * @param prompt - Full prompt text of this call.
   * @param nowMin - Virtual clock, minutes.
   * @param ttlMin - Entries older than this are gone.
   * @returns Tokens read from cache (common prefix) and written (the rest).
   */
  touch(key: string, prompt: string, nowMin: number, ttlMin: number): { readonly read: number; readonly write: number; readonly warm: boolean } {
    const input = estimateTokens(prompt)
    const previous = this.last.get(key)
    this.last.set(key, { prompt, at: nowMin })
    if (previous === undefined || nowMin - previous.at > ttlMin) return { read: 0, write: input, warm: false }
    const read = Math.min(input, Math.floor(commonPrefixLength(previous.prompt, prompt) / 4))
    return { read, write: input - read, warm: true }
  }
}

interface Run {
  readonly engine: FaithfulEngine
  readonly levers: LeverSet
  readonly cache: PrefixCacheModel
  readonly turns: FaithfulTurn[]
  /** Last time a warm CLI session was used, per session key. */
  readonly warm: Map<string, number>
  readonly cacheTtlMin: number
  readonly cacheWriteFactor: number
  /** Virtual clock, minutes since the first event. */
  nowMin: number
  seq: number
}

interface TurnInput {
  readonly kind: TurnKind
  readonly persona: FixturePersona
  readonly cacheKey: string
  readonly prompt: string
  readonly layers: TurnLayerSizes
  readonly output: string
  readonly tier: ModelTier
  readonly ticketId?: string
  readonly posted?: string
}

function newRun(levers: LeverSet, engine: FaithfulEngine, cacheTtlMin: number, cacheWriteFactor: number): Run {
  return { engine, levers, cache: new PrefixCacheModel(), turns: [], warm: new Map(), cacheTtlMin, cacheWriteFactor, nowMin: 0, seq: 0 }
}

/** Move the virtual clock (a gap between two messages). */
function advance(run: Run, minutes: number): void {
  run.nowMin += minutes
}

function record(run: Run, input: TurnInput): FaithfulTurn {
  run.seq += 1
  const usage = run.cache.touch(input.cacheKey, input.prompt, run.nowMin, run.cacheTtlMin)
  const inputTokens = estimateTokens(input.prompt)
  const outputTokens = estimateTokens(input.output)
  const entry = turnFromLayers({
    id: `${input.kind}-${String(run.seq)}`,
    personaId: input.persona.id,
    engine: run.engine,
    kind: input.kind,
    layers: input.layers,
    inputTokens: Math.max(inputTokens, sumOf(input.layers)),
    outputTokens,
    cacheReadTokens: ENGINE_REPORTS_CACHE[run.engine] ? usage.read : 0,
    cacheWriteTokens: ENGINE_REPORTS_CACHE[run.engine] ? usage.write : 0,
    at: AT,
    origin: 'estimate',
    ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
  })
  const price = TIER_PRICE[input.tier]
  // The provider caches either way; the ledger only shows what the adapter reports.
  const fresh = Math.max(0, entry.inputTokens - usage.read)
  const cost = (fresh * price.input
    + usage.read * price.input * CACHE_READ_FACTOR
    + (usage.write > 0 ? usage.write * price.input * (run.cacheWriteFactor - 1) : 0)
    + outputTokens * price.output)
  const turn: FaithfulTurn = {
    entry,
    tier: input.tier,
    freshTokens: fresh + outputTokens,
    costMicroUsd: Math.round(cost),
    warm: usage.warm,
    prompt: input.prompt,
    cacheKey: input.cacheKey,
    prefixRead: Math.min(usage.read, input.layers.system + input.layers.tools + input.layers.required),
    ...(input.posted === undefined ? {} : { posted: input.posted }),
  }
  run.turns.push(turn)
  return turn
}

function sumOf(layers: TurnLayerSizes): number {
  return layers.system + layers.tools + layers.required + layers.subject + layers.recall + layers.message
}

function tierFor(levers: LeverSet, kind: TurnKind): ModelTier {
  if (kind === 'reply') return levers.talkOnCheap ? 'cheap' : 'persona'
  if (kind === 'triage' || kind === 'watchdog' || kind === 'initiative' || kind === 'librarian') {
    return levers.supportOnCheap ? 'cheap' : 'persona'
  }
  return 'persona'
}

/** Rows a compile step returns for a query: the top ones by overlap, then emitted in stable id order (core `compileContext` re-sorts by kind/id). */
export function retrieveRecall(rows: readonly string[], message: string, limit: number = 8): string[] {
  return rows
    .map((row, index) => ({ row, index, score: relevanceOverlap(row, message) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(item => item.row)
}

/**
 * Fit recall rows to the variable-layer budget.
 * @param rows - Rows in retrieval order.
 * @param message - The user line of this turn.
 * @param policy - raw / head clip / relevance ranking.
 * @returns Recall text for the tail of the prompt.
 */
export function fitRecall(rows: readonly string[], message: string, policy: ContextPolicy): string {
  if (policy === 'raw') return capTalkContext(rows.join('\n'))
  if (policy === 'headClip') return clipTextToTokens(rows.join('\n'), VARIABLE_LAYER_BUDGET.recall)
  return fitRowsToBudget(rows, message, VARIABLE_LAYER_BUDGET.recall)
}

/**
 * Subject layer: raw history, or a bounded summary plus the last messages.
 * @param history - Topic messages, oldest first.
 * @param summarize - OPT-4 incremental summary on/off.
 * @param policy - Whether the layer is clipped to its budget.
 */
export function fitSubject(history: readonly string[], summarize: boolean, policy: ContextPolicy): string {
  if (!summarize) return history.join('\n')
  const recent = history.slice(-4)
  const older = history.slice(0, -4)
  let digest = ''
  for (const line of older) {
    digest = incrementalSubjectSummary(digest, keepLine(line), VARIABLE_LAYER_BUDGET.subject / 2)
  }
  const text = [digest, ...recent].filter(part => part !== '').join('\n')
  return policy === 'raw' ? text : clipTextToTokens(text, VARIABLE_LAYER_BUDGET.subject)
}

/** Decisions and rules survive the digest; chatter is squeezed (same spirit as the host fold). */
function keepLine(line: string): string {
  const KEEP = /\b(sempre|nunca|obrigat|regra|decis[aã]o|n[aã]o pode)\b/iu
  const squeezed = line.replace(/\s+/g, ' ').trim()
  if (KEEP.test(squeezed)) return squeezed
  return squeezed.length > 90 ? `${squeezed.slice(0, 87)}…` : squeezed
}

interface TalkContext {
  readonly speaker: FixturePersona
  readonly userText: string
  readonly subject: readonly string[]
  readonly recall: readonly string[]
}

function colleaguesOf(speaker: FixturePersona): TalkColleague[] {
  return FIXTURE_TEAM
    .filter(row => row.id !== speaker.id)
    .map(row => ({
      name: row.name,
      title: row.title,
      ...(row.id === 'atlas' ? { role: 'coordenação' } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const TALK_CAPABILITIES = 'resposta de conversa; sem ferramentas; sem shell; sem arquivos; nunca ecoe a mensagem da pessoa; sem placeholders (Recebido, Vou encaminhar, digitando); pedido simples responde direto; trabalho: o que entendeu, quem faz, quando volta'

/**
 * Talk prompt. `stablePrefix` off = the snapshot path (`composePersonaPrompt`,
 * everything inside the policy); on = the host path (prefix + variable tail).
 */
function talkPrompt(levers: LeverSet, ctx: TalkContext): { readonly text: string; readonly layers: TurnLayerSizes } {
  const subject = fitSubject(ctx.subject, levers.summarizeSubject, levers.context)
  const recall = fitRecall(retrieveRecall(ctx.recall, ctx.userText), ctx.userText, levers.context)
  const fields: PersonaVoiceFields = {
    identity: { name: ctx.speaker.name, title: ctx.speaker.title },
    personality: ctx.speaker.personality,
    instructions: ctx.speaker.instructions,
    functionLabel: ctx.speaker.id === 'atlas' ? 'coordenação' : ctx.speaker.title,
    vault: '',
    colleagues: colleaguesOf(ctx.speaker),
    capabilities: TALK_CAPABILITIES,
  }
  if (!levers.stablePrefix) {
    const vault = [FIXTURE_REQUIRED_VAULT, subject, recall].filter(part => part !== '').join('\n')
    const text = composePersonaPrompt({ fields: { ...fields, vault }, surface: 'talk', userText: ctx.userText })
    const system = estimateTokens(text) - estimateTokens(vault) - estimateTokens(wrapAsData('mensagem', ctx.userText))
    return {
      text,
      layers: {
        system: Math.max(0, system),
        tools: 0,
        required: estimateTokens(FIXTURE_REQUIRED_VAULT),
        subject: estimateTokens(subject),
        recall: estimateTokens(recall),
        message: estimateTokens(wrapAsData('mensagem', ctx.userText)),
      },
    }
  }
  // Host path (composeHostTalk): persona + required + hint in the prefix; subject/recall/message in the tail.
  const system = composePrompt({ part: 'talk', identity: fields.identity, policy: '' }).trim()
  const persona = composeVoicePolicy({ ...fields, vault: '' })
  const required = [FIXTURE_REQUIRED_VAULT, voiceSurfaceHint('talk')].filter(part => part !== '').join('\n\n')
  const message = wrapAsData('mensagem', ctx.userText)
  const built = composeStablePrefix({ system, persona, tools: '', required, subject, recall, message })
  const variable = trimVariableAlreadyInPrefix(built.prefix, built.variable)
  return { text: variable === '' ? built.prefix : `${built.prefix}\n\n${variable}`, layers: built.layers }
}

/** Needle-bearing sentences the scripted model can state when the evidence is in its prompt. */
interface Fact {
  readonly evidence: string
  readonly sentence: string
}

function stateFacts(prompt: string, facts: readonly Fact[]): string {
  const known = facts.filter(fact => prompt.includes(fact.evidence)).map(fact => fact.sentence)
  return known.length > 0 ? known.join(' ') : 'Não encontrei essa informação no contexto.'
}

/**
 * Scripted model output. Without brevity rules in the prompt it echoes the
 * question, narrates a step and offers hedged follow-up (what lean output removes).
 */
function scriptedReply(prompt: string, userText: string, facts: readonly Fact[]): string {
  const content = stateFacts(prompt, facts)
  const brief = prompt.includes('Curto: 1 a 3 frases')
  if (brief) return content
  return `${userText}\n${FIXTURE_NARRATION}\nAnalisei o contexto disponível e o histórico do assunto antes de responder, para não repetir o que já foi combinado.\n${content}\n${FIXTURE_HEDGE}`
}

function postable(levers: LeverSet, raw: string, userText: string): string {
  return levers.leanTalk ? leanChannelReply(raw, userText) : raw.split(/\s+/).slice(0, 400).join(' ')
}

function routeInput(text: string, at: number): PreRouteInput {
  return {
    text,
    senderId: 'ana',
    threadKey: '#geral',
    at,
    personas: FIXTURE_TEAM.map(row => ({ id: row.id, name: row.name })),
    budgetLeft: true,
    silenceUntil: 0,
    canCommand: () => true,
    window: [],
  }
}

/** True when a person message reaches a model under this lever set. */
function needsModel(levers: LeverSet, text: string, at: number): boolean {
  if (!levers.preroute) return true
  const routed = preRoute(routeInput(text, at))
  // The host answers a courtesy line with a talk call even though the rule says no model (see `courtesyNoModel`).
  if (routed.rule === 'courtesy' && !levers.courtesyNoModel) return true
  return routed.modelCalled
}

function talkTurn(run: Run, ctx: TalkContext, facts: readonly Fact[], ticketId?: string): FaithfulTurn {
  const built = talkPrompt(run.levers, ctx)
  const raw = scriptedReply(built.text, ctx.userText, facts)
  const posted = postable(run.levers, raw, ctx.userText)
  return record(run, {
    kind: 'reply',
    persona: ctx.speaker,
    cacheKey: `${ctx.speaker.id}:talk`,
    prompt: built.text,
    layers: built.layers,
    output: raw,
    tier: tierFor(run.levers, 'reply'),
    posted,
    ...(ticketId === undefined ? {} : { ticketId }),
  })
}

/** Coordination prompt: the same four template parts the host session carries. */
export function coordinationPromptText(persona: FixturePersona): string {
  const policy = [
    `Forbidden tools: ${ROUTER_FORBIDDEN_TOOLS.join(', ')}. Never request a shell.`,
    'Events that arrive while you are inferring wait for the next turn (non-blocking; D-041).',
    '',
  ].join('\n')
  return (['coordinator', 'dispatch', 'replies', 'subscriptions'] as const)
    .map(part => composePrompt({ part, identity: { name: persona.name, title: 'Coordenação' }, policy }))
    .join('\n')
}

const OWNER_NORMS = [
  'Normas de dono:',
  '- Termine o que o mandato pede. Não devolva trabalho que cabe a você.',
  '- Verifique o critério de aceite com evidência (teste, arquivo, comando).',
  '- Reporte com evidência (IDs, caminhos, resultado).',
  '- Proponha o próximo passo que descobriu — proposta estruturada, não "posso fazer se você quiser".',
  '- Proibido encerrar com "posso fazer X se você quiser" quando X está no mandato: faça e reporte.',
].join('\n')

/**
 * Tokens of the host talk prompt for `persona` answering `userText`, with no subject and no recall (the floor `estimateAsk`
 * starts from). The colleagues listed in it are the fixture team: a real team of another size moves it a little.
 * @param persona - Who answers.
 * @param userText - The person's message.
 */
export function talkPromptTokens(persona: FixturePersona, userText: string): number {
  return estimateTokens(talkPrompt(LEVERS_AS_WIRED, { speaker: persona, userText, subject: [], recall: [] }).text)
}

/** Worker system prompt; `dedupe` drops the template's own owner-norms paragraph. */
export function workerPromptText(persona: FixturePersona, dedupe: boolean, leanReport: boolean = false): string {
  const text = composePrompt({
    part: 'worker',
    identity: { name: persona.name, title: persona.title },
    policy: `${OWNER_NORMS}\n\nPersona instructions:\n${persona.instructions}`,
    dedupeOwnerNorms: dedupe,
    leanReport,
  })
  return text
}

function toolsText(levers: LeverSet, needed: readonly string[]): string {
  if (levers.toolsListing === 'none') return ''
  const names = levers.toolsListing === 'needed' ? toolsForTurn(FIXTURE_MANDATE_TOOLS, needed) : [...FIXTURE_MANDATE_TOOLS]
  return names
    .map((name) => {
      const description = FIXTURE_TOOL_DESCRIPTIONS[name] ?? name
      return `- ${name}: ${minifyToolDescription(description)} ${FIXTURE_TOOL_SCHEMA}`
    })
    .join('\n')
}

interface TriageInput {
  readonly userText: string
  readonly subject: readonly string[]
  readonly ticketTitle: string
}

function triageTurn(run: Run, input: TriageInput): FaithfulTurn {
  const coordination = coordinationPromptText(FIXTURE_ATLAS)
  const key = 'atlas:coordination'
  const lastUse = run.warm.get(key)
  const warm = run.levers.warmSession && lastUse !== undefined && run.nowMin - lastUse <= SESSION_TTL_MIN
  run.warm.set(key, run.nowMin)
  const subject = fitSubject(input.subject, run.levers.summarizeSubject, run.levers.context)
  const card = [
    'Candidato: pedido de Ana no #geral',
    wrapAsData('mensagem', input.userText),
    subject === '' ? '' : `Assunto:\n${subject}`,
  ].filter(part => part !== '').join('\n')
  // Cold coordination: the long prompt rides in every delivery. Warm: delivered once.
  const prompt = warm ? card : `${coordination}\n\n${card}`
  const decision = `persona_route {"to":"${FIXTURE_NINA.id}","title":"${input.ticketTitle}"}`
  const output = decision
  return record(run, {
    kind: 'triage',
    persona: FIXTURE_ATLAS,
    cacheKey: 'atlas:coordination',
    prompt,
    layers: {
      system: warm ? 0 : estimateTokens(coordination),
      tools: 0,
      required: 0,
      subject: estimateTokens(subject),
      recall: 0,
      message: estimateTokens(card) - estimateTokens(subject),
    },
    output,
    tier: tierFor(run.levers, 'triage'),
    ticketId: 'ticket-1',
  })
}

interface ExecutionInput {
  readonly persona: FixturePersona
  /** The ticket title: what the host hands the worker as its assignment (`bindExecution`). */
  readonly title: string
  /** Naive harness only: the extras a harness that stuffs everything into the worker prompt would add. */
  readonly acceptance: string
  readonly subject: readonly string[]
  readonly recall: readonly string[]
  readonly neededTools: readonly string[]
  readonly facts: readonly Fact[]
  readonly resultLine: string
}

/**
 * Worker turn. The host sends `executorPrompt` + the ticket title and NOTHING else: no Cofre, no subject, no
 * tool list (`workerContext: 'title'`; `bindExecution` sets `assignment = ticket.title`). A naive harness would
 * send everything (`'full'`). The scripted worker only states what its prompt carries.
 */
function executionTurn(run: Run, input: ExecutionInput): FaithfulTurn {
  const system = workerPromptText(input.persona, run.levers.dedupeNorms, run.levers.leanReports)
  let prompt: string
  let layers: TurnLayerSizes
  if (run.levers.workerContext === 'title') {
    prompt = `${system}\n\n${input.title}`
    layers = { system: estimateTokens(system), tools: 0, required: 0, subject: 0, recall: 0, message: estimateTokens(input.title) }
  } else {
    const subject = fitSubject(input.subject, run.levers.summarizeSubject, run.levers.context)
    const recall = fitRecall(retrieveRecall(input.recall, input.title), input.title, run.levers.context)
    const tools = toolsText(run.levers, input.neededTools)
    const assignment = [
      `Tarefa: ${input.title}`,
      `Critério de pronto: ${input.acceptance}`,
      subject === '' ? '' : `Assunto:\n${subject}`,
      recall === '' ? '' : `Contexto:\n${recall}`,
    ].filter(part => part !== '').join('\n')
    const required = FIXTURE_REQUIRED_VAULT
    const prefix = run.levers.stablePrefix
      ? [system, tools, required].join('\n\n')
      : [system, required, tools].join('\n\n')
    prompt = `${prefix}\n\n${assignment}`
    layers = {
      system: estimateTokens(system),
      tools: estimateTokens(tools),
      required: estimateTokens(required),
      subject: estimateTokens(subject),
      recall: estimateTokens(recall),
      message: estimateTokens(assignment) - estimateTokens(subject) - estimateTokens(recall),
    }
  }
  const known = stateFacts(prompt, input.facts)
  const raw = prompt.includes(WORKER_LEAN_REPORT_RULE)
    ? `Resultado: ${input.resultLine} ${known}\nBloqueio: nenhum.`
    : `${FIXTURE_NARRATION}\nPasso 1. Li a tarefa.\nPasso 2. Conferi o que o pedido exige.\nPasso 3. Executei o trabalho e anotei o que decidi e o que falta.\nResultado: ${input.resultLine} ${known}\n${FIXTURE_HEDGE}`
  return record(run, {
    kind: 'execution',
    persona: input.persona,
    cacheKey: `${input.persona.id}:worker`,
    prompt,
    layers,
    output: raw,
    tier: tierFor(run.levers, 'execution'),
    ticketId: 'ticket-1',
    posted: leanChannelReply(raw),
  })
}

/**
 * The coordination triage deliver. Its text is never read by the host (no MCP tools are served, the Ticket
 * comes from the deterministic router), so `skipTriage` removes the call without changing what is delivered.
 */
function triage(run: Run, input: TriageInput): void {
  if (run.levers.skipTriage) return
  triageTurn(run, input)
}

function qualityOf(finalText: string, needles: readonly string[]): FaithfulQuality {
  const lower = finalText.toLowerCase()
  const missing = needles.filter(needle => !lower.includes(needle.toLowerCase()))
  return { needles, missing, score: needles.length === 0 ? 1 : (needles.length - missing.length) / needles.length }
}

/** Prefix cache read ÷ prefix tokens, over the calls that were already warm. */
function prefixHitRateOf(turns: readonly FaithfulTurn[]): number {
  let read = 0
  let prefix = 0
  for (const turn of turns) {
    if (!turn.warm) continue
    read += turn.prefixRead
    prefix += turn.entry.layers.system + turn.entry.layers.tools + turn.entry.layers.required
  }
  return prefix === 0 ? 0 : read / prefix
}

function finish(id: FaithfulScenarioId, run: Run, finalText: string, needles: readonly string[]): FaithfulReport {
  const entries = run.turns.map(turn => turn.entry)
  let read = 0
  let write = 0
  let tokens = 0
  for (const entry of entries) {
    read += entry.cacheReadTokens
    write += entry.cacheWriteTokens
    tokens += entry.inputTokens + entry.outputTokens
  }
  return {
    id,
    engine: run.engine,
    cacheReported: ENGINE_REPORTS_CACHE[run.engine],
    levers: run.levers,
    turns: run.turns,
    entries,
    totalTokens: tokens,
    freshTokens: run.turns.reduce((sum, turn) => sum + turn.freshTokens, 0),
    costMicroUsd: run.turns.reduce((sum, turn) => sum + turn.costMicroUsd, 0),
    calls: run.turns.length,
    cacheHitRate: read + write === 0 ? 0 : read / (read + write),
    prefixHitRate: prefixHitRateOf(run.turns),
    quality: qualityOf(finalText, needles),
    finalText,
  }
}

const STANDUP_FACT: Fact = {
  evidence: 'standup às 10h no canal #geral',
  sentence: 'O standup é às 10h, no #geral.',
}

const TURNS_PER_VIGIA_DAY = 96
const ROUTINES_PER_DAY = 3

/**
 * One scripted scenario at a lever set.
 * @param id - Scenario row.
 * @param levers - Lever switches (defaults to optimized).
 * @returns Ledger, cost view and quality.
 */
export function runFaithfulScenario(
  id: FaithfulScenarioId,
  levers: LeverSet = LEVERS_OPTIMIZED,
  options: FaithfulOptions = {},
): FaithfulReport {
  const run = newRun(levers, options.engine ?? 'claude', options.cacheTtlMin ?? PROVIDER_CACHE_TTL_MIN, options.cacheWriteFactor ?? CACHE_WRITE_FACTOR)
  const play = (): FaithfulReport => playScenario(id, run)
  if (options.warm === true) {
    play()
    run.turns.length = 0
    run.seq = 0
  }
  return play()
}

function playScenario(id: FaithfulScenarioId, run: Run): FaithfulReport {
  if (id === 'geral-simple') return geralSimple(run)
  if (id === 'geral-question') return geralQuestion(run)
  if (id === 'multi-review') return multiReview(run)
  if (id === 'padaria-lua') return padariaLua(run)
  if (id === 'dia-padaria') return diaPadaria(run)
  if (id === 'dia-espacado') return diaPadaria(run, 30, 'dia-espacado')
  if (id === 'idle-routines') return idleRoutines(run)
  return initiative30(run, id === 'initiative-30-busy' ? 5 : 0)
}

/** Standup question in #geral: one talk turn, or none when a rule answers it. */
function askStandup(run: Run, at: number): string {
  const text = 'Qual o horário do standup?'
  if (!needsModel(run.levers, text, at)) return ''
  return talkTurn(run, { speaker: FIXTURE_ATLAS, userText: text, subject: [], recall: FIXTURE_RECALL_ROWS }, [STANDUP_FACT]).posted ?? ''
}

/** Courtesy line ("ok", "valeu"): the pre-router answers it; legacy asks a model. */
function courtesy(run: Run, text: string, at: number, history: readonly string[]): void {
  if (!needsModel(run.levers, text, at)) return
  talkTurn(run, { speaker: FIXTURE_ATLAS, userText: text, subject: history, recall: FIXTURE_RECALL_ROWS }, [])
}

/** A work message: triage (a call whose answer nobody reads) then the worker on the ticket title. */
function workMessage(
  run: Run,
  at: number,
  input: {
    readonly ask: string
    readonly persona: FixturePersona
    readonly subject: readonly string[]
    readonly acceptance: string
    readonly facts: readonly Fact[]
    readonly resultLine: string
  },
): string {
  if (!needsModel(run.levers, input.ask, at)) return ''
  triage(run, { userText: input.ask, subject: input.subject, ticketTitle: input.ask })
  const exec = executionTurn(run, {
    persona: input.persona,
    title: input.ask,
    acceptance: input.acceptance,
    subject: input.subject,
    recall: FIXTURE_RECALL_ROWS,
    neededTools: ['persona_report', 'persona_recall'],
    facts: input.facts,
    resultLine: input.resultLine,
  })
  return exec.posted ?? ''
}

/** "Implemente o filtro": Nina executes; the title carries what the answer needs. */
function filterTask(run: Run, at: number): string {
  return workMessage(run, at, {
    ask: 'Implemente o filtro de pedidos.',
    persona: FIXTURE_NINA,
    subject: [],
    acceptance: 'filtro por data e status funcionando, com teste',
    facts: [{ evidence: 'filtro de pedidos', sentence: 'Filtro de pedidos pronto, com teste.' }],
    resultLine: 'patch aplicado e testes passando.',
  })
}

/** Review is a second message to Bento (the host runs no evaluation turn): triage + his own execution. */
function reviewMessage(run: Run, at: number): string {
  return workMessage(run, at, {
    ask: 'Bento, revise o filtro de pedidos.',
    persona: FIXTURE_BENTO,
    subject: [],
    acceptance: 'filtro revisado contra o critério de pronto',
    facts: [{ evidence: 'revise o filtro de pedidos', sentence: 'Revisão do filtro de pedidos: aprovado, com uma ressalva de teste.' }],
    resultLine: 'revisão concluída.',
  })
}

/** Padaria Lua order: triage + the worker. The worker never sees the Cofre or the subject, only the title. */
function weekendOrder(run: Run, at: number): string {
  return workMessage(run, at, {
    ask: 'Cardápio de sábado e encomenda da Ana.',
    persona: FIXTURE_NINA,
    subject: FIXTURE_SUBJECT_HISTORY,
    acceptance: 'cardápio fechado e encomenda da Ana confirmada com quantidade e horário',
    facts: [
      { evidence: 'Cardápio de sábado', sentence: 'Cardápio de sábado montado; encomenda da Ana separada para retirada.' },
      { evidence: '40 pães', sentence: 'Encomenda da Ana: 40 pães de fermentação natural e 1 bolo de fubá, retirada às 9h.' },
    ],
    resultLine: 'cardápio fechado.',
  })
}

/** Follow-up on the subject: the answer lives in the raw history, not in the Cofre. */
function swapQuestion(run: Run, at: number): string {
  const text = 'A Ana pode trocar o bolo de fubá por cenoura?'
  if (!needsModel(run.levers, text, at)) return ''
  return talkTurn(run, {
    speaker: FIXTURE_ATLAS, userText: text, subject: FIXTURE_SUBJECT_HISTORY, recall: FIXTURE_RECALL_ROWS,
  }, [{ evidence: 'trocar o bolo de fubá por um de cenoura', sentence: 'Pode sim: bolo de cenoura tem a mesma massa base; a Nina avisa na sexta.' }]).posted ?? ''
}

/** Broad question: many Cofre notes match, and the one that answers sits late in id order. */
function broadFriday(run: Run, at: number): string {
  const text = 'Como está a sexta? Vitrine, embalagem, fornecedor de farinha, freezer, pedido e encomenda da Ana.'
  if (!needsModel(run.levers, text, at)) return ''
  return talkTurn(run, {
    speaker: FIXTURE_ATLAS, userText: text, subject: FIXTURE_SUBJECT_HISTORY, recall: FIXTURE_RECALL_ROWS,
  }, [{ evidence: 'embalagem kraft acaba em duas semanas', sentence: 'A embalagem kraft acaba em duas semanas; a Nina faz o pedido ao fornecedor.' }]).posted ?? ''
}

/** The standup question alone: what the paired comparison with a CLI asked once calls the "simple ask". */
function geralQuestion(run: Run): FaithfulReport {
  const finalText = askStandup(run, 1)
  return finish('geral-question', run, finalText, ['10h'])
}

function geralSimple(run: Run): FaithfulReport {
  const finalText = askStandup(run, 1)
  courtesy(run, 'ok', 2, ['Qual o horário do standup?', finalText])
  return finish('geral-simple', run, finalText, ['10h'])
}

function multiReview(run: Run): FaithfulReport {
  const built = filterTask(run, 1)
  advance(run, 1)
  const reviewed = reviewMessage(run, 2)
  return finish('multi-review', run, `${built} ${reviewed}`.trim(), ['filtro', 'revis'])
}

function padariaLua(run: Run): FaithfulReport {
  return finish('padaria-lua', run, weekendOrder(run, 1), ['cardápio', 'Ana'])
}

/**
 * A day in the #geral: seven lines, five reach a model, one is a two-step task.
 * `gapMin` is the time between lines: 1 = a burst (sessions and cache stay warm); 30 = a team that
 * writes through the day (cache gone after 5 min, session after 10 min).
 */
function diaPadaria(run: Run, gapMin: number = 1, id: FaithfulScenarioId = 'dia-padaria'): FaithfulReport {
  const outputs: string[] = []
  const step = (): void => { advance(run, gapMin) }
  outputs.push(askStandup(run, 1))
  step()
  courtesy(run, 'ok', 2, [])
  step()
  outputs.push(weekendOrder(run, 3))
  step()
  courtesy(run, 'valeu!', 4, FIXTURE_SUBJECT_HISTORY)
  step()
  outputs.push(swapQuestion(run, 5))
  step()
  outputs.push(filterTask(run, 6))
  step()
  outputs.push(reviewMessage(run, 7))
  step()
  outputs.push(broadFriday(run, 8))
  return finish(id, run, outputs.join(' | '), ['10h', 'cardápio', 'Ana', 'cenoura', 'filtro', 'revis', 'kraft'])
}

/** Cheap support prompt for a Vigia / routine tick when a model would be asked. */
function supportPrompt(kind: 'watchdog' | 'initiative', persona: FixturePersona, state: string): { readonly text: string; readonly layers: TurnLayerSizes } {
  const system = composePrompt({
    part: kind === 'watchdog' ? 'watchdog' : 'talk',
    identity: { name: persona.name, title: kind === 'watchdog' ? 'Vigia' : persona.title },
    policy: composeVoicePolicy({
      identity: { name: persona.name, title: persona.title },
      personality: persona.personality,
      instructions: persona.instructions,
      functionLabel: kind === 'watchdog' ? 'vigia' : persona.title,
      vault: '',
    }),
  })
  const text = `${system}\n\n${state}`
  return { text, layers: measureLayers({ system, message: state }) }
}

function idleRoutines(run: Run): FaithfulReport {
  const state = 'Estado: equipe ociosa, nenhuma Tarefa aberta, nenhuma meta aberta, fila vazia. Nada falhou.'
  for (let tick = 0; tick < TURNS_PER_VIGIA_DAY; tick += 1) {
    if (run.levers.vigiaRules) {
      // Rules decide (assign / plan / recover); `needsModel` is always false, so no call is made.
      vigiaTick({
        now: tick * 15 * 60_000,
        openGoal: false,
        stalledTicketIds: [],
        failingEffectKeys: [],
        unavailableEvalIds: [],
        budgetLeft: true,
        personas: FIXTURE_TEAM.map(row => ({ personaId: row.id, idle: true, queueLength: 0, lastProgressAt: 0, sameReportCount: 0 })),
      })
      continue
    }
    const built = supportPrompt('watchdog', FIXTURE_ATLAS, state)
    record(run, {
      kind: 'watchdog', persona: FIXTURE_ATLAS, cacheKey: 'atlas:watchdog', prompt: built.text, layers: built.layers,
      output: 'nada a fazer.',
      tier: tierFor(run.levers, 'watchdog'),
    })
  }
  for (let routine = 0; routine < ROUTINES_PER_DAY; routine += 1) {
    if (run.levers.vigiaRules) continue
    const built = supportPrompt('watchdog', FIXTURE_ATLAS, `Rotina ${String(routine + 1)} do dia: lembrete fixo, sem objetivo aberto.`)
    record(run, {
      kind: 'watchdog', persona: FIXTURE_ATLAS, cacheKey: 'atlas:routine', prompt: built.text, layers: built.layers,
      output: 'lembrete enviado.', tier: tierFor(run.levers, 'watchdog'),
    })
  }
  return finish('idle-routines', run, 'equipe ociosa sem gasto', [])
}

function initiative30(run: Run, busy: number): FaithfulReport {
  const personas: FixturePersona[] = Array.from({ length: 30 }, (_, index) => ({
    id: `p${String(index)}`,
    name: `Persona${String(index)}`,
    title: index % 3 === 0 ? 'Atendimento' : index % 3 === 1 ? 'Produção' : 'Compras',
    personality: FIXTURE_NINA.personality,
    instructions: FIXTURE_NINA.instructions,
  }))
  const changed = new Set(personas.slice(0, busy).map(row => row.id))
  const drafts: InitiativeDraft[] = []
  for (const persona of personas) {
    if (run.levers.initiativeBudget && !changed.has(persona.id)) continue
    drafts.push({ id: `${persona.id}-1`, personaId: persona.id, title: 'verificar pendências', day: '2026-11-04' })
    if (changed.has(persona.id) && !run.levers.initiativeBudget) {
      drafts.push({ id: `${persona.id}-2`, personaId: persona.id, title: 'adiantar o próximo passo', day: '2026-11-04' })
    }
  }
  const batches = run.levers.initiativeBudget ? batchInitiative(trimInitiativeToBudget(drafts, 120, INITIATIVE_DAILY_TOKEN_BUDGET)) : drafts.map(draft => ({ personaId: draft.personaId, day: draft.day, ids: [draft.id] }))
  for (const batch of batches) {
    const persona = personas.find(row => row.id === batch.personaId) ?? FIXTURE_NINA
    const state = `Iniciativa do dia ${batch.day}: ${String(batch.ids.length)} item(ns) (${batch.ids.join(', ')}).${changed.has(persona.id) ? ' Houve mudança nos cartões da sua área.' : ' Nada mudou desde a última passada.'}`
    const built = supportPrompt('initiative', persona, run.levers.initiativeBudget ? state : `${state}\nRecall:\n${FIXTURE_RECALL_ROWS.join('\n')}`)
    record(run, {
      kind: 'initiative', persona, cacheKey: `${persona.id}:initiative`, prompt: built.text, layers: built.layers,
      output: 'proposta: revisar o cartão com mudança.',
      tier: tierFor(run.levers, 'initiative'),
    })
  }
  return finish(busy === 0 ? 'initiative-30' : 'initiative-30-busy', run, busy === 0 ? 'sem iniciativa necessária' : 'propostas em lote', [])
}

/** One lever's before → after on one scenario. */
export interface LeverStep {
  readonly lever: string
  readonly before: FaithfulReport
  readonly after: FaithfulReport
}

/**
 * Ladder from legacy to optimized, one lever per step.
 * @param id - Scenario.
 * @returns Steps in {@link LEVER_LADDER} order.
 */
export function leverLadder(id: FaithfulScenarioId): LeverStep[] {
  const steps: LeverStep[] = []
  let before = runFaithfulScenario(id, leversAtStep(0))
  LEVER_LADDER.forEach((step, index) => {
    const after = runFaithfulScenario(id, leversAtStep(index + 1))
    steps.push({ lever: step.id, before, after })
    before = after
  })
  return steps
}

/** Cumulative levers where the context policy stops at head clip (what Forge shipped). */
export const LEVERS_FORGE_SHIPPED: LeverSet = { ...LEVERS_OPTIMIZED, context: 'headClip' }

/**
 * What the host runs now (04/11, after W1 and W4): talk on the cheap model, pre-router, Vigia rules, stable
 * prefix, subject summary, the warm coordination session (OAR keeps the Session in memory per
 * persona|cwd|model, TTL 10 min — messages further apart pay the ~500-token coordination prompt again),
 * recall ranked by the question (W4), triage on the cheap answer-only runner (W1, now moot) and NO triage
 * call at all (`skipTriage`, D-073: nothing reads its answer) and a persona REACTION instead of a talk call for a
 * courtesy line (`courtesyNoModel`, D-075). It sends NO Persona MCP tool list (no adapter
 * calls the gateway). NOT on: the short worker report (W3, off by decision until a real-model check). W5 (burst batching) is retired: the host already folds a burst into follow-ups of the live Task.
 */
export const LEVERS_AS_WIRED: LeverSet = {
  ...LEVERS_OPTIMIZED,
  leanReports: false,
}

/** The host before W1 and W4 (13:30): head-clip recall and triage on the executor's runner. */
export const LEVERS_BEFORE_WIRING: LeverSet = {
  ...LEVERS_AS_WIRED,
  context: 'headClip',
  supportOnCheap: false,
  skipTriage: false,
  courtesyNoModel: false,
}
