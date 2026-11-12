// COLHEITA §14 (Quill): o corpo `[[sticker:<id>]]` vira figurinha; texto comum não.
import { describe, expect, it } from 'vitest'
import { stickerFromBody } from '../src/client/chat/sticker-marker.ts'

describe('figurinha no corpo da mensagem', () => {
  it('o marcador de uma figurinha do catálogo de reações vira o id', () => {
    expect(stickerFromBody('[[sticker:joinha]]')).toBe('joinha')
  })

  it('texto comum, marcador fora do catálogo ou marcador com texto em volta: não é figurinha', () => {
    expect(stickerFromBody('oi, tudo bem?')).toBeUndefined()
    expect(stickerFromBody('[[sticker:nao-existe]]')).toBeUndefined()
    expect(stickerFromBody('veja [[sticker:joinha]]')).toBeUndefined()
  })
})
