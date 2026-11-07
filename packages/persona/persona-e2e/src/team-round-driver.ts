/**
 * TEAM-10 driver: ONE request of the person (Padaria Lua + the poster image) to a team of 3 haiku personas on the TREE host through the web harness. The same code runs the
 * FAKE rehearsal (stubs, 0 AI) and the REAL round (the person's own logged-in `claude`); only `engine` differs, so "green on the fake" is about the same configuration.
 *
 * Order, and what protects the quota: (1) the host starts with a CLEAN environment (no Vitest variables, no pins) and the app's production defaults; (2) PREFLIGHT before the
 * request — the boot line says the four switches are ON with `defaults=production`, `claude` is available and logged in, nothing else is loaded; (3) the team is seeded by the
 * hosts's own remotes (3× createPersona, `act` autonomy), the poster is attached and ONE message is posted; (4) a watchdog reads the run's `turn_ledger` every 1.5 s and kills the
 * host above the cap or at the first turn that weighs like the native mode; (5) when the thread has been quiet for `quietMs` (or the deadline passes) the harness collects the
 * thread, the Tasks, the screens and the reading transcript, stops the host and reads the database for the verdict (`evaluateTeamRound`).
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hostRpcOk } from './gauge-sb-ges.ts'
import { readHostFlags, v11FlagsOn, type HostFlags } from './host-flags.ts'
import { readLedgerEvidence, type LedgerEvidence } from './ledger-evidence.ts'
import { REPO_ROOT } from './paths.ts'
import { openRealPersonaApp, type RealPersonaSession } from './real-app-session.ts'
import { buildPosterPng, POSTER_ALT } from './team-image-fixture.ts'
import { createAskAnswerer, type AnsweredAsk } from './team-round-asks.ts'
import { isolationProofProblems, ledgerGuard } from './team-round-guard.ts'
import { evaluateTeamRound, type TeamRoundVerdict } from './team-round-verdict.ts'
import { humanizeLine, readTeamTranscript, renderTranscriptMarkdown, type TeamTranscript } from './team-transcript.ts'
import { channelMessages, personasOf, postAsPerson, v11Tenant, type HostMessage, type V11Tenant } from './v11-helpers.ts'

/** Thrown for every refusal BEFORE the request is posted: nothing was asked of the model, so nothing was spent (the budget does not count it as an attempt). */
export class PreflightRefusal extends Error {}

/**
 * D-097 (Atlas 05/11): a NATURAL request, the way the person writes it — no mention, no word that switches a tool on. Whether the team collaborates is then the model's call, and
 * the verdict reports "não colaborou" as a finding about the team (attempt 1 used magic words and the worker never saw them: the title was cut).
 *
 * Attempt 2 asked for the poster with NO facts ("a promoção da Padaria Lua"): the Téo (Arte) did the RIGHT thing and asked the person — "Pergunta 1 de 4: qual é a promoção?" — and
 * the round had nothing more to measure. Attempt 3 (Atlas 07/11, `atlas-ok-team10-3.txt`; Bolt's text) is natural AND self-sufficient: the offer, price, days and channel are in
 * the request and both parts are asked for as a person would ("texto e arte"), still with no word that names a tool. If the team asks anyway, the harness answers (`team-round-asks.ts`).
 */
export const REQUEST_TEXT = 'Faz o cartaz da promoção do pão de queijo da Padaria Lua para o Instagram: 2 por R$ 9 de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. Preciso do texto e da arte; a foto é o rascunho atual.'
export const ATTACHMENT_NAME = 'foto.png'

/**
 * The last words of the stub's long delivery. The real round of 07/11 showed the reviewer got only the START of an author's delivery (the review note is clipped to 290 characters: "o bilhete foi
 * cortado logo após a menção ao SVG, não consegui conferir a arte"); a delivery that is far longer than that and ends in this marker lets the fake prove the WHOLE of it reaches the reviewer.
 */
export const DELIVERY_END = 'FIM-DA-ENTREGA-COMPLETA'
const LONG_DELIVERY = [
  'Aqui está a minha parte, pronta para a revisão.',
  ...Array.from({ length: 8 }, (_, index) => `Item ${String(index + 1)}: o cartaz do pão de queijo da Padaria Lua mostra a oferta "2 por R$ 9", de sexta a domingo, com o contato do WhatsApp no rodapé e o destaque em vermelho sobre o fundo azul.`),
  `Conferência final: valores, dias e telefone iguais ao pedido. ${DELIVERY_END}`,
].join('\n')

interface CastMember { readonly id: string; readonly name: string; readonly title: string; readonly description: string; readonly instructions: string; readonly avatarRef: string }

/** The team of the round (plan §1): a lead who also reviews, a writer, a designer. Roles and habits are what the person would write in the persona editor. */
export const CAST: readonly CastMember[] = [
  {
    id: 'lia', name: 'Lia', title: 'Coordenação', avatarRef: 'sol',
    description: 'Coordena a equipe da Padaria Lua e revisa o que sai para a pessoa.',
    instructions: 'Você coordena a equipe da Padaria Lua. Fale em português, curto e claro.',
  },
  {
    id: 'bia', name: 'Bia', title: 'Texto', avatarRef: 'luna',
    description: 'Escreve os textos curtos das campanhas da Padaria Lua.',
    instructions: 'Você escreve textos curtos de campanha. Fale em português, curto e claro.',
  },
  {
    id: 'teo', name: 'Téo', title: 'Arte', avatarRef: 'raposa',
    description: 'Cuida da arte dos cartazes da Padaria Lua.',
    instructions: 'Você cuida da arte dos cartazes e, quando olha uma imagem, descreve em palavras o que vê (cores e formas). Fale em português, curto e claro.',
  },
]

export interface TeamRoundOptions {
  readonly engine: 'fake' | 'real'
  /** Where the proof, the screenshots, the transcripts and the database copy go. */
  readonly outDir: string
  /** Kept `PERSONA_HOME` of the host (its database is read after the stop). */
  readonly home: string
  /** The cap of paid turns: the app limiter's value (real) and the watchdog's. */
  readonly cap: number
  /** Absolute, FRESH ledger file of the app's own limiter (real only). */
  readonly ledgerFile?: string
  /** Hard stop of the whole round. */
  readonly deadlineMs: number
  /** The thread, the Tasks and the ledger unchanged this long = the team is done. */
  readonly quietMs: number
}

export interface TeamRoundResult {
  readonly engine: 'fake' | 'real'
  readonly preflight: { readonly isolation?: { readonly version: string; readonly fingerprint: string; readonly problems: readonly string[] } | undefined; readonly hostFlags: HostFlags | undefined; readonly flagsOn: boolean; readonly claudeReady: boolean | undefined; readonly personas: readonly string[] }
  readonly attachmentId: string
  readonly requestId: string
  /** Why the watchdog killed the host, if it did. */
  readonly aborted: string | undefined
  readonly timedOut: boolean
  readonly ledger: LedgerEvidence | undefined
  readonly transcript: TeamTranscript | undefined
  readonly verdict: TeamRoundVerdict | undefined
  readonly threadLines: number
  readonly reading: { readonly shown: number; readonly hidden: number; readonly markdown: string }
  readonly stubImageTurns: number | undefined
  /**
   * Fake only: stub turns whose prompt contained the WHOLE text of the request (the stub logs the presence of `REQUEST_TEXT`, never the prompt). Attempt 1 of the real round failed
   * because the worker got a cut title; at least one turn must see the request whole. `undefined` on the real engine (the real prompt is not observable from here).
   */
  readonly stubRequestTurns: number | undefined
  /** The question cards of the team the HARNESS answered as the person (attempt 3), in order, and why it stopped answering if it did (asked again after the last round, the host failed). */
  readonly answeredAsks: readonly AnsweredAsk[]
  readonly askStopped: string | undefined
  readonly shots: readonly string[]
  readonly elapsedMs: number
  /** D-092: the provider's own quota windows (weekly %…) read through the host before the request and after the last answer; `null` when the runner exposed none. */
  readonly quota: { readonly before: unknown; readonly after: unknown }
  /** "Bom dia" right now (Bolt's `postDailyBriefNow`, no model): what the host answered and whether any paid turn was booked by asking for it. */
  readonly morningBrief: { readonly day: unknown; readonly forRequest: unknown; readonly turnsBefore: number; readonly turnsAfter: number } | undefined
  /** Anvil's support dump read at the end: the short lines the host kept for what failed softly (`subject-fold:`, `compile-context:`, `boot-project:`…) and the flags it resolved. */
  readonly diagnostics: { readonly lastErrors: readonly string[]; readonly flags: unknown } | undefined
  /** The `[persona-host] soft …` lines the host wrote to its stderr (once per kind, outside Vitest). */
  readonly hostSoftLines: readonly string[]
}

type Loose = Record<string, unknown>
const field = (row: Loose, name: string): Loose | undefined => (row[name] !== null && typeof row[name] === 'object' ? row[name] as Loose : undefined)

async function readingTranscript(rows: readonly HostMessage[], names: Readonly<Record<string, string>>): Promise<{ shown: number; hidden: number; markdown: string }> {
  const { analyzeTeamStreamNoise } = (await import(pathToFileURL(join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'src', 'client', 'teamwork', 'team-lines-model.ts')).href)) as {
    analyzeTeamStreamNoise: (rows: readonly Loose[]) => { hiddenIndices: ReadonlySet<number>; reviewSkippedCount: number }
  }
  const loose = rows as unknown as Loose[]
  const analysis = analyzeTeamStreamNoise(loose.map(row => ({
    authorId: row.actorId, type: row.type, harnessStatus: field(row, 'harness')?.outcome, handoff: row.handoff, review: row.review,
    teamPlan: row.teamPlan, deliveryCard: row.deliveryCard, hasTaskCard: typeof row.taskTitle === 'string' && row.taskTitle !== '',
    // R1 (Bolt): the host TYPES the "Em andamento" line (`MessageView.stateLine`); the screen hides it by rule (d) of the analyzer, so the reader must hand it over too.
    stateLine: row.stateLine, ticketId: field(row, 'taskWith')?.ticketId,
  })))
  const out: string[] = ['# Rodada real da equipe — transcrito de LEITURA (o que a tela mostra)', '', 'Mesmo fio do canal, com o filtro da própria tela (`analyzeTeamStreamNoise`, com o `stateLine` tipado).', '']
  let shown = 0
  loose.forEach((row, index) => {
    if (analysis.hiddenIndices.has(index)) return
    shown += 1
    const who = names[String(row.actorId)] ?? String(row.actorId)
    const typed = ['handoff', 'review', 'opinion', 'deliveryCard', 'teamPlan', 'taskWith', 'fanout', 'dailyBrief'].filter(name => row[name] !== undefined && row[name] !== null)
    const attachments = Array.isArray(row.attachmentIds) && row.attachmentIds.length > 0 ? ` 📎${String(row.attachmentIds.length)}` : ''
    // The morning card is TYPED (`MessageView.dailyBrief`); the body of its event is only the plain-text fallback — read the card, not the text.
    const brief = field(row, 'dailyBrief')
    const briefText = brief === undefined ? undefined
      : `[cartão Bom dia · ${String(brief.variant)} · ${String(brief.day)}] Ontem: ${String(Array.isArray(brief.yesterday) ? brief.yesterday.length : 0)} · Hoje: ${String(Array.isArray(brief.today) ? brief.today.length : 0)} · Precisa de você: ${String(field(brief, 'needsYou')?.count ?? 0)}`
    out.push(`- **${who}**${attachments}: ${briefText ?? humanizeLine(String(row.body ?? ''), names).slice(0, 600).replace(/\s+/gu, ' ')}${typed.length === 0 ? '' : ` _[cartão: ${typed.join(', ')}]_`}`)
  })
  const hidden = loose.length - shown
  out.push('', `## Ocultas pela tela (${String(hidden)} linhas; revisão com falha técnica: ${String(analysis.reviewSkippedCount)})`)
  return { shown, hidden, markdown: out.join('\n') }
}

/** Best effort and read-only: whatever windows the host knows for the provider (`getOfficialQuota`); never fails the round. */
async function readQuota(page: RealPersonaSession['page'], scope: { workspaceId: string; projectId: string }): Promise<unknown> {
  try {
    const rows = await hostRpcOk<Array<{ provider: string; windows: unknown[]; at?: string; origin?: unknown }>>(page, 'getOfficialQuota', { ...scope, provider: 'claude' })
    return rows.length === 0 ? null : rows.map(row => ({ provider: row.provider, at: row.at ?? null, origin: row.origin ?? null, windows: row.windows }))
  } catch { return null }
}

function copyDatabase(home: string, dir: string): void {
  mkdirSync(dir, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const source = join(home, 'db', `persona.db${suffix}`)
    if (existsSync(source)) copyFileSync(source, join(dir, `persona.db${suffix}`))
  }
}

export async function runTeamRound(options: TeamRoundOptions): Promise<TeamRoundResult> {
  const startedAt = Date.now()
  const real = options.engine === 'real'
  mkdirSync(options.outDir, { recursive: true })
  const hostEnv: Record<string, string> = {
    PERSONA_REAL_CLI: '1',
    ...(real ? { PERSONA_REAL_TURN_CAP: String(options.cap), PERSONA_REAL_TURN_LEDGER: options.ledgerFile ?? '' } : {}),
  }
  if (real && (options.ledgerFile ?? '') === '') throw new Error('a real round needs an absolute fresh ledger file for the limiter')

  // Isolation proven BEFORE any paid turn (Atlas): the verdicts of this `claude` version and the parity of haiku with the person's settings as they are now.
  let isolation: { version: string; fingerprint: string; problems: string[] } | undefined
  if (real) {
    const version = execFileSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim()
    const gateFile = join(tmpdir(), 'persona-cli-env', 'isolation-gate.json')
    const { settingsFingerprint } = (await import(pathToFileURL(join(REPO_ROOT, 'packages', 'persona', 'persona-runners', 'src', 'oar', 'isolation-gate.ts')).href)) as { settingsFingerprint: (env?: NodeJS.ProcessEnv) => string }
    const fingerprint = settingsFingerprint(process.env)
    const gate: unknown = existsSync(gateFile) ? JSON.parse(readFileSync(gateFile, 'utf8')) : undefined
    isolation = { version, fingerprint, problems: isolationProofProblems(gate, version, fingerprint, 'haiku') }
    if (isolation.problems.length > 0) throw new PreflightRefusal(`preflight: the isolation is not proven (a call would run native, ~309 mil tokens): ${isolation.problems.join('; ')}`)
  }

  const session: RealPersonaSession = await openRealPersonaApp({
    // Fake only. `needles`: the stub says whether the prompt of each turn held the WHOLE request. `rules` (the first match wins): a reviewer's Task asks for its verdict ("Se a ferramenta
    // review_verdict estiver disponível…, responda assim"), so the stub answers it with the first-line verdict the host reads in words — the peer review runs to its SEAL on the tree before
    // any real turn; a part of a split request ("Sua parte: …") answers with a LONG delivery that ends in `DELIVERY_END`, so the rehearsal can prove the reviewer gets the WHOLE delivery.
    engine: real ? { kind: 'real' } : {
      kind: 'fake', turnMs: 1_500, needles: [REQUEST_TEXT],
      rules: [
        { match: 'review_verdict', reply: 'APROVADO\n\nO texto e a arte estão coerentes com o pedido.' },
        { match: 'Sua parte:', reply: LONG_DELIVERY },
      ],
    },
    cleanHostEnv: true,
    dismissOnboardingViaStorage: true,
    hostEnv,
    home: options.home,
  })
  const { page } = session
  const shots: string[] = []
  const shot = async (name: string): Promise<void> => {
    const file = join(options.outDir, `${name}.png`)
    await page.screenshot({ path: file }).then(() => { shots.push(file) }, () => undefined)
  }
  let aborted: string | undefined
  let stopped = false
  const stopHost = async (): Promise<void> => { if (!stopped) { stopped = true; await session.close().catch(() => undefined) } }
  try {
    // ── (2) preflight: nothing is posted until all of this is true ──────────────────────────────────────────────────────────────────────────────
    await page.waitForTimeout(1_500)
    const hostFlags = readHostFlags(session.host.output(), session.host.home)
    const flagsOn = v11FlagsOn(hostFlags)
    if (!flagsOn) throw new PreflightRefusal(`preflight: the host boot line does not show the four switches ON with defaults=production (${JSON.stringify(hostFlags ?? null)})`)
    const tenant: V11Tenant = await v11Tenant(page)
    const scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
    // The host probes the CLI in the background: right after the boot `phase` is still "checking" (available:false, loggedIn:false) — NOT an answer. Wait for "ready" (the stub
    // answers so fast the fake never showed it; the first real attempt was refused here, before any request, for reading it too early).
    type Connection = { kind: string; available: boolean; loggedIn: boolean; phase: string }
    let claude: Connection | undefined
    for (const deadline = Date.now() + 90_000; ; await page.waitForTimeout(1_000)) {
      claude = (await hostRpcOk<Connection[]>(page, 'listConnections', scope)).find(connection => connection.kind === 'claude')
      if (claude?.phase === 'ready' || Date.now() > deadline) break
    }
    const claudeReady = claude === undefined ? undefined : claude.phase === 'ready' && claude.available && claude.loggedIn
    if (real && claudeReady !== true) throw new PreflightRefusal(`preflight: claude is not available and logged in after the probe settled (${JSON.stringify(claude ?? null)}): nothing to spend`)

    // ── (3) seed the team and ask ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
    // The onboarding overlay ("Como podemos te chamar?") must not cover the thread in the captures (Muse). The host cannot close the onboarding WITHOUT running the first delivery
    // (Anvil: `completeOnboarding` seeds a default persona and the orchestrator runs her first delivery — a REAL turn), so the data is left alone and only the CAPTURE answers
    // `getOnboarding` as finished, exactly as Ember's recipes do (everything else is the real host). No write, no turn.
    await page.route('**/api/persona/getOnboarding', async (route) => {
      try {
        const response = await route.fetch()
        const body = await response.json() as { result?: { ok?: boolean; value?: Record<string, unknown> } }
        if (body.result?.ok === true && typeof body.result.value === 'object' && body.result.value !== null) body.result.value = { ...body.result.value, firstUse: false, completed: true }
        await route.fulfill({ response, json: body })
      } catch {
        await route.continue().catch(() => undefined)
      }
    })
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    for (const member of CAST) {
      await hostRpcOk(page, 'createPersona', {
        ...scope, id: member.id, name: member.name, title: member.title, description: member.description, personality: 'Prestativa e objetiva.', instructions: member.instructions,
        avatarKind: 'gallery', avatarRef: member.avatarRef, runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: tenant.memberId,
      })
    }
    const roster = await personasOf(page, tenant)
    if (roster.length !== CAST.length) throw new PreflightRefusal(`preflight: ${String(roster.length)} persona(s) after seeding, ${String(CAST.length)} expected (${roster.map(row => row.name).join(', ')})`)
    for (const member of CAST) {
      const current = await hostRpcOk<Record<string, unknown>>(page, 'getAutonomy', { ...scope, personaId: member.id })
      await hostRpcOk(page, 'setAutonomy', { ...scope, ...current, personaId: member.id, mode: 'act' })
    }
    const names: Record<string, string> = Object.fromEntries([...CAST.map(member => [member.id, member.name] as const), [tenant.memberId, 'Pessoa']])

    const poster = buildPosterPng()
    const attachment = await hostRpcOk<{ id: string; mime: string }>(page, 'attachFile', { ...scope, streamKind: 'channel', ownerId: tenant.channelId, name: ATTACHMENT_NAME, bytesBase64: poster.toString('base64') })
    if (attachment.mime !== 'image/png') throw new PreflightRefusal(`preflight: the poster was stored as ${attachment.mime}`)
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 60_000 })
    const quotaBefore = await readQuota(page, scope)
    await shot('m0-antes-do-pedido')
    const requestId = await postAsPerson(page, tenant, REQUEST_TEXT, { attachmentIds: [attachment.id] })
    writeFileSync(join(options.outDir, 'request.json'), JSON.stringify({ requestId, text: REQUEST_TEXT, attachmentId: attachment.id, alt: POSTER_ALT, cap: options.cap, engine: options.engine }, null, 2))

    // ── (4) watchdog + quiet detection ──────────────────────────────────────────────────────────────────────────────────────────────────────────
    // The live database can be momentarily unreadable on Windows (a copy of a file the host holds): never crash the round for it, but never run blind either.
    let unreadable = 0
    const liveLedger = (): LedgerEvidence | undefined => {
      try { const value = readLedgerEvidence(session.host.home); unreadable = 0; return value } catch { unreadable += 1; return undefined }
    }
    let lastSignature = ''
    let lastChange = Date.now()
    let nextShotAt = Date.now() + 120_000
    let timedOut = false
    // The harness is the PERSON: when the team asks her something (attempt 2 stopped at "Pergunta 1 de 4" because nobody answered), it answers with the facts of the request.
    const answerer = createAskAnswerer((method, args) => hostRpcOk(page, method, args), scope)
    for (;;) {
      await page.waitForTimeout(1_500)
      const ledger = liveLedger()
      const guard = ledgerGuard(ledger, options.cap, { requireEnvMode: real })
      if (guard !== undefined) { aborted = guard; break }
      if (real && unreadable > 40) { aborted = 'the ledger could not be read for 60 s: the cost cannot be watched; host killed'; break }
      const answeredBefore = answerer.answered.length
      await answerer.poll()
      if (answerer.answered.length !== answeredBefore) { lastChange = Date.now(); await shot(`m-resposta-${String(answerer.answered.length)}`) }
      const messages = await channelMessages(page, tenant).catch(() => [] as HostMessage[])
      const tasks = await hostRpcOk<Array<{ id: string; stage?: string }>>(page, 'listTasks', scope).catch(() => [])
      const signature = `${String(messages.length)}|${String(ledger?.turns ?? 0)}|${tasks.map(task => `${task.id}:${task.stage ?? ''}`).join(',')}`
      if (signature !== lastSignature) { lastSignature = signature; lastChange = Date.now() }
      if (Date.now() >= nextShotAt) { nextShotAt = Date.now() + 120_000; await shot(`m-${String(Math.round((Date.now() - startedAt) / 1000))}s`) }
      const replied = messages.some(message => message.actorId !== tenant.memberId && message.body.trim() !== '')
      // The welcome line of the onboarding is a host line, not an answer: the team has answered only once a model turn was booked. A question still waiting for the person is not quiet.
      if (replied && (ledger?.turns ?? 0) >= 1 && !answerer.hasOpen() && Date.now() - lastChange >= options.quietMs) break
      if (Date.now() - startedAt >= options.deadlineMs) { timedOut = true; break }
    }

    // The morning card of the day is a pure function of the host (zero model): ask for it now, twice (the day's card, and the extra one tied to the request) and prove it cost nothing.
    let morningBrief: TeamRoundResult['morningBrief']
    if (aborted === undefined && !timedOut) {
      const turnsNow = async (): Promise<number> => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const seen = liveLedger()
          if (seen !== undefined) return seen.turns
          await page.waitForTimeout(700)
        }
        return -1
      }
      const turnsBefore = await turnsNow()
      const ask = async (extra: Record<string, unknown>): Promise<unknown> => hostRpcOk(page, 'postDailyBriefNow', { ...scope, ...extra }).catch((error: unknown) => ({ outcome: 'error', text: String(error).slice(0, 200) }))
      const day = await ask({})
      const forRequest = await ask({ requestId })
      await page.waitForTimeout(1_500)
      morningBrief = { day, forRequest, turnsBefore, turnsAfter: await turnsNow() }
    }

    // A watchdog abort stops the host FIRST (cost containment); the evidence is then read from the database alone.
    if (aborted !== undefined) await stopHost()

    // ── (5) collect while the host is up ────────────────────────────────────────────────────────────────────────────────────────────────────────
    const rows = aborted === undefined ? await channelMessages(page, tenant).catch(() => [] as HostMessage[]) : []
    const reading = await readingTranscript(rows, names)
    if (aborted === undefined) {
      await page.locator('[data-persona-shell]').scrollIntoViewIfNeeded().catch(() => undefined)
      await shot('m9-fio-final')
      // Muse reviews "what the Miguel would see", light AND dark: a tall viewport shows the whole thread in one picture; the scheme is emulated on this page only.
      await page.setViewportSize({ width: 1440, height: 2600 }).catch(() => undefined)
      await page.waitForTimeout(900)
      await shot('m9-fio-final-alto-claro')
      await page.emulateMedia({ colorScheme: 'dark' }).catch(() => undefined)
      await page.waitForTimeout(900)
      await shot('m9-fio-final-alto-escuro')
      await page.emulateMedia({ colorScheme: 'light' }).catch(() => undefined)
      await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined)
    }
    const quotaAfter = aborted === undefined ? await readQuota(page, scope) : null
    let diagnostics: TeamRoundResult['diagnostics']
    if (aborted === undefined) {
      try {
        // `exportDiagnostics` takes NO request: the client sends `args: {}` (a remote with one request object sends `args: { request }`).
        const origin = new URL(page.url()).origin
        const response = await page.context().request.post(`${origin}/api/persona/exportDiagnostics`, {
          data: { type: 'client-request', rpcId: `probe-${Math.random().toString(36).slice(2)}`, method: 'persona/exportDiagnostics', payload: { args: {} } },
        })
        const body = await response.json() as { result?: { ok: boolean; value?: { json: string } } }
        if (body.result?.ok !== true || body.result.value === undefined) throw new Error('exportDiagnostics refused')
        const parsed = JSON.parse(body.result.value.json) as { lastErrors?: unknown; flags?: unknown }
        diagnostics = { lastErrors: Array.isArray(parsed.lastErrors) ? parsed.lastErrors.map(String) : [], flags: parsed.flags ?? null }
      } catch { diagnostics = undefined }
    }
    const hostSoftLines = session.host.output().split(/\r?\n/u).filter(line => line.includes('[persona-host] soft ')).map(line => line.trim().slice(0, 300))
    const stubTurns = session.fakeCli.invocations().filter(call => call.event === 'turn')
    const stubImageTurns = real ? undefined : stubTurns.filter(call => (call.images ?? 0) > 0 || call.imagePathInText !== undefined).length
    const stubRequestTurns = real ? undefined : stubTurns.filter(call => call.needles?.[REQUEST_TEXT] === true).length
    await stopHost()

    const ledger = readLedgerEvidence(options.home)
    const transcript = readTeamTranscript(options.home)
    const verdict = transcript === undefined ? undefined : evaluateTeamRound(transcript, { ceilingTurns: options.cap, minPersonas: 2, requireImage: true, answeredAsks: answerer.answered.length })
    copyDatabase(options.home, join(options.outDir, 'evidence'))
    writeFileSync(join(options.outDir, 'reading-transcript.md'), reading.markdown)
    if (transcript !== undefined) writeFileSync(join(options.outDir, 'transcript.md'), renderTranscriptMarkdown(transcript, `TEAM-10 (${options.engine}) — o que a pessoa vê`))
    return {
      engine: options.engine,
      preflight: { isolation, hostFlags, flagsOn, claudeReady, personas: roster.map(row => row.name) },
      attachmentId: attachment.id, requestId, aborted, timedOut, ledger, transcript, verdict,
      threadLines: rows.length, reading, stubImageTurns, stubRequestTurns, answeredAsks: answerer.answered, askStopped: answerer.stopped, shots, elapsedMs: Date.now() - startedAt, quota: { before: quotaBefore, after: quotaAfter }, morningBrief, diagnostics, hostSoftLines,
    }
  } finally {
    await stopHost()
  }
}
