// DESIGN-01 onda 2 · #10: qual é "o projeto da vez" quando o lugar Projetos abre (Muse §5.1 #1): o que a pessoa escolheu agora,
// senão o último que ela usou, senão o único / o Pessoal / o primeiro. Nunca um id que não existe mais.
import { describe, expect, it } from 'vitest'
import { LAST_PROJECT_KEY, readLastProject, rememberLastProject, resolveCurrentProject } from '../src/client/kanban/current-project.ts'

const personal = { id: 'p-pessoal', name: 'Pessoal', kind: 'personal' }
const site = { id: 'p-site', name: 'Site da loja', kind: 'shared' }
const app = { id: 'p-app', name: 'App', kind: 'shared' }

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    data,
  }
}

describe('resolveCurrentProject', () => {
  it('o projeto escolhido agora (shell) vale mais que a lembrança', () => {
    expect(resolveCurrentProject({ projects: [personal, site, app], shellProjectId: 'p-app', lastUsedId: 'p-site' })).toBe('p-app')
  })

  it('sem escolha agora: o último usado', () => {
    expect(resolveCurrentProject({ projects: [personal, site, app], shellProjectId: null, lastUsedId: 'p-site' })).toBe('p-site')
  })

  it('só um projeto: é ele, sem perguntar', () => {
    expect(resolveCurrentProject({ projects: [site], shellProjectId: null, lastUsedId: null })).toBe('p-site')
  })

  it('vários e nenhuma lembrança: o Pessoal; sem Pessoal, o primeiro', () => {
    expect(resolveCurrentProject({ projects: [site, personal, app], shellProjectId: null, lastUsedId: null })).toBe('p-pessoal')
    expect(resolveCurrentProject({ projects: [site, app], shellProjectId: null, lastUsedId: null })).toBe('p-site')
  })

  it('um id que não existe mais (projeto apagado) é ignorado, na escolha e na lembrança', () => {
    expect(resolveCurrentProject({ projects: [personal, site], shellProjectId: 'p-sumiu', lastUsedId: 'p-tambem-sumiu' })).toBe('p-pessoal')
    expect(resolveCurrentProject({ projects: [personal, site], shellProjectId: 'p-sumiu', lastUsedId: 'p-site' })).toBe('p-site')
  })

  it('sem nenhum projeto: null (o lugar mostra o convite de criar o primeiro)', () => {
    expect(resolveCurrentProject({ projects: [], shellProjectId: 'p-x', lastUsedId: 'p-y' })).toBeNull()
  })
})

describe('a lembrança do último projeto', () => {
  it('grava e lê; lixo e storage bloqueado não lançam', () => {
    const storage = memoryStorage()
    rememberLastProject('p-site', storage)
    expect(storage.data.get(LAST_PROJECT_KEY)).toBe('p-site')
    expect(readLastProject(storage)).toBe('p-site')
    expect(readLastProject(memoryStorage())).toBeNull()
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readLastProject(blocked)).toBeNull()
    expect(() => { rememberLastProject('p-site', blocked) }).not.toThrow()
  })
})
