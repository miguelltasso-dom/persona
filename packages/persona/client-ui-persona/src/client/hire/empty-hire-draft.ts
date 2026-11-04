import type { PersonaDraft } from '../persona-editor/persona-draft.ts'
import { DEFAULT_GESTOR_LIMITS_UI } from '../persona-editor/gestor-editor-map.ts'

/** Blank hire draft: gallery animal pre-selected, no fixed coordination names (D-043). */
export function createEmptyHireDraft(avatarRef: string): PersonaDraft {
  return {
    name: '',
    avatarSource: 'gallery',
    avatarRef,
    jobTitle: '',
    jobDescription: '',
    personality: '',
    instructions: '',
    harness: 'dsh',
    model: 'default',
    filesystem: 'none',
    shell: 'none',
    web: 'none',
    skills: '',
    tokenLimit: '',
    responseLimit: '',
    concurrency: '1',
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
}
