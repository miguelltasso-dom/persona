// @vitest-environment jsdom
// CV-1 (Muse): o dev seed de 30 personas é SÓ de desenvolvimento. Este teste prova que ele nunca liga no app real:
// exige as DUAS chaves (`persona.devSeed.v1` e `persona.devSeed.team30`), é idempotente e só é chamado pelo seed de dev.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVATAR_96 } from '../src/client/assets/generated-imports.ts'
import {
  DEV_TEAM30_COUNT,
  DEV_TEAM30_KEY,
  devTeam30Roster,
  readDevTeam30Enabled,
  seedDevTeam30,
  type DevTeam30Remote,
} from '../src/client/remote/dev-seed-team30.ts'
import type { PersonaTenantScope } from '../src/client/remote/persona-remote-types.ts'

const DEV_SEED_KEY = 'persona.devSeed.v1'
const tenant = { workspaceId: 'ws', projectId: 'pr', channelId: 'ch', memberId: 'me' } as unknown as PersonaTenantScope

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function fakeRemote(existing: readonly string[] = []) {
  const ids = new Set(existing)
  const createPersona = vi.fn((request: { id: string }) => {
    if (ids.has(request.id)) throw new Error('duplicate')
    ids.add(request.id)
    return {}
  })
  const listTeam = vi.fn(() => ({ personas: [...ids].map(id => ({ id, name: id })) }))
  return { remote: { createPersona, listTeam } as unknown as DevTeam30Remote, createPersona, listTeam }
}

describe('nunca liga sem as duas chaves', () => {
  it('sem nenhuma chave (o app real): 0 e o host nem é consultado', async () => {
    const { remote, createPersona, listTeam } = fakeRemote()
    expect(readDevTeam30Enabled()).toBe(false)
    expect(await seedDevTeam30(remote, tenant)).toBe(0)
    expect(listTeam).not.toHaveBeenCalled()
    expect(createPersona).not.toHaveBeenCalled()
  })

  it('só o seed de dev em geral: não liga', async () => {
    localStorage.setItem(DEV_SEED_KEY, '1')
    const { remote, createPersona } = fakeRemote()
    expect(readDevTeam30Enabled()).toBe(false)
    expect(await seedDevTeam30(remote, tenant)).toBe(0)
    expect(createPersona).not.toHaveBeenCalled()
  })

  it('só a chave team30 (sem o seed de dev): não liga', async () => {
    localStorage.setItem(DEV_TEAM30_KEY, '1')
    const { remote, createPersona } = fakeRemote()
    expect(readDevTeam30Enabled()).toBe(false)
    expect(await seedDevTeam30(remote, tenant)).toBe(0)
    expect(createPersona).not.toHaveBeenCalled()
  })

  it('valor diferente de "1" não liga; storage bloqueado = desligado', async () => {
    localStorage.setItem(DEV_SEED_KEY, '1')
    localStorage.setItem(DEV_TEAM30_KEY, 'true')
    expect(readDevTeam30Enabled()).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError') })
    expect(readDevTeam30Enabled()).toBe(false)
  })
})

describe('com as duas chaves', () => {
  beforeEach(() => {
    localStorage.setItem(DEV_SEED_KEY, '1')
    localStorage.setItem(DEV_TEAM30_KEY, '1')
  })

  it('completa o elenco até 30 (conta as que já existem)', async () => {
    const { remote, createPersona } = fakeRemote(['gallery-atlas', 'gallery-bento', 'gallery-nina', 'gallery-sol', 'gallery-luna'])
    expect(await seedDevTeam30(remote, tenant)).toBe(25)
    expect(createPersona).toHaveBeenCalledTimes(25)
    const first = createPersona.mock.calls[0]?.[0] as unknown as Record<string, unknown>
    expect(first).toMatchObject({ workspaceId: 'ws', projectId: 'pr', id: 'dev-team30-01', createdBy: 'me', avatarKind: 'gallery', runnerKind: 'dsh', canRecruit: false })
  })

  it('é idempotente: repetir não duplica nem passa de 30', async () => {
    const { remote, createPersona } = fakeRemote()
    expect(await seedDevTeam30(remote, tenant)).toBe(DEV_TEAM30_COUNT)
    expect(await seedDevTeam30(remote, tenant)).toBe(0)
    expect(createPersona).toHaveBeenCalledTimes(DEV_TEAM30_COUNT)
  })

  it('uma criação que falha não derruba as outras', async () => {
    const { remote, createPersona } = fakeRemote()
    let calls = 0
    createPersona.mockImplementation(() => { calls += 1; if (calls === 3) throw new Error('corrida'); return {} })
    const created = await seedDevTeam30(remote, tenant)
    expect(created).toBe(DEV_TEAM30_COUNT - 1)
  })
})

describe('o elenco fixo', () => {
  it('30 pessoas: ids e nomes únicos, 6 funções de 5, retratos que existem na galeria', () => {
    const roster = devTeam30Roster()
    expect(roster).toHaveLength(30)
    expect(new Set(roster.map(p => p.id)).size).toBe(30)
    expect(new Set(roster.map(p => p.name)).size).toBe(30)
    const perRole = new Map<string, number>()
    for (const person of roster) perRole.set(person.title, (perRole.get(person.title) ?? 0) + 1)
    expect([...perRole.values()]).toEqual([5, 5, 5, 5, 5, 5])
    const portraits = AVATAR_96 as Readonly<Record<string, string>>
    for (const person of roster) expect(portraits[person.avatarRef], person.avatarRef).toBeTruthy()
  })

  it('é determinístico (o mesmo elenco em toda execução)', () => {
    expect(devTeam30Roster()).toEqual(devTeam30Roster())
  })
})
