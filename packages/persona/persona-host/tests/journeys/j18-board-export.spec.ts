import { mayUpload } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { readZipTexts } from '../../src/export-md.ts'
import { CLOCK, SCOPE, openJourney, sayOn, seedJourney, seedProject, it } from './journey-host.ts'

it('J18 — fluxo e sprint viajam no export/sync; DM não; reimportar não duplica', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  seedProject(h, {
    id: 'hire', name: 'Contratação', template: 'contratacao',
    team: [{ id: 'rh', name: 'Rita', title: 'Recrutamento', coordination: true }],
  })
  h.createSprint({
    workspaceId: 'ws', projectId: 'hire', id: 'sp-hire', name: 'S1',
    objective: 'Fechar a vaga', endsAt: '2026-11-10T00:00:00.000Z',
  })
  sayOn(h, 'hire', 'm-hire', 'quadro do projeto Contratação')
  h.createDm({
    id: 'secret-dm', workspaceId: 'ws', projectId: 'hire', participantA: 'ana', participantB: 'rh',
  })
  h.postMessage({
    id: 'dm1', workspaceId: 'ws', projectId: 'hire', streamKind: 'dm', ownerId: 'secret-dm',
    body: 'segredo do dm privado', actorId: 'ana', subjectId: 'd', occurredAt: CLOCK,
  })

  const closed = h.exportProject({ workspaceId: 'ws', projectId: 'hire', includeDmIds: [] })
  const files = readZipTexts(Buffer.from(closed.base64, 'base64'))
  const names = [...files.keys()]
  const text = [...files.values()].join('\n')
  expect(names.some(name => name.endsWith('fluxo.md'))).toBe(true)
  expect(names.some(name => name.endsWith('sprints.md'))).toBe(true)
  expect(names.some(name => name.includes('/dms/'))).toBe(false)
  expect(text).toMatch(/contratacao|Contrata|Triagem/)
  expect(text).toMatch(/Fechar a vaga/)
  expect(text).not.toMatch(/segredo do dm privado/)

  const snap = h.boards.board.snapshot('hire')
  expect(snap.workflow?.template).toBe('contratacao')
  expect(snap.sprints).toHaveLength(1)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'board:hire', seq: 1, idempotencyKey: 'b1',
    classification: 'project', at: CLOCK,
    payload: { clear: JSON.stringify(snap) },
  })).toBe(true)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'dm:secret-dm', seq: 1, idempotencyKey: 'd1',
    classification: 'dm', at: CLOCK,
    payload: { clear: 'private' },
  })).toBe(false)

  h.boards.board.restore('hire', snap)
  h.boards.board.restore('hire', snap)
  expect(h.listSprints({ workspaceId: 'ws', projectId: 'hire' })).toHaveLength(1)
  expect(h.getProjectBoard({ workspaceId: 'ws', projectId: 'hire' }).workflow.template).toBe('contratacao')

  const fluxo = [...files.entries()].find(([name]) => name.endsWith('fluxo.md'))
  expect(fluxo).toBeDefined()
  const preview = h.previewImport({ ...SCOPE, files: [{ name: 'fluxo.md', text: fluxo![1] }] })
  const first = h.confirmImport({ ...SCOPE, batchId: 'board-1', files: [{ name: 'fluxo.md', text: fluxo![1] }] })
  const again = h.confirmImport({ ...SCOPE, batchId: 'board-2', files: [{ name: 'fluxo.md', text: fluxo![1] }] })
  expect(first.applied + again.applied).toBeLessThanOrEqual(preview.accepted)
  expect(again.applied).toBe(0)
})
