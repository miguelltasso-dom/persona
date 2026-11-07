/**
 * The tool a persona calls to ask the whole team's opinion (TEAM-4, D-090 #4; contracts/opinion-budget.md, team-images.md).
 *
 * This is the thin layer in front of Bolt's round engine (`opinion-run.ts`, `TeamOpinions.run`). It does what must be decided BEFORE
 * anyone is called: the identity (the run, never an argument), the team switch and the persona's "pode pedir a colegas" setting, the
 * arguments, who the audience is, the size of the draft's images — and then the pure budget (`budgetOpinionRound`, Tally): rounds per Task,
 * requests per day, who can answer, who sees images, the estimate. Only `ask` reaches `run`; `stop` and `propose` answer the model with a
 * sentence and the way forward and call NOBODY.
 *
 * The persona's AUTONOMY does not decide here (Keel, 04/11 23:36): autonomy governs EXTERNAL, irreversible actions (email, post, pay, delete); asking
 * the team is internal and is governed by the person's explicit switch "Pode pedir ajuda a colegas", the daily cap, the cap of rounds and the cost
 * shown before. With the switch on and inside the caps the tool RUNS, in "Sugere e espera" too. It becomes a proposal to the person only when the
 * switch is off, a cap is reached, or the round is big (more than {@link CONFIRM_ABOVE_COLLEAGUES} colleagues, or over the cost limit the host sets).
 *
 * The counters are the host's: a round counts from the moment `run` is started and is written first, keyed by the call id, so a retry of the
 * same call returns the same answer and a deliberate second call is a second round (never a free one). No model is called here; the model
 * turns (the colleagues, the asker's consolidation) are `run`'s.
 */

import {
  budgetOpinionRound,
  opinionDigestFor,
  type AccountInput,
  type AskCalibration,
  type ImageSize,
  type OpinionBudget,
  type OpinionReader,
  type OpinionSkip,
} from '@deepseek-ai/dsh-persona-engine'
import type { HarnessCall, HarnessMcpPorts, HarnessToolName } from '@deepseek-ai/dsh-persona-runners'
import type { ProductRepos, ScreenRepos, StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { changedSince, readDraftFile, thumbOf } from './draft-turn-files.ts'
import type { OpinionArt, OpinionResult, OpinionRunInput } from './opinion-run.ts'
import { svgToPng, type SvgToPngFailure } from './svg-to-png.ts'
import type { DraftFileView } from './types.ts'

const KIND = 'opinion_request'
const QUESTION_MAX = 500
const DRAFT_TEXT_MAX = 4000
const ALT_MAX = 300
const MAX_ATTACHMENTS = 4
/** An SVG that could not be drawn goes to the team as text, at most this many characters of it. */
const SVG_AS_TEXT_MAX = 6000

/** More colleagues than this in one round need the person's confirmation first (Muse's confirmation). Choosing up to this many by name does not. */
export const CONFIRM_ABOVE_COLLEAGUES = 5

/** What the round engine offers (Bolt's `TeamOpinions`). */
export interface OpinionRunner {
  run(input: OpinionRunInput): Promise<OpinionResult>
}

export interface OpinionToolDeps {
  /** `Config.teamwork`: with it off nothing here becomes an event. */
  readonly enabled: () => boolean
  readonly now: () => string
  readonly product: Pick<ProductRepos, 'getPersona' | 'listPersonas'>
  readonly screens: ScreenRepos
  readonly opinions: OpinionRunner
  /** The person's settings for the persona (TeamworkSettings.get). */
  readonly limitsOf: (projectId: string, personaId: string) => { readonly canAskColleagues: boolean; readonly askCapPerDay: number; readonly maxOpinionRounds: number }
  /** Requests to colleagues the persona already made today OUTSIDE opinions (the handoff registry's `askedToday`); opinions are added here. */
  readonly otherAsksToday: (projectId: string, personaId: string, dayIso: string) => number
  /** The persona runs that Task right now (identity = the run). */
  readonly isRunning: (projectId: string, ticketId: string, personaId: string) => boolean
  /** Paused / at the limit of the engine right now. */
  readonly gateOf: (projectId: string, persona: StoredPersona) => { readonly paused: boolean; readonly limited: boolean }
  /** The engine of the persona: connected, and whether it reads images (`runner.capabilities().images`; `engineSeesImages` before a runner exists). */
  readonly motorOf: (persona: StoredPersona) => { readonly cli: string; readonly connected: boolean; readonly readsImages: boolean }
  /** Pixel sizes of the draft's attachments, when the host can read them (`imageSizeOf` on the first bytes). Unknown ⇒ the wide estimate. */
  readonly imageSizes?: (projectId: string, attachmentIds: readonly string[]) => readonly (ImageSize | undefined)[]
  /** The person's own measured turns (estimate calibration). */
  readonly calibration?: (projectId: string) => AskCalibration | undefined
  /** USD-1 / D-092: the account that runs the round (the asker's): decides whether the budget carries money (API) or the impact on the quota window (subscription). Absent = unknown: no money. */
  readonly accountOf?: (projectId: string, persona: StoredPersona) => AccountInput | undefined
  /** A round whose estimated cost (upper end, micro-USD) passes this needs the person's confirmation first. Absent = no cost limit besides the caps. */
  readonly confirmAboveMicroUsd?: number
  /**
   * The colleagues LINKED to this piece of work: the other Tasks of the same request of the person (the parts of a split), the collaborators of the
   * Task and the Coordenação. "The team" of a round is these people, not the whole company (Atlas, 05/11 00:05: a campaign art does not go to a
   * freshly hired Finance or People persona). Absent = unknown: the default audience is the whole project.
   */
  readonly involvedIn?: (projectId: string, ticketId: string) => readonly string[]
  /** P0-C2: the root of the DRAFT folder of the asker's Task (`ticket.execution.directory`); absent = the Task has none and `draft.files` is refused with a sentence. */
  readonly draftRootOf?: (projectId: string, ticketId: string) => string | undefined
  /**
   * The files of the asker's conversation: `thread` = every attachment of it, `request` = the ones that came WITH the message that started the Task.
   * The model reads attachments by NAME ("cartaz.png"), never by id: this lets the tool take a name for an id, and show the images the person
   * attached to the request when the draft names none (the person said "o cartaz anexo é o rascunho"). Absent = ids only, nothing added.
   */
  readonly attachmentsOf?: (projectId: string, ticketId: string) => { readonly thread: readonly NamedAttachment[]; readonly request: readonly NamedAttachment[] }
}

/** An attachment the model can point to. */
export interface NamedAttachment {
  readonly id: string
  readonly name: string
}

const IMAGE_FILE = /\.(?:png|jpe?g|webp|gif)$/iu

/** Name as a model writes it: no folder, no case, no accent. */
const bareName = (value: string): string => (value.split(/[\\/]/u).at(-1) ?? value).normalize('NFD').replace(/[̀-ͯ]/gu, '').trim().toLocaleLowerCase('pt-BR')

/** What the host keeps of a round: enough to count it and to answer a repeated call. */
interface RoundRecord {
  readonly id: string
  readonly projectId: string
  readonly ticketId: string
  readonly callId: string
  readonly askerId: string
  readonly round: number
  readonly askedAt: string
  /** The sentence the model got (a repeated call gets the same one). */
  readonly answer?: string
  /** The round never called anyone (the engine refused before the first colleague): it does not count as a round or as a request of the day. */
  readonly voided?: true
}

type Args = Record<string, unknown>

function say(value: unknown): string {
  return JSON.stringify(value)
}

function refuse(code: string, message: string): string {
  return say({ ok: false, code, message })
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

const SKIP_WHY: Readonly<Record<OpinionSkip, string>> = {
  paused: 'está em pausa',
  'at-limit': 'está no limite do motor agora',
  unavailable: 'está sem motor conectado',
  'no-vision': 'não vê imagens neste motor',
  'over-limit': 'ficou de fora para a rodada não ficar grande demais',
}

/** The tool: counters, the budget and the call to the round engine. */
export class OpinionTool {
  private readonly deps: OpinionToolDeps

  /** @param deps - Host parts. */
  constructor(deps: OpinionToolDeps) {
    this.deps = deps
  }

  /**
   * Opinion requests the persona made on a day (ADD this to the handoff registry's count: to the person it is ONE number).
   * @param projectId - Tenant.
   * @param personaId - Who asked.
   * @param dayIso - `YYYY-MM-DD`.
   */
  askedToday(projectId: string, personaId: string, dayIso: string): number {
    return this.rounds(projectId).filter(row => row.voided !== true && row.askerId === personaId && row.askedAt.startsWith(dayIso)).length
  }

  /**
   * Rounds already used on a Task.
   * @param projectId - Tenant.
   * @param ticketId - The Task of the persona that asked.
   */
  roundsUsed(projectId: string, ticketId: string): number {
    return this.rounds(projectId).filter(row => row.voided !== true && row.ticketId === ticketId).length
  }

  private rounds(projectId: string): RoundRecord[] {
    return this.deps.screens.list<RoundRecord>(projectId, KIND)
  }

  /**
   * The persona asks the team.
   * @param call - The tool call (the run is the identity; the arguments are only what the model wants asked).
   * @returns A JSON sentence for the model: the opinions to go on with, or a refusal that says why and the way forward.
   */
  async ask(call: HarnessCall): Promise<string> {
    const { deps } = this
    const persona = deps.product.getPersona(call.run.personaId)
    if (persona === undefined) return refuse('forbidden', 'Não reconheço este turno; nada foi feito.')
    const projectId = persona.projectId
    const ticketId = call.run.ticketId
    if (!deps.enabled()) return refuse('off', 'O trabalho em equipe ainda não está ligado neste projeto. Siga com o que tem.')
    if (!deps.isRunning(projectId, ticketId, persona.id)) return refuse('ended', 'Essa tarefa já terminou; não dá para pedir a opinião da equipe dentro dela.')
    const limits = deps.limitsOf(projectId, persona.id)
    if (!limits.canAskColleagues) return refuse('not-allowed', 'A chave "Pode pedir ajuda a colegas" está desligada para você neste projeto. Siga com o que tem; se a opinião da equipe fizer falta, pergunte à pessoa (persona_ask) se ela quer ligar a chave.')
    // The same call twice is the same answer, never a second round.
    const prior = this.rounds(projectId).find(row => row.ticketId === ticketId && row.callId === call.callId)
    if (prior !== undefined) return prior.answer ?? refuse('busy', 'Esta rodada de opinião ainda está em andamento. Aguarde o resultado dela.')

    const read = this.read(call.args)
    if (typeof read === 'string') return read
    // P0-C2: the ART the asker saved in the draft of her Task (an SVG is drawn as a PNG: models read only raster).
    const art = await this.artOf(projectId, ticketId, persona.id, read.files, read.text !== undefined || read.attachmentIds.length > 0)
    if (typeof art === 'string') return art
    // The model points to files by NAME: a name stands for the id of that attachment of the conversation; and when the draft names no image at all,
    // the images the person attached to the request that started this Task ARE the draft (the tool says so in its answer).
    const files = deps.attachmentsOf?.(projectId, ticketId)
    const resolved = files === undefined ? read.attachmentIds : read.attachmentIds.map(item => files.thread.find(row => row.id === item)?.id ?? files.thread.find(row => bareName(row.name) === bareName(item))?.id ?? item)
    const candidates = files === undefined || read.idsGiven ? [] : files.request.filter(row => IMAGE_FILE.test(row.name)).slice(0, MAX_ATTACHMENTS)
    const colleagues = this.audience(projectId, ticketId, persona, read.audience)
    if (typeof colleagues === 'string') return colleagues
    const readers: OpinionReader[] = colleagues.map((colleague) => {
      const gate = deps.gateOf(projectId, colleague)
      return {
        id: colleague.id, name: colleague.name, title: colleague.title, personality: colleague.personality, instructions: colleague.instructions,
        motor: deps.motorOf(colleague), paused: gate.paused, atLimit: gate.limited,
      }
    })
    // The request's own image rides along only when someone of the round can SEE it: an image the model never named must not stop a round that was
    // about words (the Codex engine does not read images yet); the model is told it stayed behind.
    const sighted = readers.some(reader => reader.motor.readsImages && !reader.paused && !reader.atLimit)
    const fromRequest = sighted ? candidates : []
    const left = sighted ? [] : candidates.map(row => row.name)
    const parsed = {
      ...read,
      ...(art.extraText === undefined ? {} : { text: `${read.text ?? ''}${art.extraText}`.trim() }),
      attachmentIds: fromRequest.length > 0 ? fromRequest.map(row => row.id) : [...new Set(resolved)],
    }
    const added = fromRequest.map(row => row.name)
    const day = deps.now().slice(0, 10)
    const sizes = parsed.attachmentIds.length === 0 ? [] : deps.imageSizes?.(projectId, parsed.attachmentIds) ?? []
    const calibration = deps.calibration?.(projectId)
    const conta = deps.accountOf?.(projectId, persona)
    const budgetOf = (autonomy: 'act' | 'suggest'): OpinionBudget => budgetOpinionRound({
      question: parsed.question,
      draft: {
        ...(parsed.text === undefined ? {} : { text: parsed.text }),
        images: [...parsed.attachmentIds.map((_, at) => ({ ...(sizes[at] === undefined ? {} : { size: sizes[at] }) })), ...art.art.map(() => ({}))],
      },
      asker: {
        id: persona.id, name: persona.name, title: persona.title, personality: persona.personality, instructions: persona.instructions,
        autonomy,
        asksToday: deps.otherAsksToday(projectId, persona.id, day) + this.askedToday(projectId, persona.id, day),
      },
      readers,
      roundsUsed: this.roundsUsed(projectId, ticketId),
      policy: { roundsCap: limits.maxOpinionRounds, dailyCap: limits.askCapPerDay },
      ...(calibration === undefined ? {} : { calibracao: calibration }),
      ...(conta === undefined ? {} : { conta }),
    })
    const budget = budgetOf('act')
    if (budget.decision === 'stop') return this.stopped(budget, limits)
    // A big round needs the person's say first: the proposal is the budget's own sentence ("Posso pedir a opinião da equipe sobre …? ≈ n respostas").
    const overCost = deps.confirmAboveMicroUsd !== undefined && budget.cost !== undefined && budget.cost.referenciaMicroUsd.max > deps.confirmAboveMicroUsd
    if (budget.asked.length > CONFIRM_ABOVE_COLLEAGUES || overCost) {
      const why = budget.asked.length > CONFIRM_ABOVE_COLLEAGUES ? `Esta rodada chamaria ${String(budget.asked.length)} colegas (mais de ${String(CONFIRM_ABOVE_COLLEAGUES)})` : 'Esta rodada passa do que a pessoa aceita usar sem confirmar'
      return refuse('propose', `${why}: pergunte antes à pessoa (persona_ask): «${budgetOf('suggest').proposta ?? 'Posso pedir a opinião da equipe?'}». Ou escolha até ${String(CONFIRM_ABOVE_COLLEAGUES)} colegas pelo id (audience) e peça de novo.`)
    }

    const id = `${ticketId}:${call.callId}`.replace(/[^A-Za-z0-9:_-]/gu, '-')
    const record: RoundRecord = { id, projectId, ticketId, callId: call.callId, askerId: persona.id, round: budget.round, askedAt: deps.now() }
    // The round counts from HERE, before the first colleague is called; a retry finds this record and adds nothing.
    deps.screens.put(projectId, KIND, id, record)
    const result = await deps.opinions.run({
      projectId, ticketId, requestId: id, askerId: persona.id, question: parsed.question,
      draft: {
        ...(parsed.text === undefined ? {} : { text: parsed.text }),
        ...(parsed.attachmentIds.length === 0 ? {} : { attachmentIds: parsed.attachmentIds }),
        ...(parsed.alt === undefined ? {} : { alt: parsed.alt }),
        ...(art.art.length === 0 ? {} : { art: art.art }),
        ...(art.files.length === 0 ? {} : { files: art.files }),
      },
      readerIds: budget.asked,
      skipped: budget.skipped.map(row => ({ id: row.id, why: row.why })),
      round: budget.round, maxRounds: budget.roundsCap,
      audience: Array.isArray(parsed.audience) ? 'some' : 'team',
      estimate: { responses: budget.asked.length, ...(budget.rodape.includes(' · ') ? { cost: budget.rodape.split(' · ').slice(1).join(' · ') } : {}) },
      rodape: budget.rodape,
    })
    const projectSize = deps.product.listPersonas(projectId).length - 1
    const narrowed = parsed.audience === 'team' && colleagues.length < projectSize
    const answer = this.answer(budget, result, colleagues, parsed.question, narrowed ? projectSize : undefined, added, left, art.notes)
    // A round that called nobody (the engine refused first) is given back: it costs the persona neither a round nor a request of the day.
    deps.screens.put(projectId, KIND, id, { ...record, answer, ...(result.state === 'failed' && result.replies.length === 0 ? { voided: true as const } : {}) })
    return answer
  }

  private stopped(budget: OpinionBudget, limits: { readonly askCapPerDay: number; readonly maxOpinionRounds: number }): string {
    switch (budget.stop) {
      case 'rounds-cap': return refuse('rounds-cap', `Você já usou as ${String(limits.maxOpinionRounds)} rodadas de opinião desta tarefa. Siga com o que tem; se ainda faltar algo, pergunte à pessoa (persona_ask) se ela quer liberar mais.`)
      case 'daily-cap': return refuse('daily-cap', `Você já fez ${String(limits.askCapPerDay)} pedidos a colegas hoje. Siga com o que tem e avise a pessoa do que falta; ela pode aumentar o limite de pedidos por dia.`)
      case 'no-vision': return refuse('no-vision', 'Ninguém da equipe vê imagens com o motor atual. Descreva a imagem em texto, ou siga com o que tem.')
      case 'nobody': return refuse('nobody', 'Ninguém da equipe pode responder agora (pausa, limite ou sem motor). Siga com o que tem.')
      default: return refuse('draft-empty', 'Mostre algo para a equipe opinar: o texto do rascunho e/ou imagens já anexadas à conversa.')
    }
  }

  /** The sentence the model gets after a round that ran. */
  private answer(budget: OpinionBudget, result: OpinionResult, colleagues: readonly StoredPersona[], question: string, projectSize?: number, added: readonly string[] = [], left: readonly string[] = [], notes: readonly string[] = []): string {
    if (result.state === 'failed') return refuse('failed', `${result.reason ?? 'A rodada de opinião não aconteceu.'} Siga com o que tem.`)
    const nameOf = (id: string): string => colleagues.find(row => row.id === id)?.name ?? id
    return say({
      ok: true, state: result.state, round: budget.round, roundsLeft: budget.roundsLeft,
      opinions: opinionDigestFor({
        question,
        round: budget.round,
        maxRounds: budget.roundsCap,
        replies: result.replies.map(row => ({ name: row.name, mark: row.mark, text: row.text, ...(row.failed === true ? { failed: true } : {}) })),
        notAsked: budget.skipped.map(row => ({ name: nameOf(row.id), why: SKIP_WHY[row.why] })),
        ...(result.consolidation === undefined ? {} : { consolidation: result.consolidation }),
      }),
      ...(result.ignoredAttachmentIds.length === 0 ? {} : { ignoredAttachmentIds: result.ignoredAttachmentIds }),
      ...(added.length === 0 ? {} : { attached: `A imagem anexada ao pedido (${added.join(', ')}) foi junto com o rascunho: você não indicou nenhuma.` }),
      ...(left.length === 0 ? {} : { attached: `A imagem anexada ao pedido (${left.join(', ')}) não foi junto: ninguém desta rodada vê imagens com o motor atual. Descreva-a em texto se for preciso.` }),
      ...(notes.length === 0 ? {} : { art: notes.join(' ') }),
      ...(projectSize === undefined ? {} : { audience: `A rodada foi para as ${String(colleagues.length)} pessoas ligadas a este trabalho (o projeto tem ${String(projectSize)} colegas). Para chamar o projeto todo, use audience "everyone".` }),
    })
  }

  private read(args: Args): { question: string; text: string | undefined; attachmentIds: string[]; idsGiven: boolean; alt: string | undefined; files: string[]; audience: 'team' | 'everyone' | string[] } | string {
    const question = typeof args.question === 'string' ? clip(args.question, QUESTION_MAX) : ''
    if (question === '') return refuse('invalid', 'Diga o que você quer saber da equipe (question).')
    const draft = args.draft !== null && typeof args.draft === 'object' ? args.draft as Args : undefined
    if (draft === undefined) return refuse('invalid', 'Mostre o rascunho: draft com o texto (text) e/ou as imagens anexadas (attachmentIds).')
    const text = typeof draft.text === 'string' && draft.text.trim() !== '' ? draft.text.trim().slice(0, DRAFT_TEXT_MAX) : undefined
    const ids = draft.attachmentIds
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every(item => typeof item === 'string' && item !== ''))) return refuse('invalid', 'As imagens (attachmentIds) vão em uma lista de ids de anexos da conversa.')
    const attachmentIds = [...new Set((ids ?? []) as string[])]
    if (attachmentIds.length > MAX_ATTACHMENTS) return refuse('invalid', `Só dá para mostrar até ${String(MAX_ATTACHMENTS)} imagens por vez.`)
    // P0-C2: the ART saved in the draft folder of THIS Task, by path or by name ("cartaz.svg"); the host reads it, draws an SVG as PNG and shows it to the team.
    const rawFiles = draft.files
    if (rawFiles !== undefined && (!Array.isArray(rawFiles) || !rawFiles.every(item => typeof item === 'string' && item.trim() !== ''))) return refuse('invalid', 'A arte salva (files) vai em uma lista de caminhos do rascunho desta tarefa, por exemplo ["cartaz.svg"].')
    const files = [...new Set(((rawFiles ?? []) as string[]).map(item => item.trim()))]
    if (attachmentIds.length + files.length > MAX_ATTACHMENTS) return refuse('invalid', `Só dá para mostrar até ${String(MAX_ATTACHMENTS)} imagens por vez.`)
    const alt = typeof draft.alt === 'string' && draft.alt.trim() !== '' ? clip(draft.alt, ALT_MAX) : undefined
    const audience = args.audience === undefined || args.audience === 'team'
      ? 'team' as const
      : args.audience === 'everyone'
        ? 'everyone' as const
        : Array.isArray(args.audience) && args.audience.every(item => typeof item === 'string') ? args.audience as string[] : undefined
    if (audience === undefined) return refuse('invalid', "A plateia (audience) é 'team' (as pessoas ligadas a este trabalho), 'everyone' (o projeto todo) ou uma lista de ids de colegas.")
    // `idsGiven`: the model spoke of images (even an empty list = "no image"); only when it did not does the request's own image come along.
    return { question, text, attachmentIds, idsGiven: ids !== undefined, alt, files, audience }
  }

  /**
   * P0-C2: the art the asker saved in the draft of her Task, ready for the round: PNG/JPEG/GIF/WebP as they are, an SVG drawn as a PNG (the team SEES the PNG; when it cannot
   * be drawn the team gets the SVG as TEXT and the model is told), anything else left out with a sentence that says why. Reads only inside the draft of THIS Task.
   * @returns What the round needs (`art` for the colleagues' turns, `files` for the card, `notes` for the model, `extraText` for an SVG that could not be drawn), or a refusal.
   */
  private async artOf(projectId: string, ticketId: string, personaId: string, wanted: readonly string[], hasOtherDraft: boolean): Promise<{ art: OpinionArt[]; files: DraftFileView[]; notes: string[]; extraText: string | undefined } | string> {
    const none = { art: [] as OpinionArt[], files: [] as DraftFileView[], notes: [] as string[], extraText: undefined }
    if (wanted.length === 0) return none
    const root = this.deps.draftRootOf?.(projectId, ticketId)
    if (root === undefined || root === '' || root === '.') return refuse('no-draft', 'Esta tarefa não tem pasta de rascunho: mostre a arte pelas imagens anexadas (attachmentIds) ou descreva-a em texto.')
    const out = { art: [] as OpinionArt[], files: [] as DraftFileView[], notes: [] as string[], extraText: undefined as string | undefined }
    const WHY: Readonly<Record<SvgToPngFailure, string>> = {
      too_big: 'é grande demais (passa de 1 MB)', external: 'usa um recurso de fora (link ou arquivo)', script: 'tem script', invalid: 'não abre como imagem', engine: 'o app não conseguiu desenhá-lo agora',
    }
    for (const asked of wanted) {
      let read = readDraftFile(root, asked)
      if (!read.ok && read.reason === 'not_found') {
        // The model writes a NAME, not always the path: the file of the draft with that name.
        const found = changedSince(root, 0).find(path => bareName(path) === bareName(asked))
        if (found !== undefined) read = readDraftFile(root, found)
      }
      if (!read.ok) {
        out.notes.push(read.reason === 'outside' ? `"${asked}" fica fora do rascunho desta tarefa: indique um arquivo dele.` : `Não achei "${asked}" no rascunho desta tarefa.`)
        continue
      }
      const view: DraftFileView = {
        path: read.path, name: read.name, mime: read.mime, taskId: ticketId, personaId, size: read.bytes.length,
        ...(await thumbOf(read.bytes, read.mime).then(thumb => (thumb === undefined ? {} : { thumb }))),
      }
      if (read.mime === 'image/svg+xml') {
        const text = read.bytes.toString('utf8')
        const drawn = await svgToPng(text)
        if (drawn.ok) {
          out.art.push({ name: read.name.replace(/\.svg$/iu, '.png'), mime: 'image/png', bytes: drawn.png })
          out.files.push(view)
        } else {
          out.files.push(view)
          out.extraText = `${out.extraText ?? ''}\n\n[${read.name}, desenho em SVG]\n${clip(text, SVG_AS_TEXT_MAX)}`
          out.notes.push(`${read.name} ${WHY[drawn.reason]}: o time recebeu o SVG como TEXTO, não como imagem.`)
        }
      } else if (/^image\/(?:png|jpeg|gif|webp)$/u.test(read.mime)) {
        out.art.push({ name: read.name, mime: read.mime, bytes: read.bytes })
        out.files.push(view)
      } else {
        out.notes.push(`${read.name} não é imagem: só imagens e SVG vão ao time como arte; ponha o texto em text.`)
      }
    }
    // Nothing of the art can be shown and there is no text or image either: say why, instead of "draft empty".
    if (out.art.length === 0 && out.extraText === undefined && !hasOtherDraft) {
      return refuse('files', `${out.notes.join(' ')} Mostre ao time o que der (text, attachmentIds) ou siga com o que tem.`)
    }
    return out
  }

  private audience(projectId: string, ticketId: string, asker: StoredPersona, audience: 'team' | 'everyone' | string[]): StoredPersona[] | string {
    const team = this.deps.product.listPersonas(projectId).filter(row => row.id !== asker.id)
    if (audience === 'everyone') return team
    if (audience === 'team') {
      // "The team" of a round is the people LINKED to this work; when nobody is linked (or the host cannot tell) it is the whole project.
      const linked = this.deps.involvedIn === undefined ? undefined : new Set(this.deps.involvedIn(projectId, ticketId))
      const narrowed = linked === undefined ? [] : team.filter(row => linked.has(row.id))
      return narrowed.length > 0 ? narrowed : team
    }
    const picked: StoredPersona[] = []
    for (const id of new Set(audience)) {
      if (id === asker.id) continue
      const one = team.find(row => row.id === id)
      if (one === undefined) return refuse('unknown-colleague', 'Um dos colegas indicados não existe neste projeto. Escolha alguém da equipe, ou use audience "team".')
      picked.push(one)
    }
    return picked
  }
}

/**
 * The harness ports with the opinion tool added. Composition, not an edit: the existing dispatch (boards, sprints, routines) is untouched.
 * @param base - The ports the host already built (`harnessMcpPorts`).
 * @param opinion - The opinion tool.
 */
export function withOpinionTool(base: HarnessMcpPorts, opinion: OpinionTool): HarnessMcpPorts {
  const mine: HarnessToolName = 'ask_team_opinion'
  return {
    tools: [...(base.tools ?? []).filter(name => name !== mine), mine],
    call: (input: HarnessCall): Promise<string> => {
      if (input.tool === mine) return opinion.ask(input)
      return base.call === undefined ? Promise.resolve(refuse('invalid', `${input.tool} unavailable`)) : base.call(input)
    },
  }
}
