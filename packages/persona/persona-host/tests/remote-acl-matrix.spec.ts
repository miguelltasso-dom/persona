import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { ACL_EXCEPTIONS } from '../src/auth.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const shotsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.maestri', 'tmp', 'shots', 'remote')

const ROLES = ['owner', 'member', 'guest', 'persona'] as const
type Role = (typeof ROLES)[number]

const WRITE = /^(create|update|put|delete|post|move|accept|reject|enqueue|drop|flush|edit|propose|resolve|comment|record|set|claim|fire|confirm|issue|redeem|schedule|pause|complete|apply|import|wipe|open|plan|start|close|approve|revoke|cancel|ack|tick|backup|restore|checkpoint|draft|invite)/u

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member',
  })
  h.createMember({
    id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest',
  })
  h.createProject({
    id: 'team', workspaceId: 'ws', name: 'Time', description: '',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createDm({ id: 'secret', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord' })
}

function asRole(h: PersonaHost, role: Role): void {
  if (role === 'owner') h.sessionMemberId = 'ana'
  else if (role === 'member') h.sessionMemberId = 'bia'
  else if (role === 'guest') h.sessionMemberId = 'gus'
  else h.sessionMemberId = 'coord'
}

function outcomeOf(error: unknown): 'forbidden' | 'invalid' | 'not-found' | 'error' {
  const message = error instanceof Error ? error.message : 'error'
  if (error instanceof RemoteFault) {
    if (error.code === 'forbidden') return 'forbidden'
    if (error.code === 'not-found') return 'not-found'
    return 'invalid'
  }
  if (/forbidden|files-forbidden/u.test(message)) return 'forbidden'
  if (/not-found|workspace-not-found|project-not-found/u.test(message)) return 'not-found'
  if (/invalid-payload|payload-too-large|rate-limited/u.test(message)) return 'invalid'
  return 'error'
}

function swallow(result: unknown): void {
  if (result !== null && typeof result === 'object' && 'then' in result) {
    void Promise.resolve(result).catch(() => undefined)
  }
}

/** Carbon P0-13: how long an async Remote may take before the matrix calls it `pending` (it got past the ACL and went to work: for a persona or a guest that is a breach, like `ok`). */
const SETTLE_MS = 1500

/** Await an async Remote (a rejection is rethrown, so the caller classifies it like a sync throw); a call that does not settle in time is `pending`. */
async function settle(result: unknown): Promise<unknown> {
  if (result === null || typeof result !== 'object' || !('then' in result)) return result
  const pending = Symbol('pending')
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<symbol>((resolve) => { timer = setTimeout(() => resolve(pending), SETTLE_MS) })
  const call = Promise.resolve(result)
  call.catch(() => undefined) // a call that settles after the cap must not become an unhandled rejection
  try {
    const winner = await Promise.race([call, late])
    return winner === pending ? PENDING : winner
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const PENDING = Symbol('pending-remote')

function classifyResult(result: unknown): string {
  if (result === PENDING) return 'pending'
  if (Array.isArray(result)) return result.length === 0 ? 'empty' : 'ok'
  if (result !== null && typeof result === 'object') {
    if ('then' in result) {
      swallow(result)
      return 'async'
    }
    if (Symbol.asyncIterator in result || Symbol.iterator in result) return 'stream'
    if ('events' in result) {
      const events = Reflect.get(result, 'events')
      if (Array.isArray(events) && events.length === 0) return 'empty'
    }
  }
  if (result === undefined || result === null) return 'empty'
  return 'ok'
}

function methodOf(host: PersonaHost, name: string): ((...args: unknown[]) => unknown) | undefined {
  const value: unknown = Reflect.get(host, name)
  return typeof value === 'function' ? value as (...args: unknown[]) => unknown : undefined
}

async function callRemote(h: PersonaHost, name: string, projectId: string): Promise<string> {
  const fn = methodOf(h, name)
  if (fn === undefined) return 'missing'
  try {
    return classifyResult(await settle(fn.call(h, {
      workspaceId: 'ws', projectId, actorId: 'ana', afterSeq: 0, limit: 10,
    })))
  } catch (error) {
    const text = error instanceof Error ? error.message : 'error'
    if (text.includes('secret')) return 'leaked'
    return outcomeOf(error)
  }
}

it('ACL matrix: every remote × owner/member/guest/persona, and write fuzz', async () => {
  const h = host()
  seed(h)
  const remotes = remoteMethods(h).map(item => item.method)
  expect(remotes.length).toBeGreaterThan(40)
  const matrix: Record<string, Record<Role, string>> = {}
  for (const name of remotes) {
    matrix[name] = { owner: '', member: '', guest: '', persona: '' }
    for (const role of ROLES) {
      asRole(h, role)
      const projectId = role === 'member' ? 'team' : 'pp'
      matrix[name][role] = await callRemote(h, name, projectId)
    }
  }

  mkdirSync(shotsDir, { recursive: true })
  writeFileSync(join(shotsDir, 'acl-matrix.json'), `${JSON.stringify({ at: '2026-11-04', matrix }, null, 2)}\n`)

  for (const name of remotes) {
    if (ACL_EXCEPTIONS[name] !== undefined) continue
    expect(matrix[name]?.guest, `${name} guest leaked an id`).not.toBe('leaked')
    expect(matrix[name]?.persona, `${name} persona leaked an id`).not.toBe('leaked')
    expect(matrix[name]?.persona, `${name} persona must not inherit the owner`).not.toBe('ok')
    // Carbon P0-13: an async Remote that never settles for a persona or a guest got past the ACL and went to work: that is a breach too (it used to hide behind `async`).
    expect(matrix[name]?.persona, `${name} persona got past the ACL (async, never settled)`).not.toBe('pending')
    expect(matrix[name]?.guest, `${name} guest got past the ACL (async, never settled)`).not.toBe('pending')
  }

  expect(matrix.listProjects?.owner).toBe('ok')
  expect(matrix.listProjects?.guest).toMatch(/empty|forbidden/)
  expect(matrix.listDms?.guest).toMatch(/empty|forbidden/)
  expect(matrix.listProjects?.persona).toMatch(/empty|forbidden/)

  asRole(h, 'owner')
  const writes = remotes.filter(name => WRITE.test(name))
  expect(writes.length).toBeGreaterThan(10)
  for (const name of writes) {
    const fn = methodOf(h, name)
    if (fn === undefined) continue
    const junk = [
      { workspaceId: 1 },
      { workspaceId: 'ws', projectId: { $gt: '' } },
      { workspaceId: 'ws', projectId: 'pp', actorId: '<script>' },
    ]
    for (const payload of junk) {
      try {
        swallow(fn.call(h, payload))
      } catch (error) {
        const text = error instanceof Error ? error.message : 'error'
        expect(text, `${name} fuzz leaked`).not.toMatch(/secret/)
        expect(outcomeOf(error), `${name} fuzz ${JSON.stringify(payload)}`).toMatch(/invalid|forbidden|not-found|error/)
      }
    }
  }
})
