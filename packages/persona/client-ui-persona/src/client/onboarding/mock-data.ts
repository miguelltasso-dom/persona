/** Mock harness detection for onboarding preview. */

import { SUGGESTED_TEAM_GALLERY } from '../remote/seed-default-team.ts'

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
  readonly galleryRef?: string
  readonly systemRoles?: readonly ('coordination' | 'watchdog')[]
}

/** Default cards for step 4 (user edits before confirm). */
export const GALLERY_SUGGESTED_DRAFTS: readonly MockPersonaDraft[] = SUGGESTED_TEAM_GALLERY.map(row => ({
  name: row.name,
  role: row.title,
  galleryRef: row.avatarRef,
  systemRoles: [...row.systemRoles],
}))

export const MOCK_TEMPLATE_ROSTER: Readonly<Record<TeamTemplateId, readonly MockPersonaDraft[]>> = {
  equipeAnimais: GALLERY_SUGGESTED_DRAFTS,
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
