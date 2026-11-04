/** Editable persona draft for preview (matches SCOPE §1). */

import type { GestorLimitsValue } from '../primitives/Gestor.tsx'
import { DEFAULT_GESTOR_LIMITS_UI } from './gestor-editor-map.ts'

export type ToolAccessLevel = 'none' | 'read' | 'write'

export type AvatarSource = 'gallery' | 'upload' | 'silhouette'

/** PROACTIVITY §4 autonomy tiers (UI → host policy later). */
export type AutonomyLevel = 'on-request' | 'propose' | 'act-within-limits'

export type AttentionBudgetTier = 'quiet' | 'balanced' | 'active'

export interface PersonaDraft {
  readonly name: string
  readonly avatarSource: AvatarSource
  /** Gallery animal id (AVATAR_96 key, e.g. 'capivara') when avatarSource is 'gallery'. */
  readonly avatarRef?: string
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
  readonly autonomyLevel: AutonomyLevel
  readonly attentionBudget: AttentionBudgetTier
  readonly coordination: boolean
  readonly watchdog: boolean
  /** Gestor de equipe (`team_manager` on the wire). */
  readonly teamManager: boolean
  readonly gestorLimits: GestorLimitsValue
  /** Governance (GOV-8): sector id from workspace catalogue. */
  readonly sectorId: string
  /** Workspace member id of the human caretaker. */
  readonly responsibleMemberId: string
  /** Optional backup member id; empty string = none. */
  readonly substituteMemberId: string
}

export const MOCK_PERSONA_DRAFT: PersonaDraft = {
  name: 'Luna',
  avatarSource: 'gallery',
  avatarRef: 'luna',
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
  autonomyLevel: 'propose',
  attentionBudget: 'balanced',
  coordination: false,
  watchdog: false,
  teamManager: false,
  gestorLimits: DEFAULT_GESTOR_LIMITS_UI,
  sectorId: 'operacoes',
  responsibleMemberId: '',
  substituteMemberId: '',
}
