/** Skill read-model (E2); host RPC will replace mock source. */
export interface SkillRecord {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly status: 'active' | 'candidate'
  readonly rating?: number
  readonly sharedWithTeam: boolean
  readonly proposer?: string
}

export const MOCK_SKILLS: readonly SkillRecord[] = [
  { id: 'sk1', name: 'Revisão de PR', version: 3, status: 'active', rating: 4.8, sharedWithTeam: true },
  { id: 'sk2', name: 'E-mail para cliente', version: 1, status: 'candidate', proposer: 'Sol', sharedWithTeam: false },
]
