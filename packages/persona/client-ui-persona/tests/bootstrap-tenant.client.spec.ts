// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrapPersonaTenant, readStoredTenant } from '../src/client/remote/bootstrap-tenant.ts'
import type { TenantBootstrapRemote } from '../src/client/remote/bootstrap-tenant.ts'

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })

function wireHost(options: { projectsEmptyFirst?: boolean } = {}): TenantBootstrapRemote {
  let workspaceExists = false
  let listProjectsCalls = 0
  const host = {
    listProjects: () => {
      listProjectsCalls += 1
      if (options.projectsEmptyFirst === true && listProjectsCalls === 1) {
        return Promise.resolve(ok([]))
      }
      return Promise.resolve(ok(workspaceExists ? [{ id: 'proj-pessoal' }] : []))
    },
    createWorkspace: () => {
      if (workspaceExists) {
        return Promise.resolve({ ok: false, error: { code: 'conflict', message: 'UNIQUE' } })
      }
      workspaceExists = true
      return Promise.resolve(ok({ id: 'ws-persona-local' }))
    },
    createMember: (request: { id: string }) => Promise.resolve(ok(request)),
    listChannels: () => Promise.resolve(ok([{ id: 'geral', name: 'geral' }])),
    createChannel: (request: { id: string }) => Promise.resolve(ok({ id: request.id })),
    getOnboarding: () => Promise.resolve(ok({ firstUse: false, personalProjectId: 'proj-pessoal' })),
  }
  return host as unknown as TenantBootstrapRemote
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('bootstrapPersonaTenant', () => {
  it('unwraps RemoteResult once and resolves tenant on repeat bootstrap (createWorkspace conflict)', async () => {
    const wire = wireHost({ projectsEmptyFirst: true })
    const first = await bootstrapPersonaTenant(wire)
    expect(first.channelId).toBe('geral')
    const second = await bootstrapPersonaTenant(wire)
    expect(second).toEqual(first)
    expect(readStoredTenant()?.workspaceId).toBe('ws-persona-local')
  })
})
