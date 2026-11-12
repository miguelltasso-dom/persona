/**
 * R2-04 (RED, not run): the private DM memory (visibility `persona`, id `owner-mem-<dmEventId>`) is still reachable by id, outside `listMemory`:
 *   a) `approveMemory` / `editMemory` / `forgetMemory` (index.ts ~5024-5047, screens.ts approveMemory/editMemory/forgetMemory) take any vault record id, check only `requireProject`
 *      and return `body` (no `mayReadPrivateRecord`, no `canReadVault`);
 *   b) `compileUsedNow` (orchestration.ts ~3611) lists EVERY vault record of the project, restricted ones with `body: ''` but WITH their id, into the "contexto usado" of any message,
 *      and `listUsedContext` (index.ts ~8304) returns it to any project member: that is where the id comes from.
 *   c) with the id of the DM message (`owner-mem-` + eventId), `reactToMessage` / `pinMessage` return `viewMessage(event)` (whole body) with project-level ACL only.
 * Place in packages/persona/persona-host/tests/. Expected today: (a) FAILS; (b) FAILS if compileUsed runs in the scripted host (if not, replace by reading `h.orchestration.usedContext`).
 */
import { describe, expect } from 'vitest'
import { VAULT_TELEGRAM } from '@deepseek-ai/dsh-persona-vault'
import { CLOCK, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const MARK = 'FESTA-SURPRESA-JOAO-4821'
const P = { workspaceId: 'ws', projectId: 'sh' } as const

function rig() {
  const h = openJourney()
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.createDm({ id: 'dm-bia', ...P, participantA: 'ana', participantB: 'bia' })
  // "Lembra que ...": captured by captureOwnerMemory as a record private to Bia, id owner-mem-dm-mem
  h.postMessage({ id: 'dm-mem', ...P, streamKind: 'dm', ownerId: 'dm-bia', body: `Lembra que a festa surpresa do João será dia 12 de março, código ${MARK}.`, actorId: 'ana', subjectId: 'dm-mem', occurredAt: CLOCK })
  return h
}

describe('R2-04 the private DM memory is not readable by id', () => {
  it('control (the new check): Gus does not see it in Memória', () => {
    const h = rig()
    h.sessionMemberId = 'gus'
    expect(JSON.stringify(h.listMemory({ ...P }))).not.toContain(MARK)
  })

  it('a) Gus cannot read the body through approveMemory / editMemory / forgetMemory with the record id', () => {
    const h = rig()
    h.sessionMemberId = 'gus'
    const attempts = [
      () => h.approveMemory({ ...P, id: 'owner-mem-dm-mem', body: '', authorId: 'gus' }),
      () => h.editMemory({ ...P, id: 'owner-mem-dm-mem', body: 'x', authorId: 'gus' }),
      () => h.forgetMemory({ ...P, id: 'owner-mem-dm-mem' }),
    ]
    for (const attempt of attempts) {
      let answer: unknown
      try { answer = attempt() } catch { answer = 'refused' }
      expect(JSON.stringify(answer)).not.toContain(MARK)
    }
    // and the memory still stands (a forget by Gus must not revoke Ana's record)
    h.sessionMemberId = 'ana'
    expect(JSON.stringify(h.listMemory({ ...P }))).toContain(MARK)
  })

  it('b) the id of a record that is not Gus\'s does not travel in the "contexto usado" he reads', async () => {
    const h = rig()
    h.sessionMemberId = 'gus'
    h.postMessage({ id: 'g1', ...P, streamKind: 'channel', ownerId: 'geral:sh', body: 'Bom dia, pessoal', actorId: 'gus', subjectId: 'g1', occurredAt: CLOCK })
    for (let pass = 0; pass < 6; pass += 1) await h.orchestration.flush('sh')
    const used = h.listUsedContext({ ...P, eventId: 'g1' })
    expect(used.records.map(row => row.id)).not.toContain('owner-mem-dm-mem')
  })

  it('c) with the DM event id, a member cannot make the host return the DM line (react / pin)', () => {
    const h = rig()
    h.sessionMemberId = 'gus'
    for (const attempt of [
      () => h.reactToMessage({ ...P, eventId: 'dm-mem', stickerId: h.listStickers()[0]?.id ?? '' }),
      () => h.pinMessage({ ...P, eventId: 'dm-mem' }),
      () => h.listMessageAudit({ ...P, eventId: 'dm-mem' }),
    ]) {
      let answer: unknown
      try { answer = attempt() } catch { answer = 'refused' }
      expect(JSON.stringify(answer)).not.toContain(MARK)
    }
  })
})

// ---- R2-04b (Keel 11:13): only a memory or a rule is reachable as a MEMORY ------------------------------------------------------------------------------------------------

describe('R2-04b only a memory or a rule is reachable by id through approve / edit / forget', () => {
  const create = (h: ReturnType<typeof rig>, id: string, kind: 'memory' | 'constraint' | 'decision' | 'brief', body: string, factKey?: string) => h.vault.createRecord({
    id, workspaceId: 'ws', projectId: 'sh', kind, body, authorId: 'ana', visibility: { kind: 'workspace' }, ...(factKey === undefined ? {} : { factKey }),
  })
  const attempts = (h: ReturnType<typeof rig>, id: string): Array<() => unknown> => [
    () => h.approveMemory({ ...P, id, body: '', authorId: 'ana' }),
    () => h.editMemory({ ...P, id, body: 'trocado', authorId: 'ana' }),
    () => h.forgetMemory({ ...P, id }),
  ]

  it('the id of a Cofre fact (a connector token an older build kept as a record) is "not found" even for the owner, and the record is left untouched', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    create(h, 'old-token', 'memory', '111111:token-do-telegram', VAULT_TELEGRAM)
    for (const attempt of attempts(h, 'old-token')) expect(attempt).toThrow('memory-not-found')
    expect(h.vault.getRecord('old-token')).toMatchObject({ status: 'active', body: '111111:token-do-telegram' })
  })

  it('the id of a record of ANOTHER kind (a decision, a brief) is not a memory either', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    create(h, 'dec-1', 'decision', 'Decidimos abrir às 7h.')
    create(h, 'brief-1', 'brief', 'A padaria faz pães artesanais.')
    for (const id of ['dec-1', 'brief-1']) for (const attempt of attempts(h, id)) expect(attempt).toThrow('memory-not-found')
    expect(h.vault.getRecord('dec-1')?.status).toBe('active')
    expect(h.vault.getRecord('brief-1')?.status).toBe('active')
  })

  it('controls: a memory and a RULE (what the screen lists) are still forgotten and edited by the owner', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    create(h, 'mem-1', 'memory', 'A padaria abre às 7h.')
    create(h, 'rule-1', 'constraint', 'Nunca prometer entrega no mesmo dia.')
    expect(h.editMemory({ ...P, id: 'mem-1', body: 'A padaria abre às 6h30.', authorId: 'ana' }).body).toBe('A padaria abre às 6h30.')
    expect(h.forgetMemory({ ...P, id: 'mem-1' }).status).toBe('revoked')
    expect(h.forgetMemory({ ...P, id: 'rule-1' }).status).toBe('revoked')
  })
})
