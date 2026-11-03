import { describe, expect, it } from 'vitest'
import { EDGE_ONLY_NOTICES, formatDesktopLegalNotices, isEdgeOnlyNotice, PERSONA_DESKTOP_NOTICES } from '../src/legal-notices.ts'

describe('Persona desktop legal notices', () => {
  it('credits DeepSeek, OAR and the engine NOTICE, and keeps Cloudflare tools out', () => {
    const text = formatDesktopLegalNotices()
    expect(text).toContain('DeepSeek Harness (MIT)')
    expect(text).toContain('@botiverse/oar (Apache-2.0)')
    expect(text).toContain('dsh-superagent-prototype')
    expect(PERSONA_DESKTOP_NOTICES.every(item => !isEdgeOnlyNotice(item.name))).toBe(true)
    for (const name of EDGE_ONLY_NOTICES) expect(isEdgeOnlyNotice(name)).toBe(true)
  })
})
