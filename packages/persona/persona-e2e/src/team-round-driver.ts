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
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PADARIA_SCENARIOS, type PadariaScenarioId } from './eval-padaria-scenarios.ts'
import { hostRpcOk } from './gauge-sb-ges.ts'
import { readHostFlags, v11FlagsOn, type HostFlags } from './host-flags.ts'
import { readLedgerEvidence, type LedgerEvidence } from './ledger-evidence.ts'
import { REPO_ROOT } from './paths.ts'
import { openRealPersonaApp, type RealPersonaSession } from './real-app-session.ts'
import { buildPosterPng, POSTER_ALT } from './team-image-fixture.ts'
import { savedLinesProblems, stubTurnProblems, type StubTurnEvent } from './team-draft-checks.ts'
import { pngAssuranceIn } from './team-p0-rules.ts'
import { createAskAnswerer, type AnsweredAsk } from './team-round-asks.ts'
import { isolationProofProblems, ledgerGuard } from './team-round-guard.ts'
import { evaluateTeamRound, type TeamRoundVerdict } from './team-round-verdict.ts'
import { humanizeLine, readTeamTranscript, renderTranscriptMarkdown, type TeamTranscript } from './team-transcript.ts'
import { channelMessages, personasOf, postAsPerson, v11Tenant, type HostMessage, type V11Tenant } from './v11-helpers.ts'

/** Attempt 6 (Atlas `atlas-ok-team10-6.txt`, 12/11): "ABORTE NA HORA se a entrada BRUTA somada passar de 200 mil". The goal of the round is < 120 mil. */
export const REAL_ROUND_RAW_INPUT_ABORT = 200_000

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
export const REQUEST_TEXT = 'Faz o cartaz da promoção do pão de queijo da Padaria Lua para o Instagram: 2 por R$ 9 de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. Preciso do texto e da arte; a foto é o rascunho atual. Quero a opinião do time sobre a arte antes de eu aprovar.'
export const ATTACHMENT_NAME = 'foto.png'

/**
 * The last words of the stub's long delivery. The real round of 07/11 showed the reviewer got only the START of an author's delivery (the review note is clipped to 290 characters: "o bilhete foi
 * cortado logo após a menção ao SVG, não consegui conferir a arte"); a delivery that is far longer than that and ends in this marker lets the fake prove the WHOLE of it reaches the reviewer.
 */
/** The art file the stub's parts write in their cwd (the Task's draft) — an SVG, since the persona has no image tool. */
export const ART_FILE = 'cartaz-arte.svg'
const ART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#1F40AE"/><circle cx="540" cy="480" r="240" fill="#DC2626"/><text x="540" y="500" text-anchor="middle" fill="#fff" font-size="72">2 por R$ 9</text></svg>\n'
/** Bolt: the reviewer gets the author's WHOLE delivery in the PROMPT of her turn, inside this block (not in the card note). */
export const ENTREGA_BLOCK = '<entrega>'
/** The delimiters of the bilhete in the assignment of whoever receives a pass/help/review. */
export const BILHETE_BLOCK = '<bilhete>'
/**
 * What a real model says BETWEEN its tool calls — the words of attempt 4 (`artifacts/team10/real-attempt-4-*`, Téo's line in the thread): the intention to check, a tool result said aloud, the next
 * intention. The stub's art part says them before its delivery, each followed by a tool call, so a product that puts all the text of the turn in the thread shows them glued together
 * ("…contém.Nenhum arquivo…") — P0-2 of the real round of 07/11.
 */
export const NARRATION_STEPS: readonly string[] = [
  'Vou começar conferindo se o `foto.png` existe no projeto e o que ele contém.',
  'Nenhum arquivo de imagem no diretório de trabalho. Vou verificar o diretório e procurar `foto.png` mais amplamente.',
]
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
  /** FAKE only (COLHEITA item 14): one persona does ONE thing wrong, so the eval can be seen flagging it end to end (`eval-padaria-scenarios.ts`). Absent = the clean rehearsal. */
  readonly scenario?: PadariaScenarioId
  /** FAKE only: `legacy` (default) = the stub passes the art to Bia and asks Lia for help (the P0-1 rehearsal); `d100` = the stub makes no hand-off, the host's D-100 flow does the work. */
  readonly choreography?: 'legacy' | 'd100'
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
  /** Fake only: the stub turns whose prompt carried the `<entrega>` block (the reviewer's turns) and how many of them held the delivery's last words. */
  readonly reviewPromptsWhole: { readonly turns: number; readonly whole: number } | undefined
  /** Attempt 4 (Atlas D-099): the project has a FOLDER; the art is a file in the Task's DRAFT, never in the real folder before Apply. Fake only. */
  readonly draftProof: { readonly projectRoot: string; readonly realFolderFiles: readonly string[]; readonly drafts: ReadonlyArray<{ readonly directory: string; readonly files: readonly string[]; readonly artBytes: number }>; readonly writerArgvs: readonly string[]; readonly turnCwds: readonly string[] } | undefined
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
  /**
   * Fake only — what the stub saw and did for the three P0 of 07/11: `problems` = the shared-files defects it observed itself (a turn told about a file its working directory did not have, a
   * file recreated because the colleague's was not there); the tool calls the scripted model made (accepted or refused by the product); and the tool catalog the CLI was offered (is the
   * persona told the app makes the PNG by itself?).
   */
  readonly stubProof: {
    readonly problems: readonly string[]
    readonly turns: number
    readonly toolCalls: ReadonlyArray<{ readonly toolName: string; readonly ok: boolean; readonly text: string }>
    readonly toolCatalog: { readonly tools: number; readonly pngAssurance: boolean }
    readonly recreated: readonly string[]
    /** One row per stub turn (cwd tail, which needles its prompt held, prompt length, what its working directory held when it started): the evidence behind the checks above. */
    readonly turnTable: ReadonlyArray<{ readonly turn: string; readonly draft: string; readonly needles: Readonly<Record<string, boolean>>; readonly promptChars: number | null; readonly files: readonly string[] }>
  } | undefined
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

/** Where each Task's draft is (from the database), what is in it, and whether the REAL folder stayed clean; plus the argv/cwd the stub received (Tally's P0-1 contract). */
function collectDraftProof(calls: ReturnType<RealPersonaSession['fakeCli']['invocations']>, projectRoot: string, home: string): NonNullable<TeamRoundResult['draftProof']> {
  const list = (dir: string): string[] => { try { return readdirSync(dir).sort() } catch { return [] } }
  const drafts: Array<{ directory: string; files: string[]; artBytes: number }> = []
  const transcript = readTeamTranscript(home)
  for (const directory of new Set(transcript?.draftDirectories ?? [])) {
    const art = join(directory, ART_FILE)
    drafts.push({ directory, files: list(directory), artBytes: existsSync(art) ? statSync(art).size : 0 })
  }
  const writerArgvs = [...new Set(calls.filter(call => call.event === 'invoke' && call.argv.includes('-p') && call.argv.includes('--permission-mode')).map(call => call.argv.join(' ')))]
  return { projectRoot, realFolderFiles: list(projectRoot), drafts, writerArgvs, turnCwds: [...new Set(calls.filter(call => call.event === 'turn').map(call => call.cwd ?? ''))] }
}

/**
 * What the stub saw for the three P0 (see `TeamRoundResult.stubProof`): its own look at each working directory when a turn started, the tool calls of its scripted model, the tool
 * catalog the CLI was offered. A turn "carries the request" when its prompt holds the request's text (a part of the split) or a bilhete that is not a review (the colleague of a pass/help).
 */
function readStubProof(calls: ReturnType<RealPersonaSession['fakeCli']['invocations']>, transcript: TeamTranscript | undefined, scripted = true): NonNullable<TeamRoundResult['stubProof']> {
  const carriesRequest = (turn: StubTurnEvent): boolean => turn.needles?.[REQUEST_TEXT] === true || (turn.needles?.[BILHETE_BLOCK] === true && turn.needles?.review_verdict !== true)
  const problems = stubTurnProblems(calls, { attachmentName: ATTACHMENT_NAME, posterSha256: POSTER_SHA256 }, carriesRequest)
  // "X salvou … no rascunho" only for what X's own turn wrote (a copy the host handed her is not her work).
  if (transcript !== undefined) problems.push(...savedLinesProblems(transcript, calls.filter(call => call.event === 'write' && call.recreated !== true)))
  const toolCalls = calls.filter(call => call.event === 'toolcall').map(call => ({ toolName: call.toolName ?? '?', ok: call.ok === true, text: (call.text ?? '').slice(0, 240) }))
  // The legacy rehearsal makes the stub CALL the product's hand-off tools (the only way to reach the receivers of a bilhete); the D-100 choreography makes none, the host's flow does the work.
  for (const wanted of scripted ? ['pass_forward', 'ask_colleague'] : []) {
    const mine = toolCalls.filter(call => call.toolName === wanted)
    if (mine.length === 0) problems.push(`P0-1 stub: the scripted model never called ${wanted}: the receivers of a bilhete with a file were not exercised`)
    else if (!mine.some(call => call.ok)) problems.push(`P0-1 stub: the product refused every ${wanted} of the scripted model (${mine.map(call => call.text).join(' | ')}): the receivers of a bilhete with a file were not exercised`)
  }
  const catalogs = calls.filter(call => call.event === 'tools')
  const descriptions = catalogs.flatMap(call => (call.tools ?? []).map(item => `${item.name}: ${item.description}`))
  const pngAssurance = descriptions.some(pngAssuranceIn)
  if (catalogs.length === 0 || descriptions.length === 0) problems.push('P0-3 catalog: the tool catalog the CLI was offered could not be read (no `tools` line in the stub log)')
  else if (!pngAssurance) problems.push(`P0-3 catalog: none of the ${String(descriptions.length)} tool descriptions tells the persona that the app makes the PNG of an SVG by itself (and that nobody is asked to export one)`)
  return {
    problems, turns: calls.filter(call => call.event === 'turn').length, toolCalls, toolCatalog: { tools: descriptions.length, pngAssurance },
    recreated: calls.filter(call => call.event === 'write' && call.recreated === true).map(call => `${call.file ?? '?'} (${(call.cwd ?? '?').split(/[\\/]/u).slice(-1)[0] ?? '?'})`),
    turnTable: calls.filter(call => call.event === 'turn').map(call => ({
      turn: `${String(call.proc)}#${String(call.seq)}`, draft: (call.cwd ?? '?').split(/[\\/]/u).slice(-1)[0] ?? '?', needles: call.needles ?? {}, promptChars: call.promptChars ?? null, files: (call.cwdFiles ?? []).map(file => file.p),
    })),
  }
}

const POSTER_SHA256 = createHash('sha256').update(buildPosterPng()).digest('hex')

export async function runTeamRound(options: TeamRoundOptions): Promise<TeamRoundResult> {
  const startedAt = Date.now()
  const real = options.engine === 'real'
  mkdirSync(options.outDir, { recursive: true })
  const hostEnv: Record<string, string> = {
    PERSONA_REAL_CLI: '1',
    ...(real ? { PERSONA_REAL_TURN_CAP: String(options.cap), PERSONA_REAL_TURN_LEDGER: options.ledgerFile ?? '' } : {}),
  }
  if (real && (options.ledgerFile ?? '') === '') throw new Error('a real round needs an absolute fresh ledger file for the limiter')
  if (real && (options.scenario !== undefined || options.choreography !== undefined)) throw new Error('a RED scenario and the choreography are played by the stub: they never run on the real engine')
  const scenario = options.scenario === undefined ? undefined : PADARIA_SCENARIOS[options.scenario]
  // The text part (Bia) is the one that misbehaves: her words reach the thread, the bilhete and the review the way a model's do. The rule goes right after the reviewer's verdict and BEFORE the
  // clean part rules (the first match wins), so a review prompt that quotes her assignment still gets its "APROVADO".
  // `selfCorrects`: when the host sends her back with its internal charge (every variant ends "Não diga que fez o que não fez"), she delivers honestly, as a model does once it is told.
  const defectRules = [
    ...(scenario?.selfCorrects === true ? [{ match: 'Não diga que fez o que não fez', reply: LONG_DELIVERY }] : []),
    ...(scenario?.textPartAppend === undefined ? [] : [{ match: 'Sua parte: texto', reply: `${LONG_DELIVERY}\n${scenario.textPartAppend}` }]),
  ]
  const defectCalls = scenario?.textPartAsks === undefined ? [] : [{ match: 'Sua parte: texto', once: true, calls: [{ tool: 'persona_ask', args: { question: scenario.textPartAsks } }] }]

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
      kind: 'fake', turnMs: 1_500, needles: [REQUEST_TEXT, DELIVERY_END, ENTREGA_BLOCK, BILHETE_BLOCK, 'review_verdict'], toolsProbe: true,
      ...(scenario?.inputTokens === undefined ? {} : { inputTokens: scenario.inputTokens }),
      // P0-1 (Atlas 07/11): ONLY the art part writes the art (the old `writeFile` wrote it in EVERY turn, so a colleague that could not find it never showed). A turn whose prompt names the art file
      // while the file is not in its working directory MAKES one — what Lia did in the real round — and the log says so (`recreated`).
      writeRules: [
        { match: 'Sua parte: arte', file: ART_FILE, content: ART_SVG },
        { match: ART_FILE.replace(/\./gu, '\\.'), file: ART_FILE, content: ART_SVG, fillIn: true },
      ],
      // The stub as the MODEL of the art part: it passes the work on to Bia with the art as a file of the bilhete (`pass_forward`) and asks Lia for help with it (`ask_colleague`), through the
      // product's own tools — the only way a rehearsal with no model reaches the receivers of a bilhete.
      // `choreography: 'd100'` (COLHEITA item 14): the stub makes NO hand-off of its own — the D-100 flow is the host's: Bia delivers the text, the art of Téo is born from her delivery, ONE art, Lia reviews it.
      toolCalls: [...defectCalls, ...(options.choreography === 'd100' ? [] : [{
        match: 'Sua parte: arte', once: true,
        calls: [
          { tool: 'pass_forward', args: { colleague: 'Bia', title: 'Texto do cartaz', done: ['Arte-base pronta, seguindo a foto do pedido.'], needed: ['O texto do título e o contato do WhatsApp para a faixa branca.'], files: [ART_FILE], decisions: ['Formato 4:5 para o Instagram.'] } },
          { tool: 'ask_colleague', args: { colleague: 'Lia', title: 'Conferir o contraste da arte', done: ['Arte-base pronta.'], needed: ['Dizer se o contraste funciona para o Instagram.'], files: [ART_FILE], decisions: [] } },
        ],
      }])],
      rules: [
        { match: 'review_verdict', reply: 'APROVADO\n\nO texto e a arte estão coerentes com o pedido.' },
        ...defectRules,
        // P0-2: what a real model says between its tool calls (the words of attempt 4) comes BEFORE the delivery; only the delivery may reach the thread, the bilhete and the review.
        { match: 'Sua parte: arte', reply: LONG_DELIVERY, narration: NARRATION_STEPS },
        { match: 'Sua parte:', reply: LONG_DELIVERY },
        // The colleague of a pass/help (her prompt carries the bilhete) — and the art part when it RESUMES with the colleague's delivery: a plain answer, not the stub's default first-delivery text.
        // It still ends in DELIVERY_END: the resumed art part is what the reviewer is handed, and the reviewer must get the whole of it.
        { match: BILHETE_BLOCK, reply: `Li o bilhete e os arquivos que chegaram no meu rascunho.\n${LONG_DELIVERY}` },
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

    // D-099: a persona may write files ONLY in the Task's draft of a project that has a folder. The folder is a temp dir with one file; the art must never appear in it before Apply.
    const projectRoot = mkdtempSync(join(tmpdir(), 'team10-folder-'))
    writeFileSync(join(projectRoot, 'LEIAME.txt'), 'Pasta da Padaria Lua\n')
    await hostRpcOk(page, 'setProjectRoot', { ...scope, rootPath: projectRoot })
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
      // Attempt 6 (Atlas OK 12/11): on the REAL round the host is also stopped at 200 mil RAW input (the goal is < 120 mil) or when the ledger stops measuring per turn.
      const guard = ledgerGuard(ledger, options.cap, { requireEnvMode: real, ...(real ? { rawRoundAbort: REAL_ROUND_RAW_INPUT_ABORT, requireMeasured: true } : {}) })
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
    const draftProof = real ? undefined : collectDraftProof(session.fakeCli.invocations(), projectRoot, options.home)
    // The stub's log goes away with the session (`restore` removes it): take the events NOW, read them against the transcript after the stop.
    const stubEvents = real ? undefined : [...session.fakeCli.invocations()]
    // The REVIEWER's turns: the `<entrega>` block of a colleague who is handed a pass/help return (also a block, but of a clipped summary) is not what the review reads — a review asks for its verdict.
    const reviewPromptTurns = real ? undefined : stubTurns.filter(call => call.needles?.[ENTREGA_BLOCK] === true && call.needles?.review_verdict === true)
    const reviewPromptsWhole = reviewPromptTurns === undefined ? undefined : { turns: reviewPromptTurns.length, whole: reviewPromptTurns.filter(call => call.needles?.[DELIVERY_END] === true).length }
    const stubRequestTurns = real ? undefined : stubTurns.filter(call => call.needles?.[REQUEST_TEXT] === true).length
    await stopHost()

    const ledger = readLedgerEvidence(options.home)
    const transcript = readTeamTranscript(options.home)
    const stubProof = stubEvents === undefined ? undefined : readStubProof(stubEvents, transcript, options.choreography !== 'd100')
    // P0-1/2/3 of the real round of 07/11 are part of the verdict itself (real and fake): the shared files are read from the drafts on disk, the words from the thread/bilhetes/reviews.
    const verdict = transcript === undefined ? undefined : evaluateTeamRound(transcript, {
      ceilingTurns: options.cap, minPersonas: 2, requireImage: true, answeredAsks: answerer.answered.length,
      sharedFiles: { attachmentName: ATTACHMENT_NAME, posterSha256: POSTER_SHA256, requireDrafts: true },
    })
    copyDatabase(options.home, join(options.outDir, 'evidence'))
    writeFileSync(join(options.outDir, 'reading-transcript.md'), reading.markdown)
    if (transcript !== undefined) writeFileSync(join(options.outDir, 'transcript.md'), renderTranscriptMarkdown(transcript, `TEAM-10 (${options.engine}) — o que a pessoa vê`))
    return {
      engine: options.engine,
      preflight: { isolation, hostFlags, flagsOn, claudeReady, personas: roster.map(row => row.name) },
      attachmentId: attachment.id, requestId, aborted, timedOut, ledger, transcript, verdict,
      threadLines: rows.length, reading, stubImageTurns, stubRequestTurns, reviewPromptsWhole, draftProof, stubProof, answeredAsks: answerer.answered, askStopped: answerer.stopped, shots, elapsedMs: Date.now() - startedAt, quota: { before: quotaBefore, after: quotaAfter }, morningBrief, diagnostics, hostSoftLines,
    }
  } finally {
    await stopHost()
  }
}
