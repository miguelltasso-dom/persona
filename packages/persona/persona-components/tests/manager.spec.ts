import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComponentManager } from '../src/manager.ts'
import PersonaComponents from '../src/plugin.ts'
import { parseComponentManifest } from '../src/manifest.ts'
import type { ComponentManifest, ComponentManifestEntry } from '../src/manifest.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function archive(): Uint8Array {
  return zipSync({ 'bin/tool.exe': strToU8('component'), 'README.txt': strToU8('ok') })
}

function entry(bytes: Uint8Array, overrides: Partial<ComponentManifestEntry> = {}): ComponentManifestEntry {
  return {
    kind: 'python',
    version: '3.12.0',
    url: 'https://components.example/python-3.12.0.zip',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    ...overrides,
  }
}

function manager(manifest: ComponentManifest, fetchImpl: typeof fetch, onProgress?: (kind: string, received: number, total: number) => void): ComponentManager {
  const root = mkdtempSync(join(tmpdir(), 'components-'))
  roots.push(root)
  return new ComponentManager({ root, manifest, fetch: fetchImpl, ...(onProgress === undefined ? {} : { onProgress }) })
}

const respond = (bytes: Uint8Array, status = 200): typeof fetch => async () => {
  // Copy into a plain ArrayBuffer-backed view: Response's BodyInit does not accept the ArrayBufferLike view fflate returns.
  const body = new Uint8Array(bytes.length)
  body.set(bytes)
  return new Response(body, { status })
}

describe('component manifest', () => {
  it('accepts a pinned https manifest', () => {
    const bytes = archive()
    const manifest = parseComponentManifest({ schemaVersion: 1, components: [entry(bytes)] })
    expect(manifest.components).toHaveLength(1)
    expect(manifest.components[0]?.kind).toBe('python')
  })

  it.each([
    ['unsupported schema', { schemaVersion: 2, components: [] }],
    ['no components', { schemaVersion: 1 }],
    ['unknown kind', { schemaVersion: 1, components: [{ ...entry(archive()), kind: 'ruby' }] }],
    ['http url', { schemaVersion: 1, components: [entry(archive(), { url: 'http://example/x.zip' })] }],
    ['bad sha256', { schemaVersion: 1, components: [entry(archive(), { sha256: 'abc' })] }],
    ['bad bytes', { schemaVersion: 1, components: [entry(archive(), { bytes: 0 })] }],
    ['bad format', { schemaVersion: 1, components: [{ kind: 'python', version: '3.12.0', url: 'https://components.example/python-3.12.0.zip', sha256: 'a'.repeat(64), bytes: 1, format: 'rar' }] }],
    ['duplicate kind', { schemaVersion: 1, components: [entry(archive()), entry(archive())] }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseComponentManifest(value)).toThrow(/components:/u)
  })
})

describe('component manager', () => {
  it('downloads, verifies and installs once; a second ensure reuses the installation', async () => {
    const bytes = archive()
    const fetchImpl = vi.fn(respond(bytes))
    const progress: number[] = []
    const instance = manager({ schemaVersion: 1, components: [entry(bytes)] }, fetchImpl, (_kind, received) => { progress.push(received) })
    const installed = await instance.ensure('python')
    expect(installed.state).toBe('installed')
    if (installed.state !== 'installed') throw new Error('not installed')
    expect(readFileSync(join(installed.path, 'README.txt'), 'utf8')).toBe('ok')
    expect(existsSync(join(installed.path, 'bin', 'tool.exe'))).toBe(true)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(bytes.length)
    const again = await instance.ensure('python')
    expect(again.state).toBe('installed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(instance.state('python').state).toBe('installed')
  })

  it('keeps a tar.gz archive as model.tar.gz instead of extracting it', async () => {
    const bytes = new Uint8Array([31, 139, 8, 0, 1, 2, 3])
    const instance = manager({ schemaVersion: 1, components: [entry(bytes, {
      kind: 'stt',
      version: 'vosk-model-small-pt-0.3',
      url: 'https://example.invalid/model.tar.gz',
      format: 'tar.gz',
    })] }, respond(bytes))
    const installed = await instance.ensure('stt')
    if (installed.state !== 'installed') throw new Error('not installed')
    expect(readFileSync(join(installed.path, 'model.tar.gz')).equals(Buffer.from(bytes))).toBe(true)
  })

  it('shares one download between concurrent callers', async () => {
    const bytes = archive()
    const fetchImpl = vi.fn(respond(bytes))
    const instance = manager({ schemaVersion: 1, components: [entry(bytes)] }, fetchImpl)
    const [first, second] = await Promise.all([instance.ensure('python'), instance.ensure('python')])
    expect(first.state).toBe('installed')
    expect(second.state).toBe('installed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuses a checksum mismatch and leaves nothing installed', async () => {
    const bytes = archive()
    const instance = manager({ schemaVersion: 1, components: [entry(bytes, { sha256: '0'.repeat(64) })] }, respond(bytes))
    expect(await instance.ensure('python')).toEqual({ state: 'failed', reason: 'checksum' })
    expect(instance.state('python')).toEqual({ state: 'failed', reason: 'checksum' })
  })

  it('reports offline when the request cannot be made', async () => {
    const bytes = archive()
    const instance = manager({ schemaVersion: 1, components: [entry(bytes)] }, async () => { throw new TypeError('fetch failed') })
    expect(await instance.ensure('python')).toEqual({ state: 'failed', reason: 'offline' })
  })

  it('reports http for a server error and for a truncated body', async () => {
    const bytes = archive()
    const failing = manager({ schemaVersion: 1, components: [entry(bytes)] }, respond(bytes, 500))
    expect(await failing.ensure('python')).toEqual({ state: 'failed', reason: 'http' })
    const truncated = manager({ schemaVersion: 1, components: [entry(bytes)] }, respond(bytes.slice(0, 10)))
    expect(await truncated.ensure('python')).toEqual({ state: 'failed', reason: 'http' })
  })

  it('removes an installed component', async () => {
    const bytes = archive()
    const instance = manager({ schemaVersion: 1, components: [entry(bytes)] }, respond(bytes))
    const installed = await instance.ensure('python')
    if (installed.state !== 'installed') throw new Error('not installed')
    await instance.remove('python')
    expect(existsSync(installed.path)).toBe(false)
    expect(instance.state('python')).toEqual({ state: 'absent' })
  })

  it('rejects a kind that is not in the manifest', async () => {
    const instance = manager({ schemaVersion: 1, components: [] }, respond(archive()))
    expect(() => instance.state('python')).toThrow(/not in the manifest/u)
  })
})

describe('components plugin', () => {
  it('is inert without a manifest and fails loud on ensure', () => {
    const instance = new PersonaComponents(new Context(), { manifestPath: '', root: '' })
    expect(instance.state('python')).toEqual({ state: 'absent' })
    expect(() => instance.ensure('python')).toThrow(/no manifest/u)
  })

  it('reads the manifest file and delegates to the manager', () => {
    const bytes = archive()
    const root = mkdtempSync(join(tmpdir(), 'components-plugin-'))
    roots.push(root)
    const manifestPath = join(root, 'components.json')
    writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, components: [entry(bytes)] }))
    const instance = new PersonaComponents(new Context(), { manifestPath, root: join(root, 'runtime') })
    expect(instance.state('python')).toEqual({ state: 'absent' })
    expect(() => instance.remove('python')).not.toThrow()
  })
})
