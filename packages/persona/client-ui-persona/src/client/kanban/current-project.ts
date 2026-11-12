/**
 * "O projeto da vez" do lugar Projetos (DESIGN-01-MUSE §5.1 #1): o lugar abre no quadro do último projeto usado (ou do único). As abas
 * Quadro · Arquivos · Canvas são desse projeto, e o seletor do cabeçalho troca de projeto sem sair da aba.
 */

export const LAST_PROJECT_KEY = 'persona.projects.lastProject.v1'

type ProjectStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface ProjectChoice {
  readonly id: string
  readonly name: string
  readonly kind: string
}

function defaultStorage(): ProjectStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * The project the person used last, or null (nothing remembered, or storage blocked).
 *
 * @param storage Where the choice is kept (the browser's by default).
 * @returns The remembered project id.
 */
export function readLastProject(storage: ProjectStorage | undefined = defaultStorage()): string | null {
  try {
    const saved = storage?.getItem(LAST_PROJECT_KEY)
    return saved === null || saved === undefined || saved === '' ? null : saved
  } catch {
    // Storage blocked: the place simply opens on its default project.
    return null
  }
}

/**
 * Remembers the project so the place opens on it next time.
 *
 * @param projectId The project the person just worked in.
 * @param storage Where the choice is kept (the browser's by default).
 */
export function rememberLastProject(projectId: string, storage: ProjectStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(LAST_PROJECT_KEY, projectId)
  } catch {
    // Only a comfort: without storage the place falls back to its default project.
  }
}

export interface CurrentProjectInput {
  readonly projects: readonly ProjectChoice[]
  /** The project chosen in this session (the shell's `projectWorkspaceProjectId`); null = none yet. */
  readonly shellProjectId: string | null
  /** The project used last time (see {@link readLastProject}). */
  readonly lastUsedId: string | null
}

/**
 * Picks the project the Projetos place shows: the one chosen now, else the last used, else the only one, else "Pessoal", else the first.
 * An id that no longer exists is ignored.
 *
 * @param input The projects and the two remembered choices.
 * @returns The project id, or null when there are no projects.
 */
export function resolveCurrentProject({ projects, shellProjectId, lastUsedId }: CurrentProjectInput): string | null {
  const exists = (id: string | null): id is string => id !== null && projects.some(project => project.id === id)
  if (exists(shellProjectId)) return shellProjectId
  if (exists(lastUsedId)) return lastUsedId
  return projects.find(project => project.kind === 'personal')?.id ?? projects[0]?.id ?? null
}
