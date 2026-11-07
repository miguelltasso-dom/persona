/**
 * Hardened per-turn MCP gateway: secret token, allowlist, approval for
 * sensitive calls, refuse the rest. Identity is the turn, never the args.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'
import { PRECISA_DE_VOCE } from '../resolve/cli-policy.ts'
import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool, PersonaRunIdentity, PersonaToolHooks } from './persona-tools.ts'
import { personaMcpTools } from './persona-tools.ts'
import { actingMcpTools, type ActingPorts } from './acting-tools.ts'
import { brainMcpTools, type BrainPorts } from './brain-tools.ts'
import { gestorMcpTools, type GestorPorts } from './gestor-tools.ts'
import { harnessMcpTools, type HarnessMcpPorts } from './harness-tools.ts'
import { outboundMcpTools, type OutboundPorts } from '../sources/outbound-tools.ts'

export type SensitiveKind =
  | 'write_outside_worktree'
  | 'external_network'
  | 'credentials'
  | 'outbound_message'
  | 'browser_act'
  | 'computer_act'

export interface McpTurnLease {
  turnId: string
  token: string
  url: string
}

export interface McpCallResult {
  content: string
  refused?: boolean
  approvalId?: string
  kind?: SensitiveKind
  question?: string
}

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface PendingApproval {
  id: string
  turnId: string
  name: string
  args: Record<string, unknown>
  kind: SensitiveKind
}

export interface McpGateway {
  openTurn(input: {
    run: PersonaRunIdentity
    toolLevel: ToolLevel
    worktree: string
  }): McpTurnLease
  list(token: string): readonly string[]
  /** HT-0: the definitions (never the handlers) of what this turn may call: what a CLI lists as its tools. */
  describe(token: string): readonly McpToolDefinition[]
  call(token: string, name: string, args: Record<string, unknown>): Promise<McpCallResult>
  approve(approvalId: string): Promise<McpCallResult>
  deny(approvalId: string): McpCallResult
  closeTurn(token: string): void
}

const NET = /^(?:web_fetch|web_search|persona_browser_open|persona_browser_read|persona_browser_act)$/iu
const OUTBOUND = /^(?:persona_telegram_send|persona_email_send)$/iu
const BROWSER_ACT = /^persona_browser_act$/iu
const COMPUTER_ACT = /^persona_computer_(?:click|type)$/iu
const WRITE = /^(?:write|edit|str_replace|apply_patch|bash|shell)$/iu
const CRED = /(?:sk-|tok-|api[_-]?key|bearer\s|password\s*=)/iu
const INJECT = /mcp:\/\/turn\/|authorization:\s*bearer/iu

function tokenEq(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function pathArg(args: Record<string, unknown>): string | undefined {
  for (const key of ['path', 'file', 'cwd', 'target']) {
    const value = args[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * True when `target` escapes `worktree` (relative `..`, absolute, other drive).
 * @param worktree - Assignment worktree.
 * @param target - Caller path.
 */
export function escapesWorktree(worktree: string, target: string): boolean {
  const root = resolve(worktree)
  const abs = isAbsolute(target) ? resolve(target) : resolve(root, target)
  const rel = relative(root, abs)
  return rel === '' ? false : rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)
}

/**
 * Classify a tool call that must pause for human approval.
 * @param name - Tool id.
 * @param args - Untrusted arguments.
 * @param worktree - Assignment worktree.
 */
export function classifySensitive(
  name: string,
  args: Record<string, unknown>,
  worktree: string,
): SensitiveKind | undefined {
  const blob = JSON.stringify(args)
  if (CRED.test(blob)) return 'credentials'
  if (INJECT.test(blob)) return 'credentials'
  if (BROWSER_ACT.test(name)) return 'browser_act'
  if (COMPUTER_ACT.test(name)) return 'computer_act'
  if (OUTBOUND.test(name)) return 'outbound_message'
  if (NET.test(name)) return 'external_network'
  if (WRITE.test(name)) {
    const path = pathArg(args)
    if (path !== undefined && escapesWorktree(worktree, path)) return 'write_outside_worktree'
  }
  return undefined
}

function secretToken(): string {
  return randomBytes(24).toString('hex')
}

/**
 * Per-process MCP gateway. One lease per turn; tokens are not reusable across turns.
 * @param options - Hooks, optional acting ports, clock.
 */
export function createMcpGateway(options: {
  hooks: PersonaToolHooks
  acting?: ActingPorts
  outbound?: OutboundPorts
  brain?: BrainPorts
  gestor?: GestorPorts
  /** HT-0: the board, sprints and routines of the product, run by the host ports (only the tools the host wired are announced). */
  harness?: HarnessMcpPorts
  extras?: readonly PersonaMcpTool[]
  now?: () => Date
  /**
   * HT-0: a sensitive call paused for the person. The host turns it into the "Precisa de você" card; `approve`/`deny` then settle it.
   * Without it the call would wait for nobody, so the host that serves tools to a live CLI is expected to pass it.
   */
  onApproval?: (approval: PendingApproval) => void
  /**
   * HT-0: announce only the tools whose host port is wired. A live CLI lists what the gateway announces; a tool with no port behind it
   * would only answer "unavailable", and the model would plan around a capability that is not there. Default false keeps the
   * contract tests (which list every definition); the host that serves tools to a CLI sets it.
   */
  onlyWired?: boolean
}): McpGateway {
  const wired = (name: string): boolean => {
    const acting = options.acting ?? {}
    const brain = options.brain ?? {}
    const gestor = options.gestor ?? {}
    const outbound = options.outbound ?? {}
    switch (name) {
      case 'persona_browser_open': return acting.browserOpen !== undefined
      case 'persona_browser_read': return acting.browserRead !== undefined
      case 'persona_browser_act': return acting.browserAct !== undefined
      case 'persona_computer_screenshot': return acting.computerScreenshot !== undefined
      case 'persona_computer_click': return acting.computerClick !== undefined
      case 'persona_computer_type': return acting.computerType !== undefined
      case 'brain_search': return brain.search !== undefined
      case 'brain_read': return brain.read !== undefined
      case 'brain_propose': return brain.propose !== undefined
      case 'gestor_hire': return gestor.hire !== undefined
      case 'gestor_allocate': return gestor.allocate !== undefined
      case 'gestor_reorganize': return gestor.reorganize !== undefined
      case 'gestor_assemble': return gestor.assemble !== undefined
      case 'persona_telegram_send': return outbound.telegramSend !== undefined
      case 'persona_email_send': return outbound.emailSend !== undefined
      default: return true
    }
  }
  const now = options.now ?? (() => new Date())
  const turns = new Map<string, {
    lease: McpTurnLease
    run: PersonaRunIdentity
    toolLevel: ToolLevel
    worktree: string
    tools: Map<string, PersonaMcpTool>
  }>()
  const pending = new Map<string, PendingApproval>()
  let approvals = 0

  const toolsOf = (run: PersonaRunIdentity, toolLevel: ToolLevel): PersonaMcpTool[] => [
    ...personaMcpTools(run, options.hooks, toolLevel),
    ...actingMcpTools(run, options.acting ?? {}, toolLevel),
    ...brainMcpTools(run, options.brain ?? {}, toolLevel),
    ...gestorMcpTools(run, options.gestor ?? {}, toolLevel),
    ...harnessMcpTools(run, options.harness ?? {}, toolLevel),
    ...outboundMcpTools(options.outbound ?? {}, toolLevel),
    ...(options.extras ?? []).filter(tool => allowsTool(toolLevel, tool.name)),
  ].filter(tool => options.onlyWired !== true || wired(tool.name))

  const findTurn = (token: string) => {
    for (const turn of turns.values()) {
      if (tokenEq(turn.lease.token, token)) return turn
    }
    return undefined
  }

  const invoke = async (
    turn: NonNullable<ReturnType<typeof findTurn>>,
    name: string,
    args: Record<string, unknown>,
    trusted: boolean,
  ): Promise<McpCallResult> => {
    const tool = turn.tools.get(name)
    if (tool === undefined || !allowsTool(turn.toolLevel, name)) {
      return {
        content: `Ferramenta ${name} recusada no mandato.`,
        refused: true,
        question: PRECISA_DE_VOCE,
      }
    }
    if (INJECT.test(JSON.stringify(args))) {
      return { content: 'injeção via conteúdo recusada', refused: true }
    }
    if (!trusted) {
      const kind = classifySensitive(name, args, turn.worktree)
      if (kind !== undefined) {
        const id = `appr-${String(++approvals)}`
        const approval: PendingApproval = { id, turnId: turn.lease.turnId, name, args, kind }
        pending.set(id, approval)
        options.onApproval?.(approval)
        return {
          content: `Aprovação pedida: ${kind}.`,
          approvalId: id,
          kind,
          question: PRECISA_DE_VOCE,
        }
      }
    }
    return tool.handler(args)
  }

  return {
    openTurn: (input) => {
      const turnId = `turn-${input.run.assignmentId}`
      const token = secretToken()
      const lease: McpTurnLease = {
        turnId,
        token,
        url: `mcp://turn/${turnId}/${token}`,
      }
      const listed = toolsOf(input.run, input.toolLevel)
      turns.set(turnId, {
        lease,
        run: input.run,
        toolLevel: input.toolLevel,
        worktree: normalize(input.worktree),
        tools: new Map(listed.map(tool => [tool.name, tool])),
      })
      void now
      return lease
    },
    list: (token) => {
      const turn = findTurn(token)
      return turn === undefined ? [] : [...turn.tools.keys()]
    },
    describe: (token) => {
      const turn = findTurn(token)
      if (turn === undefined) return []
      return [...turn.tools.values()].map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }))
    },
    call: async (token, name, args) => {
      const turn = findTurn(token)
      if (turn === undefined) {
        return { content: 'turno desconhecido', refused: true }
      }
      return invoke(turn, name, args, false)
    },
    approve: async (approvalId) => {
      const wait = pending.get(approvalId)
      if (wait === undefined) return { content: 'aprovação desconhecida', refused: true }
      pending.delete(approvalId)
      const turn = turns.get(wait.turnId)
      if (turn === undefined) return { content: 'turno encerrado', refused: true }
      return invoke(turn, wait.name, wait.args, true)
    },
    deny: (approvalId) => {
      const wait = pending.get(approvalId)
      pending.delete(approvalId)
      return {
        content: wait === undefined ? 'aprovação desconhecida' : 'aprovação recusada',
        refused: true,
        question: PRECISA_DE_VOCE,
      }
    },
    closeTurn: (token) => {
      const turn = findTurn(token)
      if (turn === undefined) return
      turns.delete(turn.lease.turnId)
      for (const [id, item] of pending) {
        if (item.turnId === turn.lease.turnId) pending.delete(id)
      }
    },
  }
}
