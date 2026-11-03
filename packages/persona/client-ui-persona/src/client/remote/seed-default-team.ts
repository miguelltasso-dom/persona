import type { PersonaTenantScope } from './persona-remote-types.ts'

/** Suggested roster aligned with persona-core `suggested-animals` (gallery refs for Brush assets). */
export const DEFAULT_SUGGESTED_PERSONAS = [
  {
    id: 'persona-atlas',
    name: 'Atlas',
    title: 'Coordenação',
    avatarRef: 'atlas',
    systemRoles: ['coordination'] as const,
    canRecruit: true,
  },
  {
    id: 'persona-bento',
    name: 'Bento',
    title: 'Engenharia',
    avatarRef: 'bento',
    systemRoles: [] as const,
    canRecruit: false,
  },
  {
    id: 'persona-nina',
    name: 'Nina',
    title: 'Exploração',
    avatarRef: 'nina',
    systemRoles: [] as const,
    canRecruit: false,
  },
  {
    id: 'persona-sol',
    name: 'Sol',
    title: 'Relacionamento',
    avatarRef: 'sol',
    systemRoles: [] as const,
    canRecruit: false,
  },
  {
    id: 'persona-luna',
    name: 'Luna',
    title: 'Vigia',
    avatarRef: 'luna',
    systemRoles: ['watchdog'] as const,
    canRecruit: false,
  },
] as const

/** Map display name from onboarding builder to gallery avatar ref. */
export function avatarRefForPersonaName(name: string): string {
  const lower = name.trim().toLowerCase()
  if (lower.includes('atlas')) return 'atlas'
  if (lower.includes('bento')) return 'bento'
  if (lower.includes('nina')) return 'nina'
  if (lower.includes('sol')) return 'sol'
  if (lower.includes('luna')) return 'luna'
  return lower.replace(/[^a-z0-9]+/gu, '-').slice(0, 32) || 'atlas'
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
    systemRoles?: readonly string[]
  }): unknown
  listTeam(request: PersonaTenantScope): { personas: readonly { id: string }[] }
}

/**
 * Ensure the five suggested personas exist when the project roster is empty (dev + skipped onboarding).
 * @param remote - mounted persona Remote.
 * @param tenant - workspace scope.
 */
export async function seedDefaultTeamIfEmpty(remote: PersonaCreatorRemote, tenant: PersonaTenantScope): Promise<boolean> {
  const team = await Promise.resolve(remote.listTeam(tenant))
  if (team.personas.length > 0) return false

  for (const persona of DEFAULT_SUGGESTED_PERSONAS) {
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
