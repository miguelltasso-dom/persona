import { mayUpload } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { readZipTexts } from '../../src/export-md.ts'
import { CLOCK, SCOPE, openJourney, seedJourney, it } from './journey-host.ts'

it('J19 — governança viaja no export/sync de workspace; DM não; reimportar não duplica', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  h.governance.gov.putSector({
    id: 'eng', workspaceId: 'ws', name: 'Engenharia',
    policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }),
  })
  h.governance.gov.putAudit({
    id: 'a1', workspaceId: 'ws', at: CLOCK,
    action: 'set-sector', actorId: 'ana', body: '{"sectorId":"eng"}',
  })
  h.createDm({
    id: 'secret-dm', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord',
  })
  h.postMessage({
    id: 'dm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'secret-dm',
    body: 'segredo do dm privado', actorId: 'ana', subjectId: 'd', occurredAt: CLOCK,
  })

  const closed = h.exportWorkspace({ workspaceId: 'ws', projectId: 'pp', includeDmIds: [] })
  const files = readZipTexts(Buffer.from(closed.base64, 'base64'))
  const names = [...files.keys()]
  const text = [...files.values()].join('\n')
  expect(names.some(name => name === 'governanca.md' || name.endsWith('/governanca.md'))).toBe(true)
  expect(names.some(name => name.includes('/dms/'))).toBe(false)
  expect(text).toMatch(/Governança|setor|Engenharia|engenharia/i)
  expect(text).not.toMatch(/segredo do dm privado/)

  const snap = h.governance.gov.snapshot('ws')
  expect(snap.sectors.length + snap.audit.length).toBeGreaterThan(0)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'gov:ws', seq: 1, idempotencyKey: 'g1',
    classification: 'workspace', at: CLOCK,
    payload: { clear: JSON.stringify(snap) },
  })).toBe(true)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'dm:secret-dm', seq: 1, idempotencyKey: 'd1',
    classification: 'dm', at: CLOCK,
    payload: { clear: 'private' },
  })).toBe(false)

  h.governance.gov.restore('ws', snap)
  h.governance.gov.restore('ws', snap)
  expect(h.governance.gov.snapshot('ws').sectors).toEqual(snap.sectors)

  const page = [...files.entries()].find(([name]) => name.endsWith('governanca.md'))
  expect(page).toBeDefined()
  const preview = h.previewImport({ ...SCOPE, files: [{ name: 'governanca.md', text: page![1] }] })
  const first = h.confirmImport({ ...SCOPE, batchId: 'gov-1', files: [{ name: 'governanca.md', text: page![1] }] })
  const again = h.confirmImport({ ...SCOPE, batchId: 'gov-2', files: [{ name: 'governanca.md', text: page![1] }] })
  expect(first.applied + again.applied).toBeLessThanOrEqual(preview.accepted)
  expect(again.applied).toBe(0)
})
