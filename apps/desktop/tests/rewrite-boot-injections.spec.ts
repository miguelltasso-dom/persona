import { describe, expect, it } from 'vitest'
import {
  PERSONA_BOOT_READY_JS,
  PERSONA_BOOT_READY_SRC,
  PERSONA_BOOT_SCRIPT_PREFIX,
  applyRewrittenBootInjections,
  createPersonaBootScriptStore,
  rewriteBootInjections,
  servePersonaBootScript,
} from '../src/rewrite-boot-injections.ts'

describe('rewrite boot injections', () => {
  it('turns Host inline scripts into same-origin script-src files and leaves other rows', () => {
    const rewritten = rewriteBootInjections([
      { kind: 'global', name: '__DSH_BOOT__', value: { entries: [] } },
      { kind: 'script', placement: 'head', text: 'globalThis.__ModuleLoader__ = { load() {} }' },
      { kind: 'script-src', placement: 'head', src: 'http://127.0.0.1:9/plugins/??ui/client.js' },
      { kind: 'script', placement: 'body', text: 'document.documentElement.dataset.theme = "light"' },
      { kind: 'style', text: ':root { color: red }' },
    ])
    expect(rewritten.injections).toEqual([
      { kind: 'global', name: '__DSH_BOOT__', value: { entries: [] } },
      { kind: 'script-src', placement: 'head', src: `${PERSONA_BOOT_SCRIPT_PREFIX}0.js` },
      { kind: 'script-src', placement: 'head', src: 'http://127.0.0.1:9/plugins/??ui/client.js' },
      { kind: 'script-src', placement: 'body', src: `${PERSONA_BOOT_SCRIPT_PREFIX}1.js` },
      { kind: 'style', text: ':root { color: red }' },
    ])
    expect([...rewritten.files.entries()]).toEqual([
      [`${PERSONA_BOOT_SCRIPT_PREFIX}0.js`, 'globalThis.__ModuleLoader__ = { load() {} }'],
      [`${PERSONA_BOOT_SCRIPT_PREFIX}1.js`, 'document.documentElement.dataset.theme = "light"'],
    ])
    expect(rewritten.injections.some(row => typeof row === 'object' && row !== null
      && (row as { kind?: string }).kind === 'script')).toBe(false)
  })

  it('keeps the boot-gate script across Host restarts and serves only GET/HEAD', async () => {
    const files = createPersonaBootScriptStore()
    expect(files.get(PERSONA_BOOT_READY_SRC)).toBe(PERSONA_BOOT_READY_JS)
    const first = applyRewrittenBootInjections([
      { kind: 'script', placement: 'head', text: 'first()' },
    ], files)
    expect(first).toEqual([
      { kind: 'script-src', placement: 'head', src: `${PERSONA_BOOT_SCRIPT_PREFIX}0.js` },
    ])
    applyRewrittenBootInjections([
      { kind: 'script', placement: 'head', text: 'second()' },
    ], files)
    expect(files.get(PERSONA_BOOT_READY_SRC)).toBe(PERSONA_BOOT_READY_JS)
    expect(files.get(`${PERSONA_BOOT_SCRIPT_PREFIX}0.js`)).toBe('second()')
    const ready = await servePersonaBootScript(
      new Request(`dsh-app://app${PERSONA_BOOT_READY_SRC}`),
      files,
    )
    expect(ready?.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await ready?.text()).toBe(PERSONA_BOOT_READY_JS)
    expect(servePersonaBootScript(new Request('dsh-app://app/assets/entry.js'), files)).toBeUndefined()
    const denied = servePersonaBootScript(
      new Request(`dsh-app://app${PERSONA_BOOT_READY_SRC}`, { method: 'POST' }),
      files,
    )
    expect(denied?.status).toBe(405)
  })
})
