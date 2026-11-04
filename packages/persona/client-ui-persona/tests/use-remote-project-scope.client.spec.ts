import { describe, expect, it } from 'vitest'
import { readRemoteTenantGate } from '../src/client/data/use-remote-tenant-gate.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'

describe('readRemoteTenantGate + PB-5 override', () => {
  it('uses tenant project when no workspace override is set', () => {
    const tenant: PersonaTenantSnapshot = {
      status: 'ready',
      scope: { workspaceId: 'ws', projectId: 'default-proj', actorId: 'm' },
    }
    expect(readRemoteTenantGate(tenant)).toEqual({
      workspaceId: 'ws',
      projectId: 'default-proj',
    })
  })
})
