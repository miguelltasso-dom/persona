import { expect } from 'vitest'
import { SCOPE, openJourney, seedJourney, it } from './journey-host.ts'

it('J9 — importar Markdown: prévia, confirma, reimportar não duplica, rollback', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  const files = [{ name: 'note.md', text: 'Preferência: terças.' }]
  const preview = h.previewImport({ ...SCOPE, files })
  expect(preview.adapterId).toBe('markdown')
  expect(preview.accepted).toBe(1)
  expect(h.confirmImport({ ...SCOPE, batchId: 'b1', files }).applied).toBe(1)
  const afterFirst = h.listMemory(SCOPE).filter(item => item.body.includes('terças'))
  expect(afterFirst.length).toBeGreaterThan(0)
  expect(h.confirmImport({ ...SCOPE, batchId: 'b2', files }).applied).toBe(0)
  expect(h.listMemory(SCOPE).filter(item => item.body.includes('terças'))).toHaveLength(afterFirst.length)
  expect(h.rollbackImport({ ...SCOPE, batchId: 'b1' }).rolledBack).toBe(true)
})
