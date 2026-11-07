/**
 * HT-6 (D-084, contracts/harness-tools.md §2-F): a persona hires another persona through the tool `persona_hire`. Only the personas the
 * person allowed (“Pode contratar”); EVERY hire is a card in Aprovações (the A-4 card: unique name and face, no invented “por quê”) —
 * unless the person turned “Contratar direto” on for that persona, and then only inside the limits below. The new persona never has more
 * access than the one who hired her: the card creates her with no tools, skills or limits of her own (the rule of the core,
 * `assertProposalWithinCreatorAccess`, still holds on approval).
 *
 * The person's request (“contrate alguém para X”) authorizes the verb; the persona's own initiative follows her autonomy: `asked` never
 * hires, `propose` only ever leaves the card, `act` leaves the card too unless “Contratar direto” is on.
 */

import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type { HarnessIdentity } from './harness-routines.ts'
import type { ApprovalView, DecideApprovalRequest, ProposeHireRequest } from './types.ts'

/** Hire cards a recruiter may have waiting for the person. */
export const MAX_OPEN_HIRE_CARDS = 2
/** People a recruiter may hire on her own, per day, when “Contratar direto” is on. */
export const MAX_DIRECT_HIRES_PER_DAY = 2
/** People in one project, hired and waiting. */
export const MAX_TEAM_SIZE = 12

export type HireFailureCode = 'forbidden' | 'invalid' | 'limit'

/** What the activity feed shows (contracts/harness-tools.md §4); the UI writes the words. */
export interface HireActivity {
  readonly verb: 'persona_hire'
  readonly target: { readonly kind: 'persona'; readonly id: string; readonly title: string }
  readonly after: 'Aguardando a sua aprovação' | 'Contratada'
  readonly initiator: HarnessIdentity['initiator']
  readonly requestId?: string
  readonly status: 'done'
  /** The waiting card can be cancelled (`decideApproval` reject); a person hired directly can be retired (`retirePersona`: she leaves the team, her history stays). */
  readonly undoable: boolean
  readonly undo?: { readonly remote: 'decideApproval' | 'retirePersona'; readonly request: Readonly<Record<string, unknown>> }
  readonly at: string
}

export interface HireInput {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly reason?: string
}

export type HireResult =
  | { readonly ok: true; readonly body: { readonly status: 'pending' | 'hired'; readonly hire: { readonly id: string; readonly name: string; readonly title: string }; readonly message: string }; readonly activity?: HireActivity }
  | { readonly ok: false; readonly code: HireFailureCode; readonly message: string }

export interface HiringDeps {
  readonly product: Pick<ProductRepos, 'getPersona' | 'listPersonas'>
  /** The same entry as the person's own `proposeHire`: the card in Aprovações. */
  readonly propose: (request: ProposeHireRequest) => ApprovalView
  /** The same decision as the person's `decideApproval` (used only for “Contratar direto”). */
  readonly decide: (request: DecideApprovalRequest) => ApprovalView
  readonly approvals: (projectId: string) => readonly ApprovalView[]
  /** “Contratar direto” of this persona, as the person set it (off unless she turned it on). */
  readonly hireDirectOf: (projectId: string, personaId: string) => boolean
  /** People she hired on her own that day (`YYYY-MM-DD` on the host's clock), and the note of one more. */
  readonly directToday: (projectId: string, personaId: string, day: string) => number
  readonly noteDirect: (projectId: string, personaId: string, day: string) => void
  readonly now: () => string
}

const FORBIDDEN = 'Você não contrata pessoas; peça à Coordenação ou à pessoa.'

/** Short text with no control characters; undefined when empty or too long. */
function clean(value: string, max: number): string | undefined {
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  return text === '' || text.length > max ? undefined : text
}

/** The host side of `persona_hire`. */
export class HiringPorts {
  private readonly deps: HiringDeps

  /** @param deps - Host parts. */
  constructor(deps: HiringDeps) {
    this.deps = deps
  }

  /**
   * Bring a person to the team (a card for the person, or at once when she allowed it).
   * @param who - The persona of the run (never an argument), her project and why she acts.
   * @param input - Name, function and description of the person to hire, and the real reason when she has one.
   */
  hire(who: HarnessIdentity, input: HireInput): HireResult {
    const { deps } = this
    const persona = deps.product.getPersona(who.personaId)
    if (persona === undefined || persona.projectId !== who.projectId) return { ok: false, code: 'forbidden', message: FORBIDDEN }
    if (!persona.canRecruit) return { ok: false, code: 'forbidden', message: FORBIDDEN }
    if (who.initiator === 'persona-initiative' && who.autonomy === 'asked') {
      return { ok: false, code: 'forbidden', message: 'Você só contrata quando a pessoa pede.' }
    }
    const name = clean(input.name, 40)
    const title = clean(input.title, 60)
    const description = clean(input.description, 400)
    const reason = input.reason === undefined ? undefined : clean(input.reason, 300)
    if (name === undefined) return { ok: false, code: 'invalid', message: 'Diga o nome da pessoa (até 40 letras).' }
    if (title === undefined) return { ok: false, code: 'invalid', message: 'Diga a função da pessoa (até 60 letras).' }
    if (description === undefined) return { ok: false, code: 'invalid', message: 'Descreva o que a pessoa faz (até 400 letras).' }

    // The same call twice is the same answer: never a second card, never a second hire.
    const id = `hire-${who.callId}`.replace(/[^A-Za-z0-9:_-]/gu, '-')
    const cards = deps.approvals(who.projectId).filter(card => card.kind === 'hire')
    const hiredAlready = deps.product.getPersona(`hire:${id}`)
    if (hiredAlready !== undefined) {
      return { ok: true, body: { status: 'hired', hire: { id: hiredAlready.id, name: hiredAlready.name, title: hiredAlready.title }, message: `${hiredAlready.name} já está na equipe.` } }
    }
    const existing = cards.find(card => card.id === id)
    if (existing !== undefined) {
      return { ok: true, body: { status: 'pending', hire: { id: existing.id, name: existing.title, title: existing.roleTitle ?? title }, message: `O pedido para contratar ${existing.title} já espera a decisão da pessoa.` } }
    }

    const waiting = cards.filter(card => card.status === 'pending')
    if (waiting.filter(card => card.personaId === who.personaId).length >= MAX_OPEN_HIRE_CARDS) {
      return { ok: false, code: 'limit', message: `Você já tem ${String(MAX_OPEN_HIRE_CARDS)} pedidos de contratação esperando a pessoa. Espere a decisão antes de pedir outro.` }
    }
    if (deps.product.listPersonas(who.projectId).length + waiting.length >= MAX_TEAM_SIZE) {
      return { ok: false, code: 'limit', message: 'A equipe já está no tamanho máximo.' }
    }
    // “Contratar direto” never goes around the person's request or the persona's autonomy: only a request of hers, or `act`.
    const direct = deps.hireDirectOf(who.projectId, who.personaId) && (who.initiator === 'person-request' || who.autonomy === 'act')
    if (direct) {
      if (deps.directToday(who.projectId, who.personaId, deps.now().slice(0, 10)) >= MAX_DIRECT_HIRES_PER_DAY) {
        return { ok: false, code: 'limit', message: `Você já contratou ${String(MAX_DIRECT_HIRES_PER_DAY)} pessoas hoje. Amanhã você pode contratar de novo, ou deixe o pedido para a pessoa decidir.` }
      }
    }

    let card: ApprovalView
    try {
      card = deps.propose({
        workspaceId: who.workspaceId, projectId: who.projectId, id, creatorPersonaId: who.personaId, name, title, description,
        ...(reason === undefined ? {} : { reason }),
      })
    } catch (error: unknown) {
      void error // the core's reason may echo the spec (a secret is refused there): the persona gets a safe sentence
      return { ok: false, code: 'invalid', message: 'Não consegui montar o pedido de contratação. Confira o nome, a função e a descrição (sem senhas ou chaves).' }
    }
    const at = deps.now()
    const common = { verb: 'persona_hire' as const, initiator: who.initiator, ...(who.requestId === undefined ? {} : { requestId: who.requestId }), status: 'done' as const, at }
    if (direct) {
      deps.decide({ workspaceId: who.workspaceId, projectId: who.projectId, id, kind: 'hire', accept: true })
      deps.noteDirect(who.projectId, who.personaId, at.slice(0, 10))
      const hired = deps.product.getPersona(`hire:${id}`)
      const hiredName = hired?.name ?? card.title
      return {
        ok: true,
        body: { status: 'hired', hire: { id: hired?.id ?? `hire:${id}`, name: hiredName, title: card.roleTitle ?? title }, message: `${hiredName} entrou na equipe (a pessoa deixou você contratar direto).` },
        activity: {
          ...common, target: { kind: 'persona', id: hired?.id ?? `hire:${id}`, title: hiredName }, after: 'Contratada', undoable: true,
          undo: { remote: 'retirePersona', request: { workspaceId: who.workspaceId, projectId: who.projectId, personaId: hired?.id ?? `hire:${id}` } },
        },
      }
    }
    return {
      ok: true,
      body: { status: 'pending', hire: { id: card.id, name: card.title, title: card.roleTitle ?? title }, message: `Pedi à pessoa para contratar ${card.title}. Ela decide em Aprovações; a contratação só vale depois que ela aprovar.` },
      activity: {
        ...common, target: { kind: 'persona', id: card.id, title: card.title }, after: 'Aguardando a sua aprovação', undoable: true,
        undo: { remote: 'decideApproval', request: { workspaceId: who.workspaceId, projectId: who.projectId, id, kind: 'hire', accept: false } },
      },
    }
  }
}
