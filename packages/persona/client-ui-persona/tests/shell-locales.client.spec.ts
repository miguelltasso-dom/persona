import { describe, expect, it } from 'vitest'
import { de, en, es, fr, ja, pt, ru, SHELL_NS, zh } from '../src/client/locale/shell/locales.ts'

describe('persona shell locales', () => {
  it('registers the expected namespace and Portuguese sidebar labels', () => {
    expect(SHELL_NS).toBe('persona.shell')
    expect(pt['sidebar.overview']).toBe('Visão geral')
    expect(pt['sidebar.usage']).toBe('Uso e limites')
  })

  it('keeps key parity across shipped locales', () => {
    const keys = Object.keys(en)
    for (const dict of [zh, ja, es, fr, de, ru, pt]) {
      expect(Object.keys(dict).sort()).toEqual(keys.sort())
    }
  })
})
