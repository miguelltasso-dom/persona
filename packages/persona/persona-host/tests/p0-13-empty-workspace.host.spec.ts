import { createServer, type Server } from 'node:net'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Era RED do Gauge (Carbon P0-13, follow-up; P1), consertado pelo Tally. Antes: `createWorkspace` has NO access check, and `requireWorkspace/requireProject/requireWrite` return early for a workspace WITHOUT members. So any caller
 * (a guest, a persona) mints an empty workspace and every ACL check in it is void: ~170 Remotes run with no actor, among them the ones that reach OUT of the workspace (the machine's network).
 * Reproduced by: guest session -> createWorkspace -> testEmailConnection({host: 127.0.0.1, port}) -> the host opens a TCP connection to an address the guest picked.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
}

async function refusal(attempt: () => unknown): Promise<string> {
  try {
    const call = Promise.resolve(attempt())
    call.catch(() => undefined)
    const late = Symbol('late')
    const winner = await Promise.race([call, new Promise<symbol>((resolve) => { setTimeout(() => { resolve(late) }, 2500) })])
    return winner === late ? 'ran (did not settle)' : 'ran'
  } catch (error) {
    return error instanceof Error ? error.message : 'error'
  }
}

it('P0-13b: a guest cannot mint a workspace of its own once the product has an owner (createWorkspace is gated)', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'gus'
  expect(await refusal(() => h.createWorkspace({ id: 'w2', name: 'Meu', personalProjectId: 'p2' }))).toBe('forbidden')
})

it('P0-13b: in a workspace WITHOUT members a guest of another workspace cannot make the host connect to an address it picks (testEmailConnection)', async () => {
  const h = host()
  seed(h)
  h.product.createWorkspace({ id: 'w2', name: 'Vazio', personalProjectId: 'p2' }) // the empty workspace (whoever made it)
  let connections = 0
  const server: Server = createServer((socket) => { connections += 1; socket.destroy() })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('sem porta')
  try {
    h.sessionMemberId = 'gus'
    const result = await refusal(() => h.testEmailConnection({ workspaceId: 'w2', projectId: 'p2', host: '127.0.0.1', port: address.port, secure: false, user: 'x', password: 'y' }))
    await new Promise<void>((resolve) => { setTimeout(resolve, 300) })
    expect(connections, 'the host opened a TCP connection to an address chosen by a guest').toBe(0)
    expect(result).toBe('forbidden')
  } finally {
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

it('P0-13b: in a workspace WITHOUT members, a session of another workspace is refused on writes and exports (no early return)', async () => {
  const h = host()
  seed(h)
  h.product.createWorkspace({ id: 'w2', name: 'Vazio', personalProjectId: 'p2' })
  const W2 = { workspaceId: 'w2', projectId: 'p2' } as const
  h.sessionMemberId = 'gus'
  const attempts: ReadonlyArray<readonly [string, () => unknown]> = [
    ['exportWorkspace', () => h.exportWorkspace({ workspaceId: 'w2' } as never)],
    ['exportProject', () => h.exportProject({ ...W2 } as never)],
    ['pauseTeam', () => h.pauseTeam({ ...W2 })],
    ['forgetPlaybook', () => h.forgetPlaybook({ ...W2, id: 'n1' })],
    ['setProjectLimits', () => h.setProjectLimits({ ...W2 } as never)],
    ['putRetentionPolicy', () => h.putRetentionPolicy({ ...W2 } as never)],
  ]
  const ran: string[] = []
  for (const [name, attempt] of attempts) if ((await refusal(attempt)) !== 'forbidden') ran.push(name)
  expect(ran, 'these ran for a stranger').toEqual([])
})
