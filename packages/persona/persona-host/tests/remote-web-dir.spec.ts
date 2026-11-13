import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { remoteWebDirOf } from '../src/remote-web/remote-access.ts'
import { RemoteGate, type RemoteGateDeps } from '../src/remote-web/remote-gate.ts'
import { DeviceBook } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'

/**
 * M5 (Keel 12/11 20:09): the folder the remote gate serves comes from the env `PERSONA_REMOTE_WEB_DIR` the desktop main hands to the host child. Absent, empty or not absolute = no folder (the gate answers 404 as it does today, no crash).
 */
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('remoteWebDirOf', () => {
  it('an absolute folder in the env is the folder to serve', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-remote-web-'))
    dirs.push(dir)
    expect(remoteWebDirOf({ PERSONA_REMOTE_WEB_DIR: dir })).toBe(dir)
  })

  it.each([
    ['absent', {}],
    ['empty', { PERSONA_REMOTE_WEB_DIR: '' }],
    ['blank', { PERSONA_REMOTE_WEB_DIR: '   ' }],
    ['relative (it would follow the working folder of whoever started the host)', { PERSONA_REMOTE_WEB_DIR: 'dist-remote' }],
    ['a dot-dot path', { PERSONA_REMOTE_WEB_DIR: '../dist-remote' }],
    ['with a NUL', { PERSONA_REMOTE_WEB_DIR: `${tmpdir()}\0x` }],
  ])('%s is no folder (404, no crash)', (_label, env) => {
    expect(remoteWebDirOf(env as NodeJS.ProcessEnv)).toBeUndefined()
  })

  it('end to end on a real gate: with the folder GET / is the page and a path outside the folder is not served; without it everything is 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-remote-web-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Casa</title>')
    writeFileSync(join(dir, '..', 'persona-remote-web-secret.txt'), 'x')
    const make = (distDir: string | undefined): RemoteGate => {
      const book = new DeviceBook(undefined, () => 1_800_000_000_000)
      const deps = {
        book, pairing: new DevicePairing(memoryPairStore(), () => 1_800_000_000_000), requests: new PairRequests(book, () => 1_800_000_000_000), hostLabel: 'PC', memberOf: () => undefined,
        allowAddress: () => true, allowRemote: () => true, now: () => 1_800_000_000_000, whois: () => Promise.resolve({ node: 'n', login: 'l@example.com' }), selfLogin: () => Promise.resolve(undefined), audit: () => undefined,
        ...(distDir === undefined ? {} : { distDir }),
      }
      return new RemoteGate(deps as unknown as RemoteGateDeps)
    }
    const withDir = make(remoteWebDirOf({ PERSONA_REMOTE_WEB_DIR: dir }))
    const without = make(remoteWebDirOf({}))
    const portWith = await withDir.listen('127.0.0.1', 0)
    const portWithout = await without.listen('127.0.0.1', 0)
    try {
      const page = await fetch(`http://127.0.0.1:${String(portWith)}/`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('<title>Casa</title>')
      expect((await fetch(`http://127.0.0.1:${String(portWith)}/..%2fpersona-remote-web-secret.txt`)).status).toBe(404)
      expect((await fetch(`http://127.0.0.1:${String(portWithout)}/`)).status).toBe(404)
    } finally {
      await withDir.close()
      await without.close()
      rmSync(join(dir, '..', 'persona-remote-web-secret.txt'), { force: true })
    }
  })
})
