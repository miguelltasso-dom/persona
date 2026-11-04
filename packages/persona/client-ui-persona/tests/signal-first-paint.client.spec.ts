// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { PERSONA_FIRST_PAINT_EVENT, signalPersonaFirstPaint } from '../src/client/boot/signal-first-paint.ts'

afterEach(() => {
  delete document.documentElement.dataset.personaFirstPaint
})

describe('persona:first-paint (BOOT-SPEC)', () => {
  it('marks the document and fires once', () => {
    const seen: string[] = []
    document.addEventListener(PERSONA_FIRST_PAINT_EVENT, () => { seen.push('paint') })
    signalPersonaFirstPaint()
    signalPersonaFirstPaint()
    expect(document.documentElement.dataset.personaFirstPaint).toBe('1')
    expect(seen).toEqual(['paint'])
  })
})
