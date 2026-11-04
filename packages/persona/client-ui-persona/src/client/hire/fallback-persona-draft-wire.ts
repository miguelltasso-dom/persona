import type { PersonaDraft as WirePersonaDraft } from '@deepseek-ai/dsh-persona-host/types'

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Rascunho'
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max)
}

function runnerFromText(text: string): { runnerKind: 'dsh' | 'cli'; runnerCli: string } {
  const lower = text.toLowerCase()
  for (const cli of ['claude', 'codex', 'cursor', 'opencode'] as const) {
    if (lower.includes(cli)) return { runnerKind: 'cli', runnerCli: cli }
  }
  return { runnerKind: 'dsh', runnerCli: '' }
}

/**
 * Deterministic persona draft when `draftPersona` Remote fails (mirrors Rivet `fallbackDraft` / host `draft.ts`).
 * Client-safe: no imports from `persona-host/src` or `persona-runners`.
 * @param description - User text from the builder.
 */
export function fallbackPersonaDraftWire(description: string): WirePersonaDraft {
  const line = description.trim().split(/\r?\n/, 1)[0] ?? ''
  const name = clip(line === '' ? 'Rascunho' : line, 80)
  const runner = runnerFromText(description)
  return {
    name,
    title: clip(name, 80),
    description: clip(description.trim() === '' ? name : description.trim(), 2000),
    personality: 'Direto e claro.',
    instructions: clip(description.trim() === '' ? `Atue como ${name}.` : description.trim(), 8000),
    avatarKind: 'silhouette',
    avatarRef: 'draft',
    runnerKind: runner.runnerKind,
    runnerCli: runner.runnerCli,
    runnerModel: 'default',
    canRecruit: false,
    systemRoles: [],
  }
}
