/**
 * D-103a: fail closed per engine. No connector of the person executes send / publish / pay / delete (or any change) on a CLI whose permission gate is not PROVEN.
 * Today only Claude is: its PreToolUse hook (`PermissionGate`) judges every MCP call BEFORE it runs. Codex, Cursor and OpenCode have everything of the person's already loaded
 * and no proven way to hold a call for the person's decision, so on them the connectors are READ-ONLY and the screen says so (`cliCapabilityReport(...).connectorActions`,
 * `engineConnectorNotice`).
 *
 * Pure policy plus a stream observer on the runner, the same shape as the tool-level guard (`withToolLevel`) but for the tools of the PERSON's connectors, whatever the
 * persona's own native grant is (a persona that may write files and run shell is still read-only on a connector here). What it covers and what it does not:
 *  - a read must be PROVEN by the tool's name (`isReadByName`); a harmless-looking name, or one with no verb at all, is an action that leaves (`classifyTool`): fail closed;
 *  - the NATIVE tools of the CLIs (Bash, Edit...) are the persona's own tool level business, and the product tools THIS turn was offered answer to the gateway lease
 *    (grant + ACL + approval): neither is touched here;
 *  - it is an observer: it cancels the turn when the call is announced. A call the engine itself already declined (Codex runs with approval policy `never` and declines an MCP
 *    tool not marked read-only) never ran; one the engine runs at once cannot be held back by this layer, which is exactly why "proven gate" is the word of the decision.
 * One switch: the seal follows `permissionPreview` of the capability report; the day a CLI's hook is proven on a real run, it opens by itself.
 */

import { eventTime, type CliKind, type RunEvent, type RunHandle, type Runner, type StartTurnInput } from '../contract.ts'
import { cliCapabilityReport } from '../oar/isolation.ts'
import { PRECISA_DE_VOCE } from './cli-policy.ts'
import { classifyTool, isReadByName, type ActionClass } from './tool-action.ts'
import { isNativeToolName, offeredNames, toolNameFromEvent } from './tool-level.ts'

/** What the policy says about one connector tool. */
export type ConnectorVerdict =
  | { readonly allow: true }
  | { readonly allow: false; readonly actionClass: ActionClass; readonly verb: string }

const LABELS: Readonly<Record<string, string>> = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', opencode: 'OpenCode' }

/** How the engine is called on the screen. */
function labelOf(cli: string): string {
  return LABELS[cli] ?? cli
}

/** The action, in the person's words. */
function actionWords(actionClass: ActionClass): string {
  switch (actionClass) {
    case 'send': return 'enviar ou publicar'
    case 'pay': return 'pagar'
    case 'delete': return 'apagar'
    case 'change': return 'alterar'
    case 'read': return 'ler'
  }
}

/**
 * True when the engine's permission gate is proven on a real run (today: Claude's hook only).
 * @param cli - CLI id.
 * @param env - Environment (default `process.env`).
 */
export function engineGateProven(cli: string, env?: NodeJS.ProcessEnv): boolean {
  return cliCapabilityReport(cli, env).permissionPreview === 'hook'
}

/**
 * The line for the screen on an engine whose connectors are read-only; `undefined` when the engine's gate is proven (nothing to warn about).
 * @param cli - CLI id.
 * @param env - Environment (default `process.env`).
 */
export function engineConnectorNotice(cli: string, env?: NodeJS.ProcessEnv): string | undefined {
  if (engineGateProven(cli, env)) return undefined
  return `${labelOf(cli)} lê os seus conectores, mas ainda não tem a trava de permissão provada: aqui só leio; enviar, publicar, pagar e apagar ficam para o Claude.`
}

/**
 * What a connector tool may do on an engine.
 * @param cli - CLI id.
 * @param toolName - The tool as the run event names it (`mcp__server__tool`, `server.tool`...).
 * @param options - `proven` overrides the engine's seal (tests, and the day a gate is proven).
 * @returns `allow: true` when the engine's own gate judges it, when it is a native tool, or when the name proves a read; otherwise the class and verb that decided.
 */
export function connectorVerdict(cli: string, toolName: string, options: { readonly proven?: boolean } = {}): ConnectorVerdict {
  if (options.proven ?? engineGateProven(cli)) return { allow: true }
  if (isNativeToolName(toolName)) return { allow: true }
  if (isReadByName(toolName)) return { allow: true }
  const { actionClass, verb } = classifyTool(toolName)
  return { allow: false, actionClass, verb }
}

/**
 * Hold a turn that reaches for a connector tool the engine may not run: cancel it and end it `blocked`, in human words.
 * @param inner - Resolved runner.
 * @param cli - The CLI behind it.
 * @param options - `proven` overrides the engine's seal.
 * @returns `inner` itself when the engine's gate is proven.
 */
export function withEngineConnectorPolicy(inner: Runner, cli: CliKind | string, options: { readonly proven?: boolean } = {}): Runner {
  if (options.proven ?? engineGateProven(cli)) return inner
  // The product tools THIS turn was offered answer to the gateway lease, not to this policy: exempt by exact name, only for the run that was offered them.
  const offered = new Map<string, ReadonlySet<string>>()
  const track = async (opened: Promise<RunHandle>, input: StartTurnInput): Promise<RunHandle> => {
    const handle = await opened
    if (input.mcpTools !== undefined && input.mcpTools.tools.length > 0) offered.set(handle.runId, offeredNames(input.mcpTools))
    return handle
  }
  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    for await (const event of inner.stream(handle)) {
      const name = toolNameFromEvent(event)
      if (name !== undefined && !offered.get(handle.runId)?.has(name)) {
        const verdict = connectorVerdict(cli, name, { proven: false })
        if (!verdict.allow) {
          try {
            await inner.cancel(handle)
          } catch (error) {
            void error
          }
          const summary = `Neste motor (${labelOf(cli)}) só leio nos seus conectores: ${actionWords(verdict.actionClass)} fica para o Claude, que tem a trava de permissão provada. Ferramenta: ${name}.`
          yield { type: 'ended', at: eventTime(), report: { state: 'blocked', summary, question: `${PRECISA_DE_VOCE} ${summary}` } }
          return
        }
      }
      yield event
    }
  }
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => track(inner.start(input), input),
    startTurn: input => track(inner.startTurn(input), input),
    stream: play,
    events: play,
    cancel: handle => inner.cancel(handle),
    resume: input => track(inner.resume(input), input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}
