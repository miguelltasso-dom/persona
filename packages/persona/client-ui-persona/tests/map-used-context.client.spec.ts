import { describe, expect, it } from 'vitest'
import { mapUsedContextRecord } from '../src/client/remote/map-used-context.ts'

describe('mapUsedContextRecord', () => {
  it('keeps document title and locator for Contexto usado', () => {
    const row = mapUsedContextRecord({
      id: 'chunk-1',
      kind: 'document',
      body: 'Cláusula de rescisão…',
      required: false,
      restricted: false,
      title: 'Contrato padrão',
      locator: 'página 3',
    })
    expect(row.kind).toBe('document')
    expect(row.title).toBe('Contrato padrão')
    expect(row.locator).toBe('página 3')
  })
})
