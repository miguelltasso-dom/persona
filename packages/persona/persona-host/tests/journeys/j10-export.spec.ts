import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { readZipTexts } from '../../src/export-md.ts'
import { CLOCK, SCOPE, openJourney, seedJourney, it } from './journey-host.ts'

it('J10 — exportar o projeto não leva DM nem segredo', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  h.createDm({ id: 'secret-dm', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord' })
  h.postMessage({
    id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral',
    body: 'token sk-ant-api03-ABCDEFGHIJKLMNOP', actorId: 'ana', subjectId: 't',
    occurredAt: CLOCK,
  })
  h.postMessage({
    id: 'm2', ...SCOPE, streamKind: 'dm', ownerId: 'secret-dm',
    body: 'segredo do dm privado', actorId: 'ana', subjectId: 'd',
    occurredAt: CLOCK,
  })
  const closed = h.exportProject({ ...SCOPE, includeDmIds: [] })
  const files = readZipTexts(Buffer.from(closed.base64, 'base64'))
  const text = [...files.values()].join('\n')
  expect([...files.keys()].some(name => name.includes('/dms/'))).toBe(false)
  expect(text).not.toMatch(/segredo do dm privado/)
  expect(text).not.toMatch(/sk-ant/)
  expect(looksLikeCredential(text)).toBe(false)
})
