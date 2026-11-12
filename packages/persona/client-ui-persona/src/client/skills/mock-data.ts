/** Skill read-model (E2); host RPC will replace mock source. */
export interface SkillRecord {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly status: 'active' | 'candidate'
  readonly rating?: number
  readonly sharedWithTeam: boolean
  readonly proposer?: string
  /**
   * How it was made. `taught` (id `taught-…`, from "Ensinar a persona"): activate / back-to-candidate / share here. `learned` (id `learned-…`, offered by the Playbook
   * as "Virar skill?"): decided in Aprovações, then back-to-candidate / share here (P1-11).
   */
  readonly origin?: 'taught' | 'learned'
}

export const MOCK_SKILLS: readonly SkillRecord[] = [
  { id: 'sk1', name: 'Revisão de PR', version: 3, status: 'active', rating: 4.8, sharedWithTeam: true },
  { id: 'sk2', name: 'E-mail para cliente', version: 1, status: 'candidate', proposer: 'Sol', sharedWithTeam: false },
]
