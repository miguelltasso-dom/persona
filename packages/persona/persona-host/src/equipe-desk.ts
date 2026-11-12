/**
 * Item 22 (H22): the door to ARRANGE the layout — the equipes the person assembles, the categories that group channels, where a channel sits and "Pôr no canal".
 * The channel directory (the port the routing and the sidebar read) stays read-only; this is the separate, later door its header promised. Owner only (the host
 * checks that BEFORE calling here). Nothing here wakes a persona and nothing changes the fence: who answers in a channel is still the channel's members.
 */

import {
  EQUIPE_NAME_MAX,
  StoreError,
  cleanEquipeName,
  type CategoryRepos,
  type ChannelCategory,
  type ChannelRepos,
  type Equipe,
  type EquipeRepos,
} from '@deepseek-ai/dsh-persona-store'

/** A refusal with a stable code and the sentence the screen shows. */
export class EquipeDeskError extends Error {
  readonly code: 'duplicate-name' | 'invalid-name' | 'not-found' | 'not-editable' | 'other-project'
  constructor(code: EquipeDeskError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/** An equipe as the screen reads it. */
export interface EquipeView {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly color?: string
  readonly icon?: string
  /** It mirrors an organogram sector: its members come from the organogram and are not edited here. */
  readonly mirrorsSector: boolean
  readonly personaIds: readonly string[]
  readonly archived: boolean
}

export interface ChannelCategoryView {
  readonly id: string
  readonly name: string
  readonly position: number
}

/** One arrangement the owner asks for (a single Remote carries them all: the owner gate is in one place, and the answer is the new layout). */
export type ArrangeAction =
  | { readonly kind: 'createEquipe'; readonly name: string; readonly personaIds?: readonly string[]; readonly color?: string; readonly icon?: string }
  | { readonly kind: 'updateEquipe'; readonly id: string; readonly name?: string; readonly personaIds?: readonly string[]; readonly archived?: boolean }
  | { readonly kind: 'createCategory'; readonly name: string }
  | { readonly kind: 'updateCategory'; readonly id: string; readonly name: string }
  | { readonly kind: 'reorderCategories'; readonly orderedIds: readonly string[] }
  | { readonly kind: 'removeCategory'; readonly id: string }
  | { readonly kind: 'moveChannel'; readonly channelId: string; readonly categoryId?: string; readonly position?: number }
  | { readonly kind: 'addPersonaToChannel'; readonly channelId: string; readonly personaId: string }

export interface ArrangeChannelsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly action: ArrangeAction
}

/** The equipes and the categories of a project, as the screen reads them. */
export interface EquipeLayoutView {
  readonly equipes: readonly EquipeView[]
  readonly categories: readonly ChannelCategoryView[]
}

export interface EquipeDeskDeps {
  readonly equipes: EquipeRepos
  readonly categories: CategoryRepos
  readonly channels: ChannelRepos
  /** The organogram's sector names of the project: an equipe of the person never takes one (`@Marketing` would call two things). */
  readonly sectorNames: (projectId: string) => readonly string[]
  /** Whether the persona is on the project's roster. */
  readonly hasPersona: (projectId: string, personaId: string) => boolean
  readonly newId: () => string
}

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').trim().toLocaleLowerCase('pt-BR')

const SENTENCES = {
  'name-length': `O nome precisa ter de 1 a ${String(EQUIPE_NAME_MAX)} letras.`,
  'name-chars': 'O nome não pode ter @ nem quebra de linha.',
  'name-reserved': 'Esse nome já tem outro sentido: @equipe chama a equipe do canal. Escolha outro.',
  'duplicate-name': 'Já existe uma equipe, setor ou categoria com esse nome. Escolha outro.',
} as const

/** The Remote fault a refusal travels as (Typert ships only a RemoteFault with its code and sentence; a plain Error would become gateway/internal). */
export const FAULT_OF = {
  'duplicate-name': 'conflict',
  'invalid-name': 'invalid-payload',
  'not-found': 'not-found',
  'not-editable': 'forbidden',
  'other-project': 'not-found',
} as const satisfies Readonly<Record<EquipeDeskError['code'], string>>

export class EquipeDesk {
  private readonly deps: EquipeDeskDeps

  constructor(deps: EquipeDeskDeps) {
    this.deps = deps
  }

  /** @param projectId - Tenant project. @returns The equipes of the person (mirrors of sectors included), in screen order. */
  listEquipes(projectId: string): EquipeView[] {
    return this.deps.equipes.list(projectId, true).map(viewOfEquipe)
  }

  /** @param projectId - Tenant project. @returns The categories in screen order. */
  listCategories(projectId: string): ChannelCategoryView[] {
    return this.deps.categories.list(projectId).map(viewOfCategory)
  }

  createEquipe(input: { readonly workspaceId: string; readonly projectId: string; readonly name: string; readonly personaIds?: readonly string[]; readonly color?: string; readonly icon?: string }): EquipeView {
    this.assertFreeName(input.projectId, input.name)
    const personaIds = (input.personaIds ?? []).filter(id => this.deps.hasPersona(input.projectId, id))
    return viewOfEquipe(this.wrap(() => this.deps.equipes.create({
      id: this.deps.newId(), workspaceId: input.workspaceId, projectId: input.projectId, name: input.name, personaIds,
      ...(input.color === undefined ? {} : { color: input.color }), ...(input.icon === undefined ? {} : { icon: input.icon }),
    })))
  }

  updateEquipe(input: { readonly projectId: string; readonly id: string; readonly name?: string; readonly personaIds?: readonly string[]; readonly archived?: boolean }): EquipeView {
    const current = this.ownEquipe(input.projectId, input.id)
    if (input.name !== undefined && fold(input.name) !== fold(current.name)) this.assertFreeName(input.projectId, input.name, current.id)
    this.wrap(() => {
      if (input.name !== undefined) this.deps.equipes.rename(current.id, input.name)
      if (input.personaIds !== undefined) this.deps.equipes.setMembers(current.id, input.personaIds.filter(id => this.deps.hasPersona(input.projectId, id)))
      if (input.archived === true) this.deps.equipes.archive(current.id)
      if (input.archived === false) this.deps.equipes.unarchive(current.id)
    })
    return viewOfEquipe(this.deps.equipes.get(current.id) as Equipe)
  }

  createCategory(input: { readonly workspaceId: string; readonly projectId: string; readonly name: string }): ChannelCategoryView {
    this.assertFreeName(input.projectId, input.name)
    return viewOfCategory(this.wrap(() => this.deps.categories.create({ id: this.deps.newId(), workspaceId: input.workspaceId, projectId: input.projectId, name: input.name })))
  }

  updateCategory(input: { readonly projectId: string; readonly id: string; readonly name: string }): ChannelCategoryView {
    const current = this.ownCategory(input.projectId, input.id)
    if (fold(input.name) !== fold(current.name)) this.assertFreeName(input.projectId, input.name, current.id)
    return viewOfCategory(this.wrap(() => this.deps.categories.rename(current.id, input.name)))
  }

  reorderCategories(input: { readonly projectId: string; readonly orderedIds: readonly string[] }): ChannelCategoryView[] {
    return this.deps.categories.reorder(input.projectId, input.orderedIds.filter(id => this.deps.categories.get(id)?.projectId === input.projectId)).map(viewOfCategory)
  }

  /** @returns Whether there was one. Its channels go back to "no category"; none is deleted. */
  removeCategory(input: { readonly projectId: string; readonly id: string }): boolean {
    this.ownCategory(input.projectId, input.id)
    return this.deps.categories.remove(input.id)
  }

  /** Where a channel sits. A channel or category of ANOTHER project is `not-found` (the tenant fence). */
  moveChannel(input: { readonly projectId: string; readonly channelId: string; readonly categoryId?: string; readonly position?: number }): void {
    const channel = this.deps.channels.get(input.channelId)
    if (channel === undefined || channel.projectId !== input.projectId) throw new EquipeDeskError('not-found', 'Não achei esse canal.')
    if (input.categoryId !== undefined) this.ownCategory(input.projectId, input.categoryId)
    this.wrap(() => { this.deps.categories.placeChannel(input.channelId, input.categoryId, input.position) })
  }

  /** "Pôr no canal": only a channel the person made (`custom`); the members of #geral, a team channel and #diretoria come from the organogram. Idempotent. */
  addPersonaToChannel(input: { readonly projectId: string; readonly channelId: string; readonly personaId: string }): readonly string[] {
    const channel = this.deps.channels.get(input.channelId)
    if (channel === undefined || channel.projectId !== input.projectId) throw new EquipeDeskError('not-found', 'Não achei esse canal.')
    if (channel.kind !== 'custom') throw new EquipeDeskError('not-editable', 'Quem está neste canal vem da equipe e do organograma. Mude por lá.')
    if (!this.deps.hasPersona(input.projectId, input.personaId)) throw new EquipeDeskError('not-found', 'Não achei essa pessoa da equipe.')
    const members = this.deps.channels.members(channel.id)
    if (!members.some(member => member.kind === 'persona' && member.id === input.personaId)) {
      this.deps.channels.setMembers(channel.id, [...members, { kind: 'persona', id: input.personaId }])
    }
    return this.deps.channels.members(channel.id).filter(member => member.kind === 'persona').map(member => member.id)
  }

  /** @param projectId - Tenant project. @returns The equipes and categories, in screen order. */
  layout(projectId: string): EquipeLayoutView {
    return { equipes: this.listEquipes(projectId), categories: this.listCategories(projectId) }
  }

  /**
   * Do ONE arrangement and answer the new layout. The caller has already checked the owner and the project.
   * @param request - Scope and the action.
   * @throws EquipeDeskError with the sentence the screen shows.
   */
  arrange(request: ArrangeChannelsRequest): EquipeLayoutView {
    const { workspaceId, projectId, action } = request
    switch (action.kind) {
      case 'createEquipe': this.createEquipe({ workspaceId, projectId, ...action }); break
      case 'updateEquipe': this.updateEquipe({ projectId, ...action }); break
      case 'createCategory': this.createCategory({ workspaceId, projectId, name: action.name }); break
      case 'updateCategory': this.updateCategory({ projectId, id: action.id, name: action.name }); break
      case 'reorderCategories': this.reorderCategories({ projectId, orderedIds: action.orderedIds }); break
      case 'removeCategory': this.removeCategory({ projectId, id: action.id }); break
      case 'moveChannel': this.moveChannel({ projectId, channelId: action.channelId, ...(action.categoryId === undefined ? {} : { categoryId: action.categoryId }), ...(action.position === undefined ? {} : { position: action.position }) }); break
      case 'addPersonaToChannel': this.addPersonaToChannel({ projectId, channelId: action.channelId, personaId: action.personaId }); break
    }
    return this.layout(projectId)
  }

  private assertFreeName(projectId: string, raw: string, exceptId?: string): void {
    let name: string
    try { name = cleanEquipeName(raw) } catch (error: unknown) { throw this.refusal(error) }
    const wanted = fold(name)
    const taken = this.deps.sectorNames(projectId).some(sector => fold(sector) === wanted)
      || this.deps.equipes.list(projectId, true).some(item => item.id !== exceptId && fold(item.name) === wanted && item.sourceId === undefined)
      || this.deps.categories.list(projectId).some(item => item.id !== exceptId && fold(item.name) === wanted)
    if (taken) throw new EquipeDeskError('duplicate-name', SENTENCES['duplicate-name'])
  }

  private ownEquipe(projectId: string, id: string): Equipe {
    const found = this.deps.equipes.get(id)
    if (found === undefined || found.projectId !== projectId) throw new EquipeDeskError('not-found', 'Não achei essa equipe.')
    if (found.sourceId !== undefined) throw new EquipeDeskError('not-editable', 'Esta equipe é um setor do organograma. Mude por lá.')
    return found
  }

  private ownCategory(projectId: string, id: string): ChannelCategory {
    const found = this.deps.categories.get(id)
    if (found === undefined || found.projectId !== projectId) throw new EquipeDeskError('not-found', 'Não achei essa categoria.')
    return found
  }

  private wrap<T>(work: () => T): T {
    try { return work() } catch (error: unknown) { throw this.refusal(error) }
  }

  private refusal(error: unknown): Error {
    if (error instanceof StoreError) {
      if (error.code === 'conflict') return new EquipeDeskError('duplicate-name', SENTENCES['duplicate-name'])
      if (error.code === 'invalid-input') {
        const key = error.detail !== undefined && error.detail in SENTENCES ? (error.detail as keyof typeof SENTENCES) : 'name-length'
        return new EquipeDeskError('invalid-name', SENTENCES[key])
      }
      if (error.code === 'not-found') return new EquipeDeskError('not-found', 'Não achei isso.')
      if (error.code === 'forbidden') return new EquipeDeskError(error.detail === 'other-project' ? 'other-project' : 'not-editable', 'Isso não dá para mudar por aqui.')
    }
    return error instanceof Error ? error : new Error('equipe-desk')
  }
}

function viewOfEquipe(equipe: Equipe): EquipeView {
  return {
    id: equipe.id,
    name: equipe.name,
    position: equipe.position,
    ...(equipe.color === undefined ? {} : { color: equipe.color }),
    ...(equipe.icon === undefined ? {} : { icon: equipe.icon }),
    mirrorsSector: equipe.sourceId !== undefined,
    personaIds: equipe.personaIds,
    archived: equipe.archivedAt !== undefined,
  }
}

function viewOfCategory(category: ChannelCategory): ChannelCategoryView {
  return { id: category.id, name: category.name, position: category.position }
}
