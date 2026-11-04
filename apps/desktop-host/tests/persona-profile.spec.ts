import { describe, expect, it } from 'vitest'
import {
  PERSONA_HOST_PROFILE,
  assertPersonaAppLayer,
  resolveDesktopHostProfileName,
} from '../src/persona-profile.ts'

describe('Persona desktop-host profile', () => {
  it('defaults to persona and never to web or desktop', () => {
    expect(PERSONA_HOST_PROFILE).toBe('persona')
    expect(resolveDesktopHostProfileName({})).toBe('persona')
    expect(resolveDesktopHostProfileName({ DSH_PROFILE: '  ' })).toBe('persona')
    expect(resolveDesktopHostProfileName({ DSH_PROFILE: 'persona' })).toBe('persona')
  })

  it('refuses a profile that skipped persona-app', () => {
    expect(() => assertPersonaAppLayer({
      layers: [{ packageName: '@deepseek-ai/dsh-web-app' }],
      skippedBundles: [{ packageName: '@deepseek-ai/dsh-persona-app', reason: 'missing' }],
    }, 'desktop')).toThrow(/persona-app is not in the desktop profile/)
    expect(() => assertPersonaAppLayer({
      layers: [{ packageName: '@deepseek-ai/dsh-persona-app' }],
      skippedBundles: [],
    }, 'persona')).not.toThrow()
  })
})
