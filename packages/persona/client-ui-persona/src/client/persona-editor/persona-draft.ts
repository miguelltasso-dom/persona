/** Editable persona draft for preview (matches SCOPE §1). */

export type ToolAccessLevel = 'none' | 'read' | 'write'

export type AvatarSource = 'gallery' | 'upload' | 'silhouette'

export interface PersonaDraft {
  readonly name: string
  readonly avatarSource: AvatarSource
  readonly jobTitle: string
  readonly jobDescription: string
  readonly personality: string
  readonly instructions: string
  readonly harness: string
  readonly model: string
  readonly filesystem: ToolAccessLevel
  readonly shell: ToolAccessLevel
  readonly web: ToolAccessLevel
  readonly skills: string
  readonly tokenLimit: string
  readonly responseLimit: string
  readonly concurrency: string
  readonly coordination: boolean
  readonly watchdog: boolean
}

export const MOCK_PERSONA_DRAFT: PersonaDraft = {
  name: 'Luna',
  avatarSource: 'gallery',
  jobTitle: 'Analista de conteúdo',
  jobDescription: 'Planeja posts, revisa tom de voz e propõe melhorias no Cofre.',
  personality: 'Curiosa, direta e gentil em português do Brasil.',
  instructions: 'Sempre cite o Cofre quando uma restrição existir.',
  harness: 'oar:claude',
  model: 'claude-sonnet',
  filesystem: 'read',
  shell: 'none',
  web: 'read',
  skills: 'persona-copy-review',
  tokenLimit: '500000',
  responseLimit: '8192',
  concurrency: '2',
  coordination: false,
  watchdog: false,
}
