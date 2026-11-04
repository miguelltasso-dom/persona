/**
 * Central map from runner/model ids to human labels (Atlas: never show "dsh · default").
 * Used by the persona card, profile, editor and anywhere an engine is named.
 */

const RUNNER_LABELS: Readonly<Record<string, string>> = {
  'dsh': 'Harness DeepSeek',
  'deepseek': 'Harness DeepSeek',
  'claude': 'Claude',
  'oar:claude': 'Claude',
  'claude-code': 'Claude',
  'codex': 'Codex',
  'oar:codex': 'Codex',
  'cursor': 'Cursor',
  'oar:cursor': 'Cursor',
  'opencode': 'OpenCode',
  'oar:opencode': 'OpenCode',
  'gemini': 'Gemini',
}

const MODEL_LABELS: Readonly<Record<string, string>> = {
  'default': 'modelo padrão',
  'auto': 'modelo padrão',
  'claude-sonnet': 'Sonnet',
  'sonnet': 'Sonnet',
  'claude-haiku': 'Haiku',
  'haiku': 'Haiku',
  'claude-opus': 'Opus',
  'opus': 'Opus',
  'composer': 'Composer',
  'deepseek-chat': 'DeepSeek V3',
  'deepseek-reasoner': 'DeepSeek R1',
}

/** Already human ("Plano do Claude", "GPT-5.5")? Then keep it as written. */
function looksHuman(text: string): boolean {
  return /[A-Z\s]/u.test(text.trim())
}

function titleCase(id: string): string {
  return id
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map(part => (/^gpt$/iu.test(part) ? 'GPT' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
    .replace(/^GPT (\d)/u, 'GPT-$1')
}

/** "Harness DeepSeek", "Claude", … — unknown runners are title-cased, never shown raw. */
export function runnerLabel(runner: string): string {
  const key = runner.trim().toLowerCase()
  return RUNNER_LABELS[key] ?? (looksHuman(runner) ? runner.trim() : titleCase(key.replace(/^oar:/u, '')))
}

/** "modelo padrão", "Haiku", "GPT-5.5" … */
export function modelLabel(model: string): string {
  const key = model.trim().toLowerCase()
  const known = MODEL_LABELS[key]
  if (known !== undefined) return known
  if (looksHuman(model)) return model.trim()
  const claude = /^claude-(sonnet|haiku|opus)/u.exec(key)
  if (claude?.[1] !== undefined) return MODEL_LABELS[claude[1]] ?? titleCase(claude[1])
  return titleCase(key)
}

/** "Claude · Haiku", "Harness DeepSeek · modelo padrão". */
export function engineLabel(runner: string, model?: string  ): string {
  const runnerText = runnerLabel(runner)
  return model === undefined || model.trim().length === 0 ? runnerText : `${runnerText} · ${modelLabel(model)}`
}

/** Humanizes an already-joined "runner · model" string (host labels that may still be raw ids). */
export function humanizeEngineLabel(label: string): string {
  const [runner, ...rest] = label.split(' · ')
  if (runner === undefined) return label
  return engineLabel(runner, rest.length > 0 ? rest.join(' · ') : undefined)
}
