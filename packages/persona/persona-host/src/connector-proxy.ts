/**
 * Item 26 (onda B), F1: the PROXY of the services the person connected (Mercado Pago, Notion, an e-mail…), in the host. A persona never talks to a service itself and a CLI never
 * holds a credential: the CLI sees ONE thing, the product's own MCP server with the token of its turn, and on it TWO fixed tools — `conectores_ver` and `conector_usar` — so the
 * list a CLI keeps for its whole session does not change from one turn to the next (a warm session stays warm) and the hundreds of tools of a service are not paid by every turn.
 * Everything that decides lives HERE, not in the CLI:
 *   - WHO: only the services the persona may use in THIS Task (`HostConnectorGrant`, derived by `ConnectorGrantsHost.forRunner` from the person's own words, "só desta vez" or a permanent
 *     permission). Persona ⊆ owner: a service she was not given is not even listed (R1);
 *   - WHAT KIND of action: `classifyTool` (the strictest of the server's annotation and the tool's name; unknown = `send`, fail closed) and `decideConnectorUse`, the SAME decision table the
 *     permission gate uses, so a call is judged one way whichever road it came by. Read runs; change runs and reports; send/pay/delete wait for the person in the card that already exists
 *     (`ExternalActions`), and an approval lets exactly THOSE arguments through, once;
 *   - THE CREDENTIAL: the {@link Upstream} port owns it (the Cofre, the OAuth refresh: F2/F3). The answer to the model carries text, never a token, a header or a URL with a key.
 * Pure of the network and of the model: the upstream, the grants and the cards are ports, so the whole table is walked with a fake service.
 */

import { argsHash, boundedInput, classifyTool, type ActionClass, type ToolAnnotations } from '@deepseek-ai/dsh-persona-runners'
import type { HarnessCall, HarnessMcpPorts, HarnessToolName } from '@deepseek-ai/dsh-persona-runners'
import { decideConnectorUse, type ConnectorAutonomy, type ConnectorOrigin, type PermanentGrant } from './connector-policy.ts'
import type { ActionRequestInput, ExternalActionDoc } from './external-actions.ts'
import type { HarnessPorts } from './harness-ports.ts'
import type { HostConnectorGrant } from './runner.ts'
import type { ConnectorRef } from './types.ts'

/** The tools this file serves. */
export const CONNECTOR_TOOLS = ['conectores_ver', 'conector_usar'] as const satisfies readonly HarnessToolName[]

/** The "CLI" the product's own connectors belong to in the grants (a connector of the person's Claude account is `claude`). */
export const PROXY_CLI = 'persona'

/** What a service says about one of its tools (`tools/list`). All of it is untrusted text. */
export interface UpstreamTool {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: Readonly<Record<string, unknown>>
  readonly annotations?: ToolAnnotations
}

/** Why a call did not come back with an answer. The words for the person are {@link failureWords}. */
export type UpstreamFailure = 'needs_reconnect' | 'missing_scope' | 'unreachable' | 'tool_error'

/** What a call of a service answered. */
export type UpstreamAnswer =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: UpstreamFailure; readonly message?: string }

/** One connected service, reached with the credential the Cofre holds (F2/F3). Nothing here ever returns that credential. */
export interface Upstream {
  tools(): Promise<readonly UpstreamTool[]>
  call(tool: string, args: Readonly<Record<string, unknown>>): Promise<UpstreamAnswer>
}

/** Who asks: the run that opened the turn (never the arguments). */
export interface ProxyWho {
  readonly projectId: string
  readonly personaId: string
  readonly ticketId: string
}

/** The card of an action the person approved, as the ledger keeps it. */
export interface ApprovedAction {
  readonly id: string
}

/** What the proxy needs from the host. */
export interface ConnectorProxyDeps {
  /** The services the person connected in the product (cli `persona`): the names the model is told. */
  readonly connectors: (projectId: string) => readonly ConnectorRef[]
  /** What THIS persona may use in THIS Task (`ConnectorGrantsHost.forRunner(persona, 'persona', ticketId)`): the services, why, and the approved calls. */
  readonly grantsFor: (who: ProxyWho) => readonly HostConnectorGrant[]
  /** The permanent permission of the persona for one service, when there is one (it carries the confirm column). */
  readonly permanentOf: (who: ProxyWho, connectorId: string) => PermanentGrant | undefined
  readonly autonomyOf: (who: ProxyWho) => ConnectorAutonomy
  /** The service itself, or undefined when it is gone (disconnected). */
  readonly upstreamOf: (projectId: string, connector: ConnectorRef) => Upstream | undefined
  /** Keep a call that must wait for the person as ONE card (idempotent on Task, tool and arguments); undefined = refused (too many attempts). */
  readonly record: (input: ActionRequestInput) => ExternalActionDoc | undefined
  /** The card of an approved call with exactly these arguments, to mark it sent once it ran. */
  readonly approvedFor?: (who: ProxyWho, connectorId: string, tool: string, hash: string) => ApprovedAction | undefined
  readonly markSent?: (who: ProxyWho, actionId: string) => void
  readonly markFailed?: (who: ProxyWho, actionId: string, reason: string) => void
  /** A call that ran and changed something: ONE plain line in the thread ("Bia usou o Mercado Pago: criou um link de pagamento"). */
  readonly report?: (who: ProxyWho, line: string) => void
  /** A call that is not authorized yet: the card "Permitir desta vez · Sempre permitir · Agora não". */
  readonly askPermission?: (who: ProxyWho, connector: ConnectorRef) => void
  /** Every call, for the count of use per service (never the arguments, never the answer). */
  readonly used?: (who: ProxyWho, connector: ConnectorRef, tool: string, outcome: 'ran' | 'waiting' | 'refused' | 'failed') => void
}

const say = (value: unknown): string => JSON.stringify(value)
const refuse = (code: string, message: string): string => say({ ok: false, code, message })

/** Words for the model, never for a screen; no technical term the person would not use. */
const KIND_WORDS: Readonly<Record<ActionClass, string>> = { read: 'ler', change: 'mudar', send: 'enviar', pay: 'pagar', delete: 'apagar' }
const DESCRIPTION_MAX = 160
const TOOLS_SHOWN = 60
const ANSWER_MAX = 12_000

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/** What happened to the person's service, in words they say. */
export function failureWords(code: UpstreamFailure, service: string): string {
  switch (code) {
    case 'needs_reconnect': return `O acesso ao ${service} venceu. A pessoa precisa entrar de novo no ${service} (em Conexões); até lá não dá para usar.`
    case 'missing_scope': return `O acesso ao ${service} não cobre esta ação. A pessoa precisa liberar essa permissão ao entrar de novo no ${service}.`
    case 'unreachable': return `Não consegui falar com o ${service} agora. Tente de novo daqui a pouco ou avise a pessoa.`
    case 'tool_error': return `O ${service} recusou o pedido. Confira o que foi enviado.`
  }
}

/** Lower case, no accents: how the model's spelling of a service or a tool is compared. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR').trim()
}

/** The origin of a use: the person's words or a "desta vez" (that Task only), or the persona's own initiative under a permanent permission. */
const originOf = (grant: HostConnectorGrant): ConnectorOrigin => (grant.basis === 'permanent' ? 'initiative' : grant.basis)

/** The proxy of the connected services. */
export class ConnectorProxy {
  private readonly deps: ConnectorProxyDeps

  /** @param deps - Host parts. */
  constructor(deps: ConnectorProxyDeps) {
    this.deps = deps
  }

  /**
   * The services THIS persona may use in THIS Task, with the connector the grant names. A grant for a service that is no longer connected is not listed.
   * @param who - The run.
   */
  usable(who: ProxyWho): { readonly grant: HostConnectorGrant; readonly connector: ConnectorRef }[] {
    const known = this.deps.connectors(who.projectId)
    return this.deps.grantsFor(who).flatMap((grant) => {
      const connector = known.find(row => row.id === grant.id)
      return connector === undefined ? [] : [{ grant, connector }]
    })
  }

  /** Whether the persona has anything to be offered here (the two tools are announced only then, and stay announced). */
  hasAny(who: ProxyWho): boolean {
    return this.usable(who).length > 0
  }

  private pick(who: ProxyWho, name: string): { readonly grant: HostConnectorGrant; readonly connector: ConnectorRef } | undefined {
    const wanted = plain(name)
    return this.usable(who).find(row => plain(row.connector.name) === wanted || row.connector.id === name)
  }

  /**
   * `conectores_ver`: the services, or, naming one, the actions open to this persona and how each one is treated. Nothing is called: the tools come from the service's own list.
   * @param who - The run.
   * @param args - `{ conector?: string }`.
   * @returns A JSON sentence for the model.
   */
  async see(who: ProxyWho, args: Readonly<Record<string, unknown>>): Promise<string> {
    const rows = this.usable(who)
    if (rows.length === 0) return refuse('none', 'Nenhum serviço está liberado para você nesta tarefa. Se precisar de um, diga à pessoa qual e por quê.')
    const asked = typeof args.conector === 'string' ? args.conector.trim() : ''
    if (asked === '') return say({ ok: true, conectores: rows.map(row => row.connector.name), next: 'Diga o serviço (conector) para ver o que dá para fazer nele.' })
    const row = this.pick(who, asked)
    if (row === undefined) return refuse('unknown-connector', `Não achei “${clip(asked, 60)}” entre os serviços liberados para você: ${rows.map(item => item.connector.name).join(', ')}.`)
    const upstream = this.deps.upstreamOf(who.projectId, row.connector)
    if (upstream === undefined) return refuse('gone', `O ${row.connector.name} não está mais ligado. Avise a pessoa.`)
    let tools: readonly UpstreamTool[]
    try {
      tools = await upstream.tools()
    } catch {
      return refuse('unreachable', failureWords('unreachable', row.connector.name))
    }
    const permanent = this.deps.permanentOf(who, row.connector.id)
    const autonomy = this.deps.autonomyOf(who)
    const listed = tools.slice(0, TOOLS_SHOWN).map((tool) => {
      const { actionClass } = classifyTool(tool.name, tool.annotations)
      const decision = decideConnectorUse({ origin: originOf(row.grant), autonomy, actionClass, ...(permanent === undefined ? {} : { grant: permanent }) })
      return {
        ferramenta: tool.name,
        tipo: KIND_WORDS[actionClass],
        ...(tool.description === undefined ? {} : { o_que_faz: clip(tool.description, DESCRIPTION_MAX) }),
        // What the person will see happen: nothing (reads), a line in the thread, a card to confirm, or not open to this persona at all.
        quando: decision === 'run' ? 'roda na hora' : decision === 'run-and-report' ? 'roda e a pessoa vê a linha no fio' : decision === 'preview' ? 'a pessoa confirma antes' : 'precisa de permissão da pessoa',
        ...(tool.inputSchema === undefined ? {} : { argumentos: tool.inputSchema }),
      }
    })
    return say({ ok: true, conector: row.connector.name, ferramentas: listed, ...(tools.length > listed.length ? { mais: tools.length - listed.length } : {}) })
  }

  /**
   * `conector_usar`: one action of one service, judged in the host.
   * @param who - The run.
   * @param args - `{ conector, ferramenta, argumentos? }`.
   * @returns A JSON sentence for the model.
   */
  async use(who: ProxyWho, args: Readonly<Record<string, unknown>>): Promise<string> {
    const name = typeof args.conector === 'string' ? args.conector.trim() : ''
    const tool = typeof args.ferramenta === 'string' ? args.ferramenta.trim() : ''
    if (name === '' || tool === '') return refuse('invalid', 'Diga o serviço (conector) e a ação (ferramenta), como conectores_ver listou.')
    const given = args.argumentos
    if (given !== undefined && (typeof given !== 'object' || given === null || Array.isArray(given))) return refuse('invalid', 'Os argumentos (argumentos) devem ser um objeto.')
    const input = (given ?? {}) as Readonly<Record<string, unknown>>
    const row = this.pick(who, name)
    if (row === undefined) {
      // Not in her list: she may never use it (R1). Offer the way forward, never a way around.
      return refuse('not-granted', `Você não tem “${clip(name, 60)}” liberado nesta tarefa. Diga à pessoa que precisa dele e peça para liberar.`)
    }
    const { grant, connector } = row
    const upstream = this.deps.upstreamOf(who.projectId, connector)
    if (upstream === undefined) return refuse('gone', `O ${connector.name} não está mais ligado. Avise a pessoa.`)
    let listed: readonly UpstreamTool[]
    try {
      listed = await upstream.tools()
    } catch {
      this.deps.used?.(who, connector, tool, 'failed')
      return refuse('unreachable', failureWords('unreachable', connector.name))
    }
    const found = listed.find(item => item.name === tool)
    if (found === undefined) return refuse('unknown-tool', `O ${connector.name} não tem a ação “${clip(tool, 60)}”. Use conectores_ver para ver as que existem.`)

    const { actionClass, verb } = classifyTool(found.name, found.annotations)
    const hash = argsHash(input)
    const approved = (grant.approved ?? []).some(item => item.tool === found.name && item.argsHash === hash) ? this.deps.approvedFor?.(who, connector.id, found.name, hash) : undefined
    if (approved === undefined) {
      const permanent = this.deps.permanentOf(who, connector.id)
      const decision = decideConnectorUse({
        origin: originOf(grant), autonomy: this.deps.autonomyOf(who), actionClass, ...(permanent === undefined ? {} : { grant: permanent }),
      })
      if (decision === 'refuse') {
        this.deps.used?.(who, connector, found.name, 'refused')
        return refuse('refused', `Você só usa o ${connector.name} quando a pessoa pede. Diga o que faria e espere o pedido dela.`)
      }
      if (decision === 'ask-permission') {
        this.deps.askPermission?.(who, connector)
        this.deps.used?.(who, connector, found.name, 'waiting')
        return say({ ok: false, code: 'needs-permission', message: `A pessoa ainda não liberou isto no ${connector.name} para você. Abri o pedido para ela. Termine o que dá sem isso e diga o que está esperando.` })
      }
      if (decision === 'preview') {
        const bounded = boundedInput(input)
        // The card knows send / pay / delete (a change that previews is shown as a send: it leaves the product).
        const cardClass: ActionRequestInput['actionClass'] = actionClass === 'pay' || actionClass === 'delete' ? actionClass : 'send'
        const card = this.deps.record({
          projectId: who.projectId, personaId: who.personaId, ticketId: who.ticketId, connector, tool: found.name, actionClass: cardClass, verb,
          requestedInput: bounded.fields, truncated: bounded.truncated, masked: bounded.masked, argsHash: hash, requestedByPerson: grant.basis !== 'permanent',
        })
        this.deps.used?.(who, connector, found.name, 'waiting')
        if (card === undefined) return refuse('too-many', `Já pedi a confirmação desta ação no ${connector.name} mais de uma vez. Pare aqui e diga à pessoa o que falta.`)
        return say({ ok: false, code: 'waiting-person', message: `Abri um cartão para a pessoa confirmar antes (${KIND_WORDS[actionClass]} no ${connector.name}). Ela vê o que vai acontecer de verdade. Termine o que dá sem isso e diga o que está esperando; quando ela confirmar, esta tarefa continua.` })
      }
    }

    // Authorized: the call itself. The credential never leaves the upstream.
    let answer: UpstreamAnswer
    try {
      answer = await upstream.call(found.name, input)
    } catch {
      answer = { ok: false, code: 'unreachable' }
    }
    if (!answer.ok) {
      this.deps.used?.(who, connector, found.name, 'failed')
      if (approved !== undefined) this.deps.markFailed?.(who, approved.id, failureWords(answer.code, connector.name))
      return refuse(answer.code, failureWords(answer.code, connector.name))
    }
    this.deps.used?.(who, connector, found.name, 'ran')
    if (approved !== undefined) this.deps.markSent?.(who, approved.id)
    if (actionClass !== 'read' && approved === undefined) this.deps.report?.(who, `${connector.name}: ${KIND_WORDS[actionClass]} (${verb})`)
    return say({ ok: true, resultado: clip(answer.text, ANSWER_MAX) })
  }
}

/** Identity and the limits of a call come from the lease (`HarnessPorts.identityOf`), never from the arguments. */
export interface ConnectorToolsDeps {
  readonly proxy: ConnectorProxy
  readonly harness: Pick<HarnessPorts, 'identityOf'>
}

/**
 * The harness ports with the two connector tools added: composition, like `withTeamTools` (the dispatch of boards, sprints and routines is untouched). The tools are announced only
 * when the proxy has something to offer this run; a forged identity has none, so nothing runs.
 * @param base - The ports the host already built.
 * @param deps - The proxy and the identity of the run.
 */
export function withConnectorTools(base: HarnessMcpPorts, deps: ConnectorToolsDeps): HarnessMcpPorts {
  const mine: readonly HarnessToolName[] = CONNECTOR_TOOLS
  return {
    tools: [...(base.tools ?? []).filter(name => !mine.includes(name)), ...CONNECTOR_TOOLS],
    call: (input: HarnessCall): Promise<string> => {
      if (!mine.includes(input.tool)) return base.call === undefined ? Promise.resolve(refuse('invalid', `${input.tool} unavailable`)) : base.call(input)
      const who = deps.harness.identityOf(input.run, input.callId)
      if (who === undefined) return Promise.resolve(refuse('forbidden', 'Não reconheço este turno; nada foi feito.'))
      const run: ProxyWho = { projectId: who.projectId, personaId: who.personaId, ticketId: input.run.ticketId }
      return input.tool === 'conectores_ver' ? deps.proxy.see(run, input.args) : deps.proxy.use(run, input.args)
    },
  }
}
