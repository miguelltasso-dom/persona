/**
 * The team tools of a REAL persona on the HT-0 path (D-090, Atlas 05/11): `ask_colleague`, `pass_forward` and `review_verdict`
 * (and, beside them, `ask_team_opinion`, which is `opinion-host.ts`). The behaviors already exist as host ports (`handoffs.ts`: the
 * bilhete, the limits that fail closed, the colleague's Task under the asker's mandate, the review step); this file is only the
 * door a live CLI knocks on:
 *   - IDENTITY is the run (persona + Task + call id, from the lease; a forged one has no identity → nothing runs). The arguments say
 *     whom and what, never who is asking;
 *   - MANDATE is the person's: the colleague's Task inherits the scope of the request (`Handoffs.open`, `mandateActorId`), never more;
 *   - ACL: the persona's own switch (`canAskColleagues`) and cap, the circle/depth/per-Task limits (`checkHandoff`), the tool grant
 *     (`write` to open work, `read` is enough to give a verdict) and, for a Task that is the persona's own INITIATIVE, her autonomy
 *     (she may call a colleague on her own only when the person let her act);
 *   - OFFER (D-097, Atlas 05/11: "o Miguel real nunca vai escrever 'peça à Lia'"): NOT by the words of the request. With the team switch on, EVERY
 *     Task of a project with colleagues is offered `ask_colleague`, `pass_forward` and `ask_team_opinion`, and the MODEL decides when to use them, guided
 *     by one short paragraph of team orientation in its turn (`guidanceFor`); a review Task gets `review_verdict` and nothing else; without colleagues,
 *     with the persona's switch off or with the team off nothing is offered. The cost of the definitions is small by design (see `harness-tools.ts`).
 * Inert with `Config.teamwork` off. The model's answer is always a short JSON sentence: `{ ok: true, … }` or `{ ok: false, code, message }`.
 */

import type { HarnessCall, HarnessMcpPorts, HarnessToolName } from '@deepseek-ai/dsh-persona-runners'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { ProductRepos, StoredPersona } from '@deepseek-ai/dsh-persona-store'
import type { Handoffs, TeamworkLimits } from './handoffs.ts'
import type { HarnessPorts } from './harness-ports.ts'

/** The tools this file serves (the opinion tool is composed by `withOpinionTool`). */
export const TEAM_TOOLS = ['ask_colleague', 'pass_forward', 'review_verdict'] as const satisfies readonly HarnessToolName[]

type TeamTool = typeof TEAM_TOOLS[number]

/**
 * What a worker is told about the team (D-097), AFTER the request. It names WHO is on the team (the `colleague` argument needs a name) and says, above the owner
 * norms ("termine… sem devolver o que cabe a você"), that using the team IS finishing well: what belongs to another function is passed on, not done alone.
 * A request with several parts (text and art, for example) is not "só uma resposta em texto". The real round of the team showed a model doing the art itself.
 */
export const TEAM_GUIDANCE_CORE = 'Terminar bem esta tarefa inclui usar a equipe, e isso vale mais que as normas de dono acima: o que é da função de outro colega, passe a ele (pass_forward) em vez de fazer sozinha; quando travar, peça ajuda (ask_colleague); com dúvida de gosto, peça a opinião do time (ask_team_opinion). Um pedido com várias partes (texto e arte, por exemplo) não é só uma resposta em texto: faça a sua parte e passe o resto a quem é da função. Arte vai como SVG no rascunho: o app a converte em PNG sozinho, então nunca peça PNG a ninguém. Se algo não der, diga em palavras simples o que falta, sem falar de shell nem de ferramenta.'

/**
 * The paragraph of ONE worker: who is on the team (the colleagues she may call, at most 8) and the orientation.
 * @param colleagues - The other people of the project.
 */
export function teamGuidance(colleagues: readonly { readonly name: string; readonly title: string }[]): string {
  // By name, so the paragraph (and the warm session that carries it) does not change with the order the store lists people in.
  const shown = [...colleagues].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(0, 8).map(row => `${row.name} (${row.title})`)
  const more = colleagues.length > shown.length ? ` e mais ${String(colleagues.length - shown.length)}` : ''
  return `Você trabalha numa equipe. Equipe: ${shown.join(', ')}${more}.\n${TEAM_GUIDANCE_CORE}`
}

/** What the tools need from the host. */
export interface TeamToolsDeps {
  /** `Config.teamwork`: with it off nothing is offered and nothing runs. */
  readonly enabled: () => boolean
  readonly product: Pick<ProductRepos, 'listPersonas'>
  readonly harness: Pick<HarnessPorts, 'identityOf'>
  readonly handoffs: Pick<Handoffs, 'ask' | 'verdict' | 'isReviewTask'>
  readonly limitsOf: (projectId: string, personaId: string) => TeamworkLimits
  readonly ticketOf: (projectId: string, ticketId: string) => Ticket | undefined
}

function say(value: unknown): string {
  return JSON.stringify(value)
}

function refuse(code: string, message: string): string {
  return say({ ok: false, code, message })
}

/** Lower case, no accents: how the words of a request are compared. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR')
}

/** How a model writes a name: "Teo", "@Teo", "Teo (Arte)", "Teo — Arte". The raw text first, then without the "@", then the name before any note. */
function spellings(raw: string): string[] {
  const trimmed = raw.trim()
  const bare = trimmed.replace(/^@+/u, '')
  const name = bare.split(/\s*\(|\s+[-–—:]\s+|\s*:\s*/u)[0]?.trim() ?? ''
  return [...new Set([trimmed, bare, name].filter(item => item !== ''))]
}

/** Who the model means: an id, a name, or a function that only one person has; `ambiguous` when more than one answers to it. */
function findColleague(people: readonly StoredPersona[], raw: string): { readonly found?: StoredPersona; readonly ambiguous: boolean } {
  let ambiguous = false
  for (const spelling of spellings(raw)) {
    const wanted = plain(spelling)
    const byId = people.find(row => row.id === spelling)
    if (byId !== undefined) return { found: byId, ambiguous: false }
    const byName = people.filter(row => plain(row.name) === wanted)
    const byTitle = people.filter(row => plain(row.title) === wanted)
    if (byName.length === 1 && byName[0] !== undefined) return { found: byName[0], ambiguous: false }
    if (byName.length === 0 && byTitle.length === 1 && byTitle[0] !== undefined) return { found: byTitle[0], ambiguous: false }
    if (byName.length + byTitle.length > 1) ambiguous = true
  }
  return { ambiguous }
}

/** The persona's name and title, as the model reads the team in a refusal. */
const rosterOf = (people: readonly StoredPersona[]): string => people.slice(0, 12).map(row => `${row.name} (${row.title})`).join(', ')

/** The door of the live CLI to the team behaviors. */
export class TeamTools {
  private readonly deps: TeamToolsDeps

  /** @param deps - Host parts. */
  constructor(deps: TeamToolsDeps) {
    this.deps = deps
  }

  /**
   * The team tools one Task is offered.
   * @param projectId - Tenant.
   * @param persona - Who runs the Task.
   * @param ticketId - The Task.
   * @returns The tool names (the turn opener keeps only these of the ones the lease announces).
   */
  toolsFor(projectId: string, persona: StoredPersona, ticketId: string): HarnessToolName[] {
    if (!this.deps.enabled()) return []
    // The reviewer's Task has one job: its verdict.
    if (this.deps.handoffs.isReviewTask(projectId, ticketId)) return ['review_verdict']
    // Not by words: a project with colleagues, the team on and the persona's own switch on is all it takes.
    const colleagues = this.deps.product.listPersonas(projectId).filter(row => row.id !== persona.id)
    if (colleagues.length === 0 || !this.deps.limitsOf(projectId, persona.id).canAskColleagues) return []
    return ['ask_colleague', 'pass_forward', 'ask_team_opinion']
  }

  /**
   * The team orientation of a turn: ONE short paragraph, only for a Task that is offered the team tools, so a model uses them without a magic word.
   * @param projectId - Tenant.
   * @param persona - Who runs the Task.
   * @param ticketId - The Task.
   * @returns The paragraph (pt-BR, like the rest of the turn), or undefined when the Task is not offered the tools to ask or pass work.
   */
  guidanceFor(projectId: string, persona: StoredPersona, ticketId: string): string | undefined {
    if (!this.toolsFor(projectId, persona, ticketId).includes('ask_colleague')) return undefined
    return teamGuidance(this.deps.product.listPersonas(projectId).filter(row => row.id !== persona.id))
  }
  /**
   * One call of a team tool.
   * @param input - The call, with the RUN that opened the turn (never the arguments).
   * @returns A JSON sentence for the model.
   */
  call(input: HarnessCall): string {
    if (!(TEAM_TOOLS as readonly string[]).includes(input.tool)) return refuse('invalid', `${input.tool} unavailable`)
    if (!this.deps.enabled()) return refuse('unavailable', 'O trabalho em equipe ainda não está ligado neste projeto. Siga com o que tem.')
    const who = this.deps.harness.identityOf(input.run, input.callId)
    if (who === undefined) return refuse('forbidden', 'Não reconheço este turno; nada foi feito.')
    const { projectId } = who
    const tool = input.tool as TeamTool
    const reviewing = this.deps.handoffs.isReviewTask(projectId, input.run.ticketId)

    if (tool === 'review_verdict') {
      const result = this.deps.handoffs.verdict({ projectId, ticketId: input.run.ticketId, personaId: who.personaId, args: input.args })
      return result.ok
        ? say({
          ok: true, verdict: result.verdict, points: result.points,
          next: 'Veredito registrado; ele vale quando você terminar o turno. Termine com uma frase curta, sem repetir os pontos.',
        })
        : refuse('refused', result.message)
    }

    if (reviewing) return refuse('review-task', 'Você está revisando: dê o veredito com review_verdict. Pedir ajuda ou passar o trabalho não cabe numa revisão.')
    // The persona's own INITIATIVE (a routine, a proposal): calling a colleague spends the person's time and money, so only when she may act.
    const ticket = this.deps.ticketOf(projectId, input.run.ticketId)
    const campaign = ticket !== undefined && ticket.origin.triggerId.startsWith('campaign:')
    if (who.initiator === 'persona-initiative' && who.autonomy !== 'act' && !campaign) {
      return refuse('needs-person', 'Esta tarefa é iniciativa sua e a pessoa deixou você só propor: pergunte a ela (persona_ask) antes de chamar um colega.')
    }

    const people = this.deps.product.listPersonas(projectId).filter(row => row.id !== who.personaId)
    const asked = typeof input.args.colleague === 'string' ? input.args.colleague.trim() : ''
    if (asked === '') return refuse('invalid', `Diga quem (colleague). Quem está na equipe: ${rosterOf(people)}.`)
    const { found, ambiguous } = findColleague(people, asked)
    if (found === undefined) {
      return refuse(ambiguous ? 'ambiguous-colleague' : 'unknown-colleague',
        `${ambiguous ? 'Mais de uma pessoa responde por' : 'Não achei'} “${asked.slice(0, 60)}” na equipe. Quem está aqui: ${rosterOf(people)}. Use o nome.`)
    }

    const result = this.deps.handoffs.ask({
      projectId, fromTicketId: input.run.ticketId, fromPersonaId: who.personaId, toPersonaId: found.id,
      kind: tool === 'pass_forward' ? 'next' : 'help', callId: input.callId,
      title: input.args.title,
      note: { done: input.args.done, needed: input.args.needed, files: input.args.files, decisions: input.args.decisions },
    })
    if (!result.ok) return refuse('refused', result.message)
    const base = { ok: true, requestId: result.requestId, status: result.status, colleague: found.name, ...(result.duplicate === true ? { duplicate: true } : {}) }
    if (result.status === 'blocked') {
      return say({ ...base, next: `O pedido a ${found.name} espera a pessoa liberar um acesso (ela viu um cartão). Termine o que dá sem essa ajuda e diga o que está esperando.` })
    }
    if (tool === 'pass_forward') {
      return say({ ...base, next: `O trabalho segue para ${found.name} com o seu bilhete. Entregue agora a sua parte; a parte de ${found.name} não é sua.` })
    }
    return say({
      ...base,
      next: `${result.status === 'held' ? `${found.name} está em pausa: o pedido fica na fila até voltar. ` : ''}Pedido enviado a ${found.name}. Faça o que dá sem a ajuda e termine o turno dizendo o que está esperando; quando ${found.name} entregar, esta tarefa continua com a entrega. Não faça a parte de ${found.name}.`,
    })
  }
}

/**
 * The harness ports with the team tools added: composition, like `withOpinionTool` (the dispatch of boards, sprints and routines is untouched).
 * @param base - The ports the host already built.
 * @param team - The team tools.
 */
export function withTeamTools(base: HarnessMcpPorts, team: TeamTools): HarnessMcpPorts {
  const mine: readonly HarnessToolName[] = TEAM_TOOLS
  return {
    tools: [...(base.tools ?? []).filter(name => !mine.includes(name)), ...TEAM_TOOLS],
    call: (input: HarnessCall): Promise<string> => {
      if (mine.includes(input.tool)) return Promise.resolve(team.call(input))
      return base.call === undefined ? Promise.resolve(refuse('invalid', `${input.tool} unavailable`)) : base.call(input)
    },
  }
}
