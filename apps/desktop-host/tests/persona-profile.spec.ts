import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PERSONA_HOST_PROFILE,
  assertPersonaAppLayer,
  resolveDesktopHostProfileName,
} from '../src/persona-profile.ts'

const hostRoot = fileURLToPath(new URL('..', import.meta.url))

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

  it('disables client-hmr on the Electron host so SSE cannot stall plugin boot', () => {
    const patch = readFileSync(join(hostRoot, 'config', 'electron.cordis.patch.yml'), 'utf8')
    const index = readFileSync(join(hostRoot, 'src', 'index.ts'), 'utf8')
    expect(patch).toContain('id: client-hmr')
    expect(patch).toContain('disabled: true')
    expect(index).toContain('electron.cordis.patch.yml')
  })
})
