/**
 * Honest, typed resolve failures. Messages are short pt-BR for the UI (no stack).
 */

export type RunnerResolveErrorCode =
  | 'cli_not_found'
  | 'not_logged_in'
  | 'model_unavailable'
  | 'quota_exhausted'

const MESSAGES: Record<RunnerResolveErrorCode, (detail: string) => string> = {
  cli_not_found: detail => detail === 'dsh'
    ? 'O executor DSH não está montado neste host.'
    : `CLI ${detail} não encontrada neste computador.`,
  not_logged_in: detail => `CLI ${detail} não está logada. ${loginHintFor(detail)}`,
  model_unavailable: detail => `Modelo ${detail} indisponível neste runner.`,
  quota_exhausted: detail => `Cota de ${detail} esgotada. Espere a janela resetar.`,
}

const HINTS: Record<string, string> = {
  claude: 'Abra o terminal e rode claude login',
  codex: 'Abra o terminal e rode codex login',
  opencode: 'Abra o terminal e rode opencode auth login',
  cursor: 'Abra o Cursor e faça login no Agent',
  dsh: 'Configure a chave no Cofre. Nunca cole o token na conversa.',
  ollama: 'Ollama local, sem custo.',
  lmstudio: 'LM Studio local, sem custo.',
}

/**
 * One-line login hint. Never asks for a token.
 * @param cli - Runner identity.
 */
export function loginHintFor(cli: string): string {
  return HINTS[cli] ?? 'Abra o terminal e faça login na CLI.'
}

/**
 * Resolve/start failure the UI can show as-is.
 */
export class RunnerResolveError extends Error {
  readonly code: RunnerResolveErrorCode
  readonly loginHint?: string

  /**
   * @param code - Stable machine code.
   * @param detail - CLI id or model id; never a secret.
   */
  constructor(code: RunnerResolveErrorCode, detail: string) {
    super(MESSAGES[code](detail))
    this.name = 'RunnerResolveError'
    this.code = code
    if (code === 'not_logged_in') this.loginHint = loginHintFor(detail)
  }
}

/**
 * @param error - Caught value.
 * @returns true when the UI should render `error.message` without a stack.
 */
export function isRunnerResolveError(error: unknown): error is RunnerResolveError {
  return error instanceof RunnerResolveError
}
