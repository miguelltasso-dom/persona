import { describe, expect, it } from 'vitest'
import { localeBindAsDict } from '../src/client/preview/locale-bind.ts'

describe('localeBindAsDict', () => {
  it('proxies bind calls for onboarding-style dict access', () => {
    const dict = localeBindAsDict(key => (key === 'step1.title' ? 'Olá' : key))
    expect(dict['step1.title']).toBe('Olá')
  })
})
