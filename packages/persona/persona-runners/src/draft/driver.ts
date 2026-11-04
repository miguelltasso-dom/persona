/**
 * Conversational persona/team drafts (S4). Fake/scripted Runner by default.
 * Tools never exceed the creator; no coordination role is assigned.
 */

import { parseStructureAsk, recommendStructure, type StructureRecommendation } from '@deepseek-ai/dsh-persona-engine'
import type { RunEvent, Runner, StartTurnInput } from '../contract.ts'

export type DraftAvatarKind = 'gallery' | 'upload' | 'silhouette'
export type DraftRunnerKind = 'dsh' | 'cli'
export type DraftSystemRole = 'coordination' | 'watchdog'

/** Wire draft — same fields Anvil's `PersonaDraft` exposes. */
export interface PersonaDraft {
  name: string
  title: string
  description: string
  personality: string
  instructions: string
  avatarKind: DraftAvatarKind
  avatarRef: string
  runnerKind: DraftRunnerKind
  runnerCli: string
  runnerModel: string
  canRecruit: boolean
  systemRoles: readonly DraftSystemRole[]
}

export const DRAFT_PERSONA_PROMPT = [
  'Você monta um rascunho de persona a partir da descrição da pessoa.',
  'Responda APENAS com um objeto JSON nestes campos:',
  'name, title, description, personality, instructions, avatarKind, avatarRef, runnerKind, runnerCli, runnerModel.',
  'Regras: systemRoles deve ser []; canRecruit false; tools implícitas vazias (nunca mais acesso que o criador).',
  'avatarKind: gallery | upload | silhouette. runnerKind: dsh, salvo menção explícita a claude/codex/cursor/opencode.',
  'Sem coordenador no onboarding: não atribua coordination.',
].join(' ')

export interface DraftDriverOptions {
  runner: Runner
  model?: string
  cwd?: string
  now?: () => Date
}

export interface DraftDriver {
  draftPersona(description: string): Promise<PersonaDraft>
  draftTeam(description: string): Promise<PersonaDraft[]>
  recommendStructure(text: string): Promise<StructureRecommendation>
}

export const STRUCTURE_PROMPT = [
  'Você recomenda a estrutura de uma equipe Persona.',
  'Responda APENAS com um objeto JSON: company, sectorNames, recurring.',
  'company: agencia | loja_online | saas | consultoria | criador | escritorio.',
  'Uma persona por FUNÇÃO contínua, nunca por tarefa pontual.',
  'Tarefa de um dia vira Tarefa; trabalho que se repete vira rotina com dono.',
  'Comece com 3 a 5 personas.',
].join(' ')

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Rascunho'
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max)
}

function runnerFromText(text: string): { runnerKind: DraftRunnerKind; runnerCli: string } {
  const lower = text.toLowerCase()
  for (const cli of ['claude', 'codex', 'cursor', 'opencode'] as const) {
    if (lower.includes(cli)) return { runnerKind: 'cli', runnerCli: cli }
  }
  return { runnerKind: 'dsh', runnerCli: '' }
}

/**
 * Deterministic draft when the runner is silent (onboarding without a coordinator).
 * @param description - Natural-language description.
 */
export function fallbackDraft(description: string): PersonaDraft {
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

function sanitize(raw: Partial<PersonaDraft>, description: string): PersonaDraft {
  const base = fallbackDraft(description)
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? clip(raw.name, 80) : base.name
  const avatarKind = raw.avatarKind === 'gallery' || raw.avatarKind === 'upload' || raw.avatarKind === 'silhouette'
    ? raw.avatarKind
    : base.avatarKind
  const runnerKind = raw.runnerKind === 'cli' || raw.runnerKind === 'dsh' ? raw.runnerKind : base.runnerKind
  const runnerCli = runnerKind === 'cli'
    ? (typeof raw.runnerCli === 'string' ? raw.runnerCli : base.runnerCli)
    : ''
  return {
    name,
    title: typeof raw.title === 'string' && raw.title.trim() !== '' ? clip(raw.title, 80) : name,
    description: typeof raw.description === 'string' ? clip(raw.description, 2000) : base.description,
    personality: typeof raw.personality === 'string' ? clip(raw.personality, 2000) : base.personality,
    instructions: typeof raw.instructions === 'string' ? clip(raw.instructions, 8000) : base.instructions,
    avatarKind,
    avatarRef: typeof raw.avatarRef === 'string' && raw.avatarRef.trim() !== '' ? raw.avatarRef : base.avatarRef,
    runnerKind,
    runnerCli,
    runnerModel: typeof raw.runnerModel === 'string' && raw.runnerModel.trim() !== '' ? raw.runnerModel : 'default',
    canRecruit: false,
    systemRoles: [],
  }
}

function parseDraft(text: string, description: string): PersonaDraft {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return fallbackDraft(description)
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Partial<PersonaDraft>
    return sanitize(raw, description)
  } catch (error) {
    void error
    return fallbackDraft(description)
  }
}

async function collect(events: AsyncIterable<RunEvent>): Promise<string> {
  const parts: string[] = []
  for await (const event of events) {
    if (event.type === 'delta') parts.push(event.text)
    if (event.type === 'ended' && event.report.summary !== undefined) parts.push(event.report.summary)
  }
  return parts.join('')
}

/**
 * Draft personas through a Runner (fake/scripted in tests).
 * @param options - runner and turn identity.
 */
export function createDraftDriver(options: DraftDriverOptions): DraftDriver {
  const model = options.model ?? 'scripted'
  const cwd = options.cwd ?? 'C:/tmp/draft'
  const turn = async (assignmentId: string, prompt: string): Promise<string> => {
    const input: StartTurnInput = {
      ticketId: 's4-draft',
      assignmentId,
      personaId: 'draft',
      cwd,
      prompt,
      model,
      permissionMode: 'deny',
    }
    const handle = await options.runner.start(input)
    return collect(options.runner.stream(handle))
  }
  return {
    draftPersona: async (description) => {
      const text = await turn('persona', `${DRAFT_PERSONA_PROMPT}\n\n${description}`)
      return parseDraft(text, description)
    },
    draftTeam: async (description) => {
      const chunks = description.split(/\n\s*\n|\n/u).map(item => item.trim()).filter(item => item !== '')
      const parts = chunks.length === 0 ? ['Membro'] : chunks.slice(0, 8)
      const out: PersonaDraft[] = []
      for (const [index, part] of parts.entries()) {
        const text = await turn(`team-${String(index)}`, `${DRAFT_PERSONA_PROMPT}\n\n${part}`)
        out.push(parseDraft(text, part))
      }
      return out
    },
    recommendStructure: async (text) => {
      const model = await turn('structure', `${STRUCTURE_PROMPT}\n\n${text}`)
      return recommendStructure(parseAskFromModel(model, text))
    },
  }
}

function parseAskFromModel(modelText: string, fallback: string) {
  const start = modelText.indexOf('{')
  const end = modelText.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const raw = JSON.parse(modelText.slice(start, end + 1)) as {
        company?: string
        sectorNames?: string[]
        recurring?: string[]
      }
      if (typeof raw.company === 'string' && raw.company.trim() !== '') {
        const sectors = Array.isArray(raw.sectorNames) ? `setores: ${raw.sectorNames.join(', ')}` : ''
        const recurring = Array.isArray(raw.recurring) ? `rotinas: ${raw.recurring.join(', ')}` : ''
        return parseStructureAsk([raw.company, sectors, recurring].filter(item => item !== '').join('. '))
      }
    } catch (error) {
      void error
    }
  }
  return parseStructureAsk(modelText.trim() === '' ? fallback : `${fallback}\n${modelText}`)
}
