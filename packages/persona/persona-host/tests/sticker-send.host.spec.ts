// COLHEITA §14 (Quill): figurinha sozinha no composer vira mensagem da pessoa SEM abrir turno.
import { expect, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { stickerBody, stickerIdOfBody, stickerMessageEvent } from '../src/sticker-send.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const NOW = '2026-11-11T12:00:00.000Z'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

it('o marcador da figurinha vai e volta: [[sticker:<id>]]', () => {
  expect(stickerBody('joinha')).toBe('[[sticker:joinha]]')
  expect(stickerIdOfBody('[[sticker:joinha]]')).toBe('joinha')
  expect(stickerIdOfBody('oi, tudo bem?')).toBeUndefined()
})

it('figurinha fora do catálogo ou sem autor é recusada (nada gravado)', () => {
  const base = { ...scope, streamKind: 'channel' as const, ownerId: 'geral', id: 'st0' }
  expect(() => stickerMessageEvent({ ...base, stickerId: 'nao-existe', actorId: 'ana' }, NOW)).toThrow(/unknown-sticker/)
  expect(() => stickerMessageEvent({ ...base, stickerId: 'joinha' }, NOW)).toThrow(/sticker-without-author/)
})

it('figurinha sozinha grava a mensagem da pessoa e NÃO abre turno', () => {
  const h = host()
  seed(h)
  const orchestration = (h as unknown as { orchestration: { ingest: (...args: unknown[]) => unknown } }).orchestration
  const ingest = vi.spyOn(orchestration, 'ingest')
  const sent = h.sendSticker({ ...scope, id: 'st1', streamKind: 'channel', ownerId: 'geral', stickerId: 'joinha' })
  expect(sent.body).toBe('[[sticker:joinha]]')
  expect(ingest).not.toHaveBeenCalled()
})
