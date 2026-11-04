/**
 * Typed resolve failures. The UI shows `describeRunError` text; these strings
 * are the reserve copy from persona-spec/design/RUN-ERRORS-SPEC.md (no CLI /
 * runner / DSH / host jargon).
 */

export type RunnerResolveErrorCode =
  | 'cli_not_found'
  | 'not_logged_in'
  | 'model_unavailable'
  | 'quota_exhausted'
  | 'budget_exhausted'
  | 'provider_unreachable'
  | 'engine_unavailable'
  | 'app_offline'

export interface RunErrorFields {
  readonly code: RunnerResolveErrorCode
  readonly provider?: string
  readonly command?: string
  readonly resetAt?: string
  readonly model?: string
  readonly account?: string
}

const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  dsh: 'Persona',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
}

const LOGIN_COMMAND: Record<string, string> = {
  claude: 'claude login',
  codex: 'codex login',
  opencode: 'opencode auth login',
  cursor: 'cursor-agent login',
}

/**
 * Human provider name. Never a CLI binary or "DSH".
 * @param id - Runner / CLI identity or `provider:account` quota key.
 */
export function providerLabel(id: string): string {
  const key = id.split(':')[0] ?? id
  return PROVIDER_LABEL[key] ?? key
}

/**
 * Login command to copy, when the provider has one.
 * @param id - Runner identity.
 */
export function loginCommandFor(id: string): string | undefined {
  return LOGIN_COMMAND[id.split(':')[0] ?? id]
}

/**
 * One-line login hint. Never asks for a token.
 * @param cli - Runner identity.
 */
export function loginHintFor(cli: string): string {
  const command = loginCommandFor(cli)
  return command === undefined
    ? 'Faça login uma vez no terminal e tente de novo. A Persona nunca pede sua senha.'
    : `Faça login uma vez no terminal (${command}) e tente de novo. A Persona nunca pede sua senha.`
}

function reserveMessage(fields: RunErrorFields): string {
  const provider = fields.provider ?? 'provedor'
  switch (fields.code) {
    case 'not_logged_in':
      return `O ${provider} não está conectado neste computador.`
    case 'cli_not_found':
      return `O ${provider} não está instalado neste computador.`
    case 'model_unavailable':
      return fields.model === undefined
        ? `O modelo não está disponível no ${provider}.`
        : `O modelo ${fields.model} não está disponível no ${provider}.`
    case 'quota_exhausted':
      return fields.account === undefined
        ? `A conta do ${provider} chegou ao limite.`
        : `A conta ${fields.account} do ${provider} chegou ao limite.`
    case 'budget_exhausted':
      return 'O orçamento deste mês acabou.'
    case 'provider_unreachable':
      return `Não consegui falar com o ${provider} agora.`
    case 'engine_unavailable':
      return 'O motor não está disponível neste computador.'
    case 'app_offline':
      return 'A equipe está fora do ar.'
    default: {
      const exhausted: never = fields.code
      return exhausted
    }
  }
}

/**
 * Resolve/start failure the UI can show as-is. Emits the RUN-ERRORS payload.
 */
export class RunnerResolveError extends Error implements RunErrorFields {
  readonly code: RunnerResolveErrorCode
  readonly provider?: string
  readonly command?: string
  readonly resetAt?: string
  readonly model?: string
  readonly account?: string
  readonly loginHint?: string

  /**
   * @param code - Stable machine code.
   * @param detail - CLI / provider / model id; never a secret.
   * @param extra - Optional quota/model fields.
   */
  constructor(
    code: RunnerResolveErrorCode,
    detail: string,
    extra: { resetAt?: string; account?: string; model?: string } = {},
  ) {
    const provider = providerLabel(detail)
    const account = extra.account ?? (detail.includes(':') ? detail.split(':')[1] : undefined)
    const model = extra.model
    const command = code === 'not_logged_in' ? loginCommandFor(detail) : undefined
    const fields: RunErrorFields = {
      code,
      provider,
      ...(command === undefined ? {} : { command }),
      ...(extra.resetAt === undefined ? {} : { resetAt: extra.resetAt }),
      ...(model === undefined ? {} : { model }),
      ...(account === undefined ? {} : { account }),
    }
    super(reserveMessage(fields))
    this.name = 'RunnerResolveError'
    this.code = code
    this.provider = provider
    if (command !== undefined) this.command = command
    if (extra.resetAt !== undefined) this.resetAt = extra.resetAt
    if (model !== undefined) this.model = model
    if (account !== undefined) this.account = account
    if (code === 'not_logged_in') this.loginHint = loginHintFor(detail)
  }

  /** Wire payload for `describeRunError` (no text). */
  toPayload(): RunErrorFields {
    return {
      code: this.code,
      ...(this.provider === undefined ? {} : { provider: this.provider }),
      ...(this.command === undefined ? {} : { command: this.command }),
      ...(this.resetAt === undefined ? {} : { resetAt: this.resetAt }),
      ...(this.model === undefined ? {} : { model: this.model }),
      ...(this.account === undefined ? {} : { account: this.account }),
    }
  }
}

/**
 * @param error - Caught value.
 * @returns true when the UI should render `error.message` without a stack.
 */
export function isRunnerResolveError(error: unknown): error is RunnerResolveError {
  return error instanceof RunnerResolveError
}

const NETWORK_MARKERS = [
  'econnrefused', 'econnreset', 'enotfound', 'etimedout', 'enetunreach',
  'fetch failed', 'network', 'socket hang up', 'certificate',
]

/**
 * Map a thrown value to a resolve error. Network failures become
 * `provider_unreachable` (RUN-ERRORS-SPEC).
 * @param error - Caught value.
 * @param provider - Runner identity for the reserve text.
 */
export function resolveCaughtError(error: unknown, provider: string): RunnerResolveError {
  if (error instanceof RunnerResolveError) return error
  const text = error instanceof Error ? `${error.message} ${error.name}` : String(error)
  const lower = text.toLowerCase()
  if (NETWORK_MARKERS.some(marker => lower.includes(marker))) {
    return new RunnerResolveError('provider_unreachable', provider)
  }
  return new RunnerResolveError('engine_unavailable', provider)
}
