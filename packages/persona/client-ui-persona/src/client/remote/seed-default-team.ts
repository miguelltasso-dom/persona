import type { PersonaTenantScope } from './persona-remote-types.ts'
import { readClientDevSeedEnabled } from './persona-dev-seed.ts'

/** Example gallery cards for onboarding step 4 (user picks/edits/removes; not auto-created). */
export const SUGGESTED_TEAM_GALLERY = [
  { id: 'gallery-1', name: 'Coordenador', title: 'Coordenação', avatarRef: 'atlas', systemRoles: ['coordination'] as const, canRecruit: true },
  { id: 'gallery-2', name: 'Implementador', title: 'Engenharia', avatarRef: 'bento', systemRoles: [] as const, canRecruit: false },
  { id: 'gallery-3', name: 'Explorador', title: 'Exploração', avatarRef: 'nina', systemRoles: [] as const, canRecruit: false },
  { id: 'gallery-4', name: 'Relações', title: 'Relacionamento', avatarRef: 'sol', systemRoles: [] as const, canRecruit: false },
  { id: 'gallery-5', name: 'Vigia', title: 'Observação', avatarRef: 'luna', systemRoles: ['watchdog'] as const, canRecruit: false },
] as const

/** @deprecated Use {@link SUGGESTED_TEAM_GALLERY}. */
export const DEFAULT_SUGGESTED_PERSONAS = SUGGESTED_TEAM_GALLERY

export interface OnboardingRosterPerson {
  readonly name: string
  readonly role: string
  readonly galleryRef?: string
  readonly systemRoles?: readonly ('coordination' | 'watchdog')[]
}

/** Gallery ref from draft row (explicit ref wins; else neutral slug). */
export function galleryRefForRosterPerson(person: OnboardingRosterPerson): string {
  if (person.galleryRef !== undefined && person.galleryRef.length > 0) return person.galleryRef
  const slug = person.name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
  return slug.length > 0 ? slug.slice(0, 32) : 'neutral'
}

type PersonaCreatorRemote = {
  createPersona(request: {
    workspaceId: string
    projectId: string
    id: string
    name: string
    title: string
    description: string
    personality: string
    instructions: string
    avatarKind: 'gallery'
    avatarRef: string
    runnerKind: 'dsh'
    runnerCli: string
    runnerModel: string
    canRecruit: boolean
    createdBy: string
    systemRoles?: readonly ('coordination' | 'watchdog')[]
  }): unknown
  listTeam(request: PersonaTenantScope): { personas: readonly { id: string }[] }
}

/**
 * Dev harness only (`PERSONA_DEV_SEED=1` + localStorage flag). Never call in production bootstrap.
 */
export async function seedDevTeamIfEmpty(remote: PersonaCreatorRemote, tenant: PersonaTenantScope): Promise<boolean> {
  if (!readClientDevSeedEnabled()) return false
  const team = await Promise.resolve(remote.listTeam(tenant))
  if (team.personas.length > 0) return false

  for (const persona of SUGGESTED_TEAM_GALLERY) {
    try {
      await Promise.resolve(remote.createPersona({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        id: persona.id,
        name: persona.name,
        title: persona.title,
        description: persona.title,
        personality: 'Proativo e claro.',
        instructions: 'Trabalhe até concluir; reporte com evidência.',
        avatarKind: 'gallery',
        avatarRef: persona.avatarRef,
        runnerKind: 'dsh',
        runnerCli: '',
        runnerModel: 'default',
        canRecruit: persona.canRecruit,
        createdBy: tenant.memberId,
        systemRoles: [...persona.systemRoles],
      }))
    } catch {
      /* duplicate or race */
    }
  }
  return true
}

/** @deprecated Use {@link seedDevTeamIfEmpty}. */
export const seedDefaultTeamIfEmpty = seedDevTeamIfEmpty

/** @deprecated Use {@link galleryRefForRosterPerson}. */
export function avatarRefForPersonaName(name: string): string {
  return galleryRefForRosterPerson({ name, role: '' })
}
