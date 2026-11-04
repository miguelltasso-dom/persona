import { describe, expect, it } from 'vitest'
import {
  PERSONA_CSP,
  allowShellNavigation,
  isExternalHttpUrl,
  personaPermissionRequest,
  secureWebPreferences,
  windowOpenAction,
} from '../src/secure-shell.ts'

describe('secure shell', () => {
  it('sandboxes every window and disables node and webview', () => {
    const prefs = secureWebPreferences('C:/app/lib/preload-app.cjs')
    expect(prefs.sandbox).toBe(true)
    expect(prefs.contextIsolation).toBe(true)
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.webviewTag).toBe(false)
    expect(PERSONA_CSP).toContain("default-src 'self' dsh-app:")
    expect(PERSONA_CSP).toContain('sha256-ikYDEfGOZZNuGAdbu2YAz9STcFnRaWk0u5Dc0unuOyI=')
    expect(PERSONA_CSP).toContain('sha256-W1J9ifi3GWzqjTB2F6YQEv18k/YCJPpN1tANFrO28pg=')
    expect(PERSONA_CSP).toContain("font-src 'self' data: dsh-app:")
    expect(PERSONA_CSP).not.toMatch(/https:/u)
  })

  it('allows only dsh-app, persona and data navigation', () => {
    expect(allowShellNavigation('dsh-app://app/')).toBe(true)
    expect(allowShellNavigation('persona://task/t-1')).toBe(true)
    expect(allowShellNavigation('data:text/html,ok')).toBe(true)
    expect(allowShellNavigation('https://example.com')).toBe(false)
    expect(isExternalHttpUrl('https://example.com/x')).toBe(true)
    expect(windowOpenAction({ url: 'https://evil.example' } as never).action).toBe('deny')
  })

  it('grants only notifications', () => {
    const seen: boolean[] = []
    personaPermissionRequest(undefined, 'notifications', (grant) => { seen.push(grant) })
    personaPermissionRequest(undefined, 'camera', (grant) => { seen.push(grant) })
    personaPermissionRequest(undefined, 'geolocation', (grant) => { seen.push(grant) })
    expect(seen).toEqual([true, false, false])
  })
})
