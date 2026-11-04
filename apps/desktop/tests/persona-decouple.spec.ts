/** A3b: Persona decouples DeepSeek Welcome, telemetry hosts, and default home. */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decideDesktopRequest,
  isDeepSeekHost,
  KNOWN_DEEPSEEK_ENDPOINTS,
  PERSONA_ALLOWED_PROBE_ENDPOINTS,
} from '../src/deepseek-hosts.ts'
import {
  PERSONA_APP_ID,
  PERSONA_DSH_PROFILE,
  PERSONA_HOME_DIR_NAME,
  PERSONA_PRODUCT_NAME,
  PERSONA_PROTOCOL,
  applyPersonaDesktopIdentity,
  personaUpdatesEnabled,
  resolvePersonaProcessHome,
  resolvePersonaStartupSurface,
  shouldShowDeepSeekWelcome,
} from '../src/product.ts'
import { PERSONA_CSP } from '../src/secure-shell.ts'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { resolvePersonaHome } from '@deepseek-ai/dsh-home-paths'
import { resolveDesktopPaths } from '../src/paths.ts'

const repo = fileURLToPath(new URL('../../..', import.meta.url))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Persona DeepSeek decoupling', () => {
  it('pins the Electron window title so the renderer cannot restore DeepSeek', () => {
    const main = readFileSync(join(repo, 'apps/desktop/src/main.ts'), 'utf8')
    expect(main).toContain('pinPersonaWindowTitle')
    expect(main).toContain('page-title-updated')
    expect(main).toContain('window.setTitle(PERSONA_PRODUCT_NAME)')
    expect(main).not.toMatch(/executeJavaScript\(`document\.title/u)
  })

  it('names the product Persona and uses the persona:// protocol', () => {
    expect(PERSONA_PRODUCT_NAME).toBe('Persona')
    expect(PERSONA_PROTOCOL).toBe('persona')
    expect(PERSONA_APP_ID).toBe('com.persona.app')
    expect(PERSONA_HOME_DIR_NAME).toBe('.persona')
  })

  it('replaces DeepSeek Welcome with the Persona onboarding workspace hook', () => {
    expect(resolvePersonaStartupSurface()).toBe('workspace')
    vi.stubEnv('DSH_DESKTOP_WELCOME', '1')
    expect(resolvePersonaStartupSurface()).toBe('deepseek-welcome')
  })

  it('locks the official brand occupant to persona-assets/brand/symbol.svg', () => {
    const symbol = readFileSync(join(repo, 'persona-assets/brand/symbol.svg'), 'utf8')
    const brand = readFileSync(join(repo, 'packages/client/ui-brand-official/src/client/Brand.tsx'), 'utf8')
    const path = /d="([^"]+)"/u.exec(symbol)?.[1]
    expect(path).toBeDefined()
    expect(brand).toContain(path)
    expect(brand).toContain('Persona')
  })

  it('skips DeepSeek Welcome and updater unless explicitly re-enabled', () => {
    expect(shouldShowDeepSeekWelcome()).toBe(false)
    expect(personaUpdatesEnabled()).toBe(false)
    vi.stubEnv('DSH_DESKTOP_WELCOME', '1')
    vi.stubEnv('DSH_DESKTOP_UPDATES', '1')
    expect(shouldShowDeepSeekWelcome()).toBe(true)
    expect(personaUpdatesEnabled()).toBe(true)
  })

  it('resolves the process home to ~/.persona when neither env is set', () => {
    expect(resolvePersonaProcessHome({})).toBe(join(homedir(), '.persona'))
    expect(resolvePersonaHome(undefined, {})).toBe(join(homedir(), '.persona'))
  })

  it('rewrites Host inline boot scripts so the default persona profile never needs unsafe-eval', () => {
    const main = readFileSync(join(repo, 'apps/desktop/src/main.ts'), 'utf8')
    expect(PERSONA_DSH_PROFILE).toBe('persona')
    expect(main).toContain('applyRewrittenBootInjections')
    expect(main).toContain('servePersonaBootScript')
    expect(PERSONA_CSP).not.toContain('unsafe-eval')
    expect(PERSONA_CSP).not.toMatch(/script-src[^;]*'unsafe-inline'/u)
  })

  it('publishes DSH_PROFILE=persona before the host starts', () => {
    expect(PERSONA_DSH_PROFILE).toBe('persona')
    const previous = process.env.DSH_PROFILE
    delete process.env.DSH_PROFILE
    try {
      applyPersonaDesktopIdentity()
      expect(process.env.DSH_PROFILE).toBe('persona')
    } finally {
      if (previous === undefined) delete process.env.DSH_PROFILE
      else process.env.DSH_PROFILE = previous
    }
  })

  it('prefers PERSONA_HOME over the implicit default and publishes it as DSH_HOME input', () => {
    expect(resolvePersonaProcessHome({ PERSONA_HOME: 'C:/tmp/persona-home' })).toMatch(/persona-home$/u)
    expect(resolvePersonaProcessHome({ DSH_HOME: 'C:/tmp/dsh-home', PERSONA_HOME: 'C:/tmp/persona-home' }))
      .toMatch(/dsh-home$/u)
  })

  it('composes the desktop profile from the persona template', () => {
    const bundles = PROFILE_TEMPLATES.persona?.bundles ?? [
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-persona-app',
    ]
    expect(bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-persona-app',
    ])
    expect(PERSONA_DSH_PROFILE).toBe('persona')
    expect(resolveDesktopPaths('/tmp/home').profile.replaceAll('\\', '/')).toBe('/tmp/home/profiles/persona')
  })

  it('disables the three DeepSeek telemetry channels in the Persona patch', () => {
    const yml = readFileSync(join(repo, 'packages/persona/persona-app/cordis.patch.yml'), 'utf8')
    for (const id of [
      'desktop-product-telemetry',
      'product-analytics',
      'session-telemetry-otel',
      'session-log-deepseek',
      'plugin-package-inventory-deepseek',
    ]) {
      expect(yml).toMatch(new RegExp(`id: ${id}\\r?\\n  disabled: true`, 'u'))
    }
  })

  it('captures a request log and admits zero deepseek hosts', () => {
    const attempted = [...KNOWN_DEEPSEEK_ENDPOINTS, ...PERSONA_ALLOWED_PROBE_ENDPOINTS]
    const captured: { url: string; decision: 'cancel' | 'allow' }[] = []
    for (const url of attempted) {
      captured.push({ url, decision: decideDesktopRequest(url) })
    }
    const admitted = captured.filter(row => row.decision === 'allow')
    const cancelled = captured.filter(row => row.decision === 'cancel')
    expect(cancelled.map(row => row.url)).toEqual([...KNOWN_DEEPSEEK_ENDPOINTS])
    expect(admitted.map(row => row.url)).toEqual([...PERSONA_ALLOWED_PROBE_ENDPOINTS])
    expect(admitted.filter(row => /deepseek/iu.test(row.url))).toHaveLength(0)
    expect(isDeepSeekHost('collector.deepseek.com')).toBe(true)
    expect(isDeepSeekHost('https://example.com/docs')).toBe(false)
  })
})
