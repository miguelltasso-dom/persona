/**
 * D-079 (b), the host's half of `persona_ask` for a worker of a REAL CLI (Claude, Codex): until now a CLI persona could not stop to ask
 * the person — her question at the end of a turn became a delivery, and the person's answer a new conversation. The tool lets her ask;
 * `PersonaAsks` (Anvil) opens the question on the Task and posts its card; the turn then ends and the Task WAITS; the person's answer
 * comes back to the SAME Task and session (the next Assignment reads it).
 *
 * This is the hook the gateway calls (`PersonaToolHooks.ask`). It adds what the tool needs around `PersonaAsks`: the identity comes from
 * the RUN (never from the arguments, and the Task must be hers), a small limit of questions per Task, and the same call twice answers the
 * same. The refusals are sentences for the model, with the way forward — she is never stuck.
 */

import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { AskResult } from './persona-asks.ts'

/** Questions a persona may open on ONE Task (each can be a sequence of up to five). */
export const MAX_ASKS_PER_TASK = 2
/** The tool as the model sees it. */
export const ASK_TOOL = 'persona_ask'

const COUNT_KIND = 'ask_tool_count'
const CACHE_MAX = 200

export interface AskToolDeps {
  readonly product: Pick<ProductRepos, 'getPersona'>
  readonly screens: ScreenRepos
  readonly ticketOf: (projectId: string, ticketId: string) => Ticket | undefined
  readonly asks: {
    ask(input: { readonly projectId: string; readonly ticketId: string; readonly personaId: string; readonly questions: unknown }): AskResult
    assume(input: { readonly projectId: string; readonly ticketId: string; readonly personaId: string; readonly assumption: string }): { readonly ok: boolean; readonly message: string }
  }
}

/** What the gateway hands in (see `PersonaToolHooks.ask`). */
export interface AskToolInput {
  readonly run: { readonly personaId: string; readonly ticketId: string; readonly assignmentId: string }
  readonly question: string
  readonly questions?: unknown
  readonly assumption?: string
}

const flat = (value: string): string => value.replace(/\s+/gu, ' ').trim().toLowerCase()

/**
 * @param deps - Host parts.
 * @returns The `ask` hook of the gateway: the sentence the model reads as the tool's result.
 */
export function createAskTool(deps: AskToolDeps): (input: AskToolInput) => string {
  // The same call twice (a retry) answers the same and opens nothing twice. Kept for the life of the process, bounded.
  const answered = new Map<string, string>()
  return (input) => {
    const persona = deps.product.getPersona(input.run.personaId)
    const ticket = persona === undefined ? undefined : deps.ticketOf(persona.projectId, input.run.ticketId)
    // The run decides who asks: the Task must be hers (a forged or foreign run gets nothing).
    if (persona === undefined || ticket === undefined || ticket.execution?.name !== persona.name) return 'Essa tarefa não é sua; não dá para perguntar por ela.'
    const { projectId } = persona
    const question = input.question.trim()
    const assumption = input.assumption?.trim() ?? ''
    if (question === '' && input.questions === undefined) {
      // “I will go on without asking, assuming …”: one honest line for the person, never a question.
      if (assumption === '') return 'Escreva a pergunta (question) ou, se vai seguir sem perguntar, a suposição (assumption).'
      return deps.asks.assume({ projectId, ticketId: ticket.id, personaId: persona.id, assumption }).message
    }
    const key = `${input.run.assignmentId}:${flat(question)}:${flat(JSON.stringify(input.questions ?? ''))}`
    const before = answered.get(key)
    if (before !== undefined) return before
    const used = deps.screens.get<{ count: number }>(projectId, COUNT_KIND, ticket.id)?.count ?? 0
    let result: string
    if (used >= MAX_ASKS_PER_TASK) {
      result = `Você já perguntou ${String(MAX_ASKS_PER_TASK)} vezes nesta tarefa. Siga com a melhor suposição e avise a pessoa com persona_ask({ assumption: "…" }), em uma linha.`
    } else {
      const opened = deps.asks.ask({ projectId, ticketId: ticket.id, personaId: persona.id, questions: input.questions ?? { question } })
      if (opened.ok) {
        deps.screens.put(projectId, COUNT_KIND, ticket.id, { count: used + 1 })
        result = 'Pergunta enviada à pessoa. Termine este turno agora, com uma frase curta: a resposta dela chega no próximo turno desta tarefa, nesta mesma conversa.'
      } else {
        result = opened.message
      }
    }
    if (answered.size >= CACHE_MAX) answered.clear()
    answered.set(key, result)
    return result
  }
}
