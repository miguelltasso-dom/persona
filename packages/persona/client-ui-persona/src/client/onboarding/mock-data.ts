/** Mock harness detection for onboarding preview. */

export interface HarnessRow {
  readonly id: string
  readonly label: string
  readonly ready: boolean
}

export const MOCK_HARNESSES: readonly HarnessRow[] = [
  { id: 'claude', label: 'Claude Code', ready: true },
  { id: 'codex', label: 'Codex', ready: true },
  { id: 'cursor', label: 'Cursor agent', ready: false },
  { id: 'opencode', label: 'OpenCode', ready: false },
]

export type TeamTemplateId = 'equipeAnimais' | 'startup' | 'agencia' | 'emBranco'

export interface MockPersonaDraft {
  readonly name: string
  readonly role: string
}

export const MOCK_TEMPLATE_ROSTER: Readonly<Record<TeamTemplateId, readonly MockPersonaDraft[]>> = {
  equipeAnimais: [
    { name: 'Atlas', role: 'Coordenação' },
    { name: 'Bento', role: 'Desenvolvimento' },
    { name: 'Nina', role: 'Pesquisa' },
  ],
  startup: [
    { name: 'Lead', role: 'Produto' },
    { name: 'Dev', role: 'Engenharia' },
  ],
  agencia: [
    { name: 'Conta', role: 'Atendimento' },
    { name: 'Criação', role: 'Conteúdo' },
  ],
  emBranco: [],
}

export const MOCK_INTRO_LINES: readonly { readonly speaker: string; readonly text: string }[] = [
  { speaker: 'Atlas', text: 'Olá! Coordeno o time e respondo no #geral quando você precisar.' },
  { speaker: 'Bento', text: 'Cuido de código e integrações — me marque com @Bento.' },
  { speaker: 'Nina', text: 'Pesquiso contexto e preparo briefings antes das tarefas.' },
]
