/**
 * P1-NOVO (Anvil, interno; Keel 12/11 08:39): a memory the owner said in a DM is that persona's, and it is private to WHO SAID IT. `listMemory` used `viewerId`
 * only to write "Você disse…" and returned every DM memory, with the whole message (`proof.quote`), to any member who opened Memória; the owner's export and the
 * owner's view of forgotten records took everything too. Written RED first: two members, each with a DM to the same persona.
 */
import { describe, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { readZipTexts } from '../src/export-md.ts'
import { captureOwnerMemory, type OwnerMemoryDeps } from '../src/owner-memory.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-11T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const ANA_DM = 'Lembra que a Ana Souza prefere pão sem sal'
const CAIO_DM = 'Lembra que o cliente Zé só paga no Pix'
const TEAM = 'Pessoal, lembrem: a padaria abre às 7h'

function seed(h: PersonaHost): OwnerMemoryDeps {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'caio', ...SCOPE, displayName: 'Caio', handle: 'caio', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'bento', name: 'Bento', title: 'Atendimento', description: 'Ajuda.', personality: 'Calmo.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.createDm({ id: 'dm-ana', ...SCOPE, participantA: 'ana', participantB: 'bento' })
  h.createDm({ id: 'dm-caio', ...SCOPE, participantA: 'caio', participantB: 'bento' })
  return { vault: h.vault, screens: h.screens.screens, product: h.product }
}

function said(h: PersonaHost, id: string, body: string, where: { dm?: string; actorId: string }) {
  return h.events.append({
    id, ...SCOPE, streamKind: where.dm === undefined ? 'channel' : 'dm', ownerId: where.dm ?? 'geral',
    type: 'message', body, actorId: where.actorId, subjectId: `s-${id}`, occurredAt: CLOCK,
  })
}

/** Ana's DM memory, Caio's DM memory and one team memory, all kept the way the host keeps them. */
function rig() {
  const h = host()
  const deps = seed(h)
  const ana = captureOwnerMemory(deps, said(h, 'da', ANA_DM, { dm: 'dm-ana', actorId: 'ana' }))!
  const caio = captureOwnerMemory(deps, said(h, 'dc', CAIO_DM, { dm: 'dm-caio', actorId: 'caio' }))!
  const team = captureOwnerMemory(deps, said(h, 'tm', TEAM, { actorId: 'ana' }))!
  expect([ana.status, caio.status, team.status]).toEqual(['saved', 'saved', 'saved'])
  return { h, ana, caio, team }
}
const everything = (value: unknown): string => JSON.stringify(value)

describe('a DM memory is private to who said it', () => {
  it('Memória: Ana reads her own DM memory and the team\'s, never Caio\'s (not even as the owner of the space); Caio the reverse; the whole message never travels', () => {
    const { h } = rig()
    h.sessionMemberId = 'ana'
    const forAna = h.listMemory({ ...SCOPE })
    expect(forAna.map(row => row.scope).sort()).toEqual(['persona', 'team'])
    expect(forAna.find(row => row.scope === 'persona')).toMatchObject({ source: { by: 'Ana', mine: true, where: 'dm' }, to: { name: 'Bento' } })
    expect(everything(forAna)).not.toContain('Zé só paga')
    h.sessionMemberId = 'caio'
    const forCaio = h.listMemory({ ...SCOPE })
    expect(forCaio.map(row => row.scope).sort()).toEqual(['persona', 'team'])
    expect(forCaio.find(row => row.scope === 'persona')).toMatchObject({ source: { by: 'Caio', mine: true } })
    expect(everything(forCaio)).not.toContain('Ana Souza prefere')
    expect(forCaio.find(row => row.scope === 'team')?.source).toMatchObject({ by: 'Ana', mine: false }) // the team's memory is still everybody's
  })

  it('a reader nobody knows (no viewer) sees no private memory at all: it fails closed', () => {
    const { h } = rig()
    const rows = h.screens.listMemory('pp')
    expect(rows.map(row => row.scope)).toEqual(['team'])
    expect(everything(rows)).not.toMatch(/pão sem sal|Zé só paga/u)
  })

  it('Segundo cérebro: a DM memory that was forgotten stays private too (the owner of the space reads forgotten TEAM records, not somebody else\'s private ones)', () => {
    const { h, caio, team } = rig()
    h.vault.revokeRecord(caio.recordId)
    h.vault.revokeRecord(team.recordId)
    h.sessionMemberId = 'ana'
    const rows = h.listVaultRecords({ ...SCOPE })
    expect(everything(rows)).not.toContain('Zé só paga')
    expect(rows.find(row => row.id === team.recordId)?.status).toBe('revoked') // the owner's audit of the team's forgotten records is intact
  })

  it('export: each owner takes the team\'s memories and their OWN DM memories, never another member\'s', () => {
    const { h } = rig()
    const textOf = (member: string): string => {
      h.sessionMemberId = member
      const archive = h.exportProject({ ...SCOPE, includeDmIds: [] })
      return [...readZipTexts(Buffer.from(archive.base64, 'base64')).values()].join('\n')
    }
    const ana = textOf('ana')
    expect(ana).toContain('padaria abre')
    expect(ana).toContain('Ana Souza prefere')
    expect(ana).not.toContain('Zé só paga')
    const caio = textOf('caio')
    expect(caio).toContain('Zé só paga')
    expect(caio).not.toContain('Ana Souza prefere')
  })
})
