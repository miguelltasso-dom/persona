import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  inspectPersonaPackage, PERSONA_PACKAGE_EXTERNAL_FILES, PERSONA_PACKAGE_REQUIRED_FILES,
} from '../scripts/persona-package-inventory.ts'
import { writeDesktopRuntime } from '../src/runtime-tree.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

vi.mock('/apps/desktop/lib/types/runtime-tree.js', async () => import('../src/runtime-tree.ts'))

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const { createPackageWithOptions } = builderRequire('@electron/asar') as {
  createPackageWithOptions: (source: string, archive: string, options: { unpack?: string }) => Promise<void>
}
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('unexpected fixture root')
    rmSync(root, { recursive: true, force: true })
  }
})

function put(root: string, path: string, body = ''): void {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
}

async function fixture(omit: readonly string[] = [], unpackNative = false): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'persona-inventory-'))
  roots.push(root)
  const source = join(root, 'source')
  const packed = join(root, 'win-unpacked')
  const resources = join(packed, 'resources')
  for (const file of PERSONA_PACKAGE_REQUIRED_FILES) {
    put(source, file, file.endsWith('package.json') ? '{}' : '')
  }
  const locale = 'node_modules/@deepseek-ai/dsh-client-ui-persona/locale/pt-BR.json'
  put(source, `dsh/${locale}`, '{}')
  const files = [{ path: locale }]
  if (unpackNative) {
    files.push({ path: 'node_modules/native/native.node' })
    put(source, 'dsh/node_modules/native/native.node', 'native fixture')
  }
  put(source, 'dsh/desktop-runtime.json', JSON.stringify({ files }))
  put(source, 'dsh/node_modules/@deepseek-ai/dsh-persona-app/package.json', JSON.stringify({
    name: '@deepseek-ai/dsh-persona-app', main: 'lib/index.js',
    dsh: { bundle: { patch: ['./cordis.patch.yml', './presets/extra.patch.yml'] } },
  }))
  put(source, 'dsh/node_modules/@deepseek-ai/dsh-persona-app/lib/index.js', 'export {}')
  put(source, 'dsh/node_modules/@deepseek-ai/dsh-persona-app/presets/extra.patch.yml', '[]')
  put(source, 'dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/package.json', JSON.stringify({
    exports: { './client': { types: './lib/types/client.d.ts', default: './lib/client.js' },
      './remote': './lib/remote.js', './assets/*': './lib/assets/*', './src/*': './src/*' },
  }))
  put(source, 'dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/lib/remote.js', 'export {}')
  put(source, 'dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/lib/assets/avatars/guia.svg', '<svg/>')
  for (const file of PERSONA_PACKAGE_EXTERNAL_FILES) put(resources, file)
  for (const file of omit) {
    const [owner, ...parts] = file.split(':')
    rmSync(join(owner === 'resources' ? resources : source, parts.join(':')))
  }
  await createPackageWithOptions(source, join(resources, 'app.asar'), unpackNative ? { unpack: '**/native.node' } : {})
  return packed
}

it('includes the private host config directory in the source package allowlist', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../desktop-host/package.json', import.meta.url), 'utf8')) as { files: string[] }
  expect(manifest.files).toContain('config/')
})

it('reads a real ASAR and inventories sealed files plus manifest-declared patches and entries', async () => {
  const result = await inspectPersonaPackage(await fixture())
  expect(result.missing).toEqual([])
  expect(result.integrityVerified).toBe(false)
  expect(result.files).toContain('app.asar:dsh/node_modules/@deepseek-ai/dsh-persona-app/presets/extra.patch.yml')
  expect(result.files).toContain('app.asar:dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/locale/pt-BR.json')
})

it('rejects an ASAR that omitted electron.cordis.patch.yml even when its seal also omitted it', async () => {
  const missing = 'app.asar:dsh/node_modules/@deepseek-ai/dsh-desktop-host/config/electron.cordis.patch.yml'
  const result = await inspectPersonaPackage(await fixture([missing]))
  expect(result.missing).toEqual([missing])
})

it.each([
  'app.asar:dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/locale/pt-BR.json',
  'app.asar:dsh/node_modules/@deepseek-ai/dsh-persona-app/presets/extra.patch.yml',
  'app.asar:dsh/node_modules/@deepseek-ai/dsh-persona-app/lib/index.js',
  'app.asar:dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/lib/remote.js',
  'app.asar:renderer/persona-boot/assets/atlas-erro.webp',
  'resources:runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs',
])('reports the exact omitted runtime file: %s', async (missing) => {
  expect((await inspectPersonaPackage(await fixture([missing]))).missing).toEqual([missing])
})

it('accepts an app.asar filename as well as the win-unpacked directory', async () => {
  const packed = await fixture()
  expect((await inspectPersonaPackage(join(packed, 'resources/app.asar'))).missing).toEqual([])
})

it('requires the physical unpacked native file even when its ASAR entry exists', async () => {
  const packed = await fixture([], true)
  expect((await inspectPersonaPackage(packed)).missing).toEqual([])
  rmSync(join(packed, 'resources/app.asar.unpacked/dsh/node_modules/native/native.node'))
  expect((await inspectPersonaPackage(packed)).missing).toEqual([
    'app.asar:dsh/node_modules/native/native.node',
  ])
})

async function runAfterPack(packed: string): Promise<void> {
  const source = join(dirname(packed), 'source')
  const dsh = join(source, 'dsh')
  const names = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host']
  for (const name of names) put(dsh, `node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0' }))
  writeDesktopRuntime(dsh, {
    schemaVersion: 1, version: '1.0.0', nodeVersion: '24.17.0', pnpmVersion: '11.7.0',
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  }, names, { platform: 'win32', arch: 'x64' })
  for (const file of PERSONA_PACKAGE_EXTERNAL_FILES) if (file.startsWith('runtime/')) put(source, file)
  put(source, 'runtime/primary-runtime/dependencies/pnpm/.gitkeep')
  await createPackageWithOptions(source, join(packed, 'resources/app.asar'), {})
  const config = createElectronBuilderConfig({
    DSH_DESKTOP_APP_ID: 'com.example.personainventory', DSH_DESKTOP_UNSIGNED: '1',
  }, 'win32', 'x64', dsh, '1.0.0')
  await config.afterPack({ appOutDir: packed, packager: { getResourcesDir: () => join(packed, 'resources') } } as never)
}

it('the shipping afterPack hook accepts a complete fixture with the real inspector', async () => {
  await expect(runAfterPack(await fixture())).resolves.toBeUndefined()
})

it('the shipping afterPack hook stops on missing files and reports their total and at most ten paths', async () => {
  const omitted = PERSONA_PACKAGE_REQUIRED_FILES.filter(file => !file.startsWith('dsh/')).slice(0, 12)
  const packed = await fixture(omitted.map(file => `app.asar:${file}`))
  const failure = await runAfterPack(packed).then(() => undefined, (error: unknown) => error)
  expect(failure).toBeInstanceOf(Error)
  if (!(failure instanceof Error)) throw new Error('missing package did not fail')
  expect(failure.message).toContain('12 missing runtime files')
  expect(failure.message.match(/app\.asar:/gu)).toHaveLength(10)
})
