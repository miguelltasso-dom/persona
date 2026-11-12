// @vitest-environment jsdom
// "Acordando o time" (COLHEITA-MUSE §30): the opening scene runs before the bundle and the host, so the shell keeps up to 5 animal ids in
// localStorage (ids only) for the next opening. `apps/desktop/renderer/persona-boot/boot.js` reads the same key.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOOT_FACES_KEY, BOOT_FACES_MAX, bootFaceIds, rememberBootFaces } from '../src/client/shell/boot-faces.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

afterEach(() => { localStorage.removeItem(BOOT_FACES_KEY) })

const persona = (id: string, avatarRef: string) => ({ id, avatarRef })

describe('bootFaceIds', () => {
  it('keeps the team order, drops repeats and stops at five', () => {
    const ids = bootFaceIds([persona('p1', 'capivara'), persona('p2', 'Lobo-Guara'), persona('p3', 'capivara'), persona('p4', 'nina'),
      persona('p5', 'tucano'), persona('p6', 'panda'), persona('p7', 'coelho')])
    expect(ids).toEqual(['capivara', 'lobo-guara', 'nina', 'tucano', 'panda'])
    expect(ids).toHaveLength(BOOT_FACES_MAX)
  })

  it('shows the same stable animal the app shows when the reference is not a gallery animal', () => {
    const [id] = bootFaceIds([persona('persona-xyz', 'neutral')])
    expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/u)
    expect(bootFaceIds([persona('persona-xyz', '')])).toEqual([id])
  })

  it('keeps only ids: nothing else of the persona reaches the list', () => {
    const [serialized] = [JSON.stringify(bootFaceIds([persona('persona-maria-padaria', 'raposa')]))]
    expect(serialized).toBe('["raposa"]')
  })
})

describe('rememberBootFaces', () => {
  it('writes the ids the next opening shows', () => {
    rememberBootFaces([persona('a', 'atlas'), persona('b', 'ourico')])
    expect(JSON.parse(localStorage.getItem(BOOT_FACES_KEY)!)).toEqual(['atlas', 'ourico'])
  })

  it('writes only when the faces change', () => {
    const setItem = vi.fn()
    const storage = { getItem: () => '["atlas"]', setItem }
    rememberBootFaces([persona('a', 'atlas')], storage)
    expect(setItem).not.toHaveBeenCalled()
    rememberBootFaces([persona('a', 'atlas'), persona('b', 'bento')], storage)
    expect(setItem).toHaveBeenCalledWith(BOOT_FACES_KEY, '["atlas","bento"]')
  })

  it('an empty team does not erase what the last session left', () => {
    localStorage.setItem(BOOT_FACES_KEY, '["tucano"]')
    rememberBootFaces([])
    expect(localStorage.getItem(BOOT_FACES_KEY)).toBe('["tucano"]')
  })

  it('blocked storage breaks nothing', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => { rememberBootFaces([persona('a', 'atlas')], blocked) }).not.toThrow()
    expect(() => { rememberBootFaces([persona('a', 'atlas')], undefined) }).not.toThrow()
  })
})

describe('the live store', () => {
  type Result = { ok: true; value: unknown }
  const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })
  let live: PersonaLiveStore | undefined
  afterEach(() => { live?.dispose(); live = undefined })

  it('remembers the faces of the loaded team for the next opening', async () => {
    const remote: Record<string, unknown> = {
      listProjects: () => ok([{ id: 'proj-pessoal' }]),
      listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
      getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
      ping: () => ok({ protocol: 1 }),
      getOverviewNow: () => ok({ personas: [] }),
      getWhileAway: () => ok({ events: [] }),
      getOverview: () => ok({ needsYou: [], inProgress: [] }),
      listTeam: () => ok({ personas: [
        { id: 'p-1', name: 'Capi', title: 'Atendimento', avatarRef: 'capivara', systemRoles: [] },
        { id: 'p-2', name: 'Lobo', title: 'Vendas', avatarRef: 'lobo-guara', systemRoles: [] },
      ], members: [] }),
      listTasks: () => ok([]),
      listMessages: () => ok({ events: [] }),
      listDms: () => ok([]),
      markVisit: () => ok(true),
      followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
      listApprovals: () => ok([]),
      listDailySummaries: () => ok([]),
    }
    live = createPersonaLiveStore(remote as never)
    await live.bootstrap(() => {})
    await vi.waitFor(() => { expect(JSON.parse(localStorage.getItem(BOOT_FACES_KEY) ?? 'null')).toEqual(['capivara', 'lobo-guara']) })
    // Names and roles never reach the opening's storage.
    expect(localStorage.getItem(BOOT_FACES_KEY)).not.toMatch(/Capi|Atendimento|Vendas/u)
  })
})
