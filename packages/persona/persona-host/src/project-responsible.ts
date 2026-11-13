/**
 * Marco Dogfood M1 (host): every project has a RESPONSIBLE persona (and optionally a person). It is one small doc in the screens KV (kind `project_responsible`, id `default`, under the project's own
 * key: no migration, and the project fence is the key), resolved honestly: the saved choice while she is still on the project, else the project's Coordination persona (`source: 'default'`), else nobody
 * (a project with no team). A responsible who left the project is `stale` (the screen says "choose again"); nothing breaks. Pure: the host hands in the KV, the personas and the workspace people.
 */

/** Kind of the screen doc that holds the choice. */
export const RESPONSIBLE_KIND = 'project_responsible'
const DOC_ID = 'default'

/** What is saved. */
export interface ResponsibleDoc {
  readonly personaId: string
  readonly humanId?: string
  readonly setBy: string
  readonly setAt: string
}

/** The part of the screens KV the book uses. */
export interface ResponsibleStore {
  get(projectId: string, kind: string, id: string): ResponsibleDoc | undefined
  put(projectId: string, kind: string, id: string, value: ResponsibleDoc): void
}

/** A persona of the project as the book needs her. */
export interface ResponsiblePersona {
  readonly id: string
  readonly name: string
  readonly title: string
  /** The project's Coordination persona (the default responsible). */
  readonly coordination: boolean
}

/** What the three screens (project header, board, Casa) read. Plain on the wire. */
export interface ProjectResponsibleView {
  readonly projectId: string
  readonly persona?: { readonly id: string; readonly name: string; readonly title: string }
  readonly human?: { readonly id: string; readonly name: string }
  /** `chosen` = the owner picked her; `default` = the Coordination persona (or nobody). */
  readonly source: 'chosen' | 'default'
  /** The saved responsible is no longer on the project: the view fell back to the default. */
  readonly stale: boolean
  /** Whether the person asking may change it (the owner): the screen offers the swap only then. Filled by the Remote, never by the book. */
  readonly canChange?: boolean
}

/** A refusal with a stable code (the Remote maps it to a typed fault with a sentence). */
export class ResponsibleError extends Error {
  readonly code: 'persona-not-in-project' | 'human-not-member'
  constructor(code: ResponsibleError['code']) {
    super(code)
    this.code = code
  }
}

export interface ProjectResponsibleDeps {
  readonly store: ResponsibleStore
  /** The personas of ONE project (the fence: a persona of another project is not in this list). */
  readonly personas: (projectId: string) => readonly ResponsiblePersona[]
  /** The display name of a workspace member, or undefined when that id is nobody of the workspace. */
  readonly humanName: (humanId: string) => string | undefined
}

export class ProjectResponsibleBook {
  private readonly deps: ProjectResponsibleDeps

  /** @param deps - The KV, the personas of a project and the workspace people. */
  constructor(deps: ProjectResponsibleDeps) {
    this.deps = deps
  }

  /**
   * @param projectId - Tenant project (checked by the caller).
   * @returns Who is responsible now, in the words the screens use.
   */
  resolve(projectId: string): ProjectResponsibleView {
    const personas = this.deps.personas(projectId)
    const saved = this.deps.store.get(projectId, RESPONSIBLE_KIND, DOC_ID)
    const chosen = saved === undefined ? undefined : personas.find(persona => persona.id === saved.personaId)
    if (saved !== undefined && chosen !== undefined) {
      const human = saved.humanId === undefined || saved.humanId === '' ? undefined : this.deps.humanName(saved.humanId)
      return {
        projectId, persona: faceOf(chosen), ...(human === undefined || saved.humanId === undefined ? {} : { human: { id: saved.humanId, name: human } }), source: 'chosen', stale: false,
      }
    }
    const fallback = personas.find(persona => persona.coordination)
    return { projectId, ...(fallback === undefined ? {} : { persona: faceOf(fallback) }), source: 'default', stale: saved !== undefined }
  }

  /**
   * Choose the responsible. Only the owner may (the Remote checks that BEFORE calling here).
   * @param projectId - Tenant project.
   * @param input - The persona (must be of THIS project) and optionally a person (`''` clears only the person).
   * @param by - Who chose.
   * @param at - When (the host's clock).
   * @returns The new view and whether anything changed (the host writes its audit line only when it did).
   */
  set(projectId: string, input: { readonly personaId: string; readonly humanId?: string }, by: string, at: string): { readonly view: ProjectResponsibleView; readonly changed: boolean } {
    if (!this.deps.personas(projectId).some(persona => persona.id === input.personaId)) throw new ResponsibleError('persona-not-in-project')
    const humanId = input.humanId ?? ''
    if (humanId !== '' && this.deps.humanName(humanId) === undefined) throw new ResponsibleError('human-not-member')
    const before = this.deps.store.get(projectId, RESPONSIBLE_KIND, DOC_ID)
    const same = before !== undefined && before.personaId === input.personaId && (before.humanId ?? '') === humanId && this.resolve(projectId).source === 'chosen'
    if (!same) this.deps.store.put(projectId, RESPONSIBLE_KIND, DOC_ID, { personaId: input.personaId, ...(humanId === '' ? {} : { humanId }), setBy: by, setAt: at })
    return { view: this.resolve(projectId), changed: !same }
  }
}

function faceOf(persona: ResponsiblePersona): { readonly id: string; readonly name: string; readonly title: string } {
  return { id: persona.id, name: persona.name, title: persona.title }
}
