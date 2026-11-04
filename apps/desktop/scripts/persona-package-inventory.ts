/** Read-only inventory of Persona's archived files and physical runtime resources. */
import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { dirname, join, matchesGlob, resolve, sep } from 'node:path'
import { readAsar, type Node } from 'app-builder-lib/out/asar/asar.js'
import { DESKTOP_HOST_RUNTIME_FILES } from '../src/core-package-set.ts'
import { readDesktopRuntime, runtimePath } from '../src/runtime-tree.ts'
import { verifyRuntimeArchive } from './verify-runtime-archive.ts'

/** Required files that must exist even when a deficient preparation inventory omitted them. */
export const PERSONA_PACKAGE_REQUIRED_FILES = [
  'package.json', 'lib/main.js', 'lib/operation-report-worker.js',
  'lib/preload-app.cjs', 'lib/preload-mandatory.cjs', 'lib/preload-platform-account.cjs',
  'lib/preload-update-dialog.cjs', 'lib/preload-welcome.cjs',
  'renderer/persona-boot/boot.html', 'renderer/persona-boot/boot.js', 'renderer/persona-boot/boot.css',
  'renderer/persona-boot/boot-fonts.css',
  ...['symbol.svg', 'nunito-latin.woff2', 'fredoka-latin.woff2', 'atlas-erro.webp', 'atlas-disponivel.webp']
    .map(file => `renderer/persona-boot/assets/${file}`),
  'dsh/package.json', 'dsh/desktop-runtime.json',
  ...DESKTOP_HOST_RUNTIME_FILES.map(file => `dsh/node_modules/@deepseek-ai/dsh-desktop-host/${file}`),
  'dsh/node_modules/@deepseek-ai/dsh-persona-app/package.json',
  'dsh/node_modules/@deepseek-ai/dsh-persona-app/cordis.patch.yml',
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/package.json',
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-persona/lib/client.js',
] as const

/** Windows resources read outside app.asar by the shell and package-manager launcher. */
export const PERSONA_PACKAGE_EXTERNAL_FILES = [
  'icon.png', 'THIRD_PARTY_NOTICES.txt', 'tray.ico', 'tray-idle-32.png', 'tray-working-32.png',
  'tray-needs-you-32.png', 'tray-paused-32.png', 'runtime/versions.json', 'runtime/bin/node.cmd',
  'runtime/primary-runtime/runtime.json', 'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs',
] as const

/** Inventory findings; missing paths use app.asar: or resources: to identify their owner. */
export interface PersonaPackageInventory {
  readonly archive: string
  readonly files: readonly string[]
  readonly missing: readonly string[]
  /** Every dsh file matched the independently prepared bytes; external resources are checked for presence. */
  readonly integrityVerified: boolean
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Persona inventory: invalid ${subject}`)
  return value as Record<string, unknown>
}

function archivedPaths(node: Node, prefix: string, result: Map<string, Node>): void {
  if (node.files !== undefined) {
    for (const [name, child] of Object.entries(node.files)) archivedPaths(child, prefix === '' ? name : `${prefix}/${name}`, result)
  } else result.set(prefix, node)
}

function physicalFiles(directory: string, prefix: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) return physicalFiles(join(directory, entry.name), path)
    if (!entry.isFile()) throw new Error(`Persona inventory: unsupported resource ${path}`)
    // Empty Git directory markers are not runtime payload; builder excludes them.
    if (entry.name === '.gitkeep' && lstatSync(join(directory, entry.name)).size === 0) return []
    return [path]
  })
}

function descriptorPaths(value: unknown): string[] {
  const descriptor = object(value, 'runtime descriptor')
  if (!Array.isArray(descriptor.files)) throw new Error('Persona inventory: missing runtime file inventory')
  return descriptor.files.map((entry: unknown) => {
    const row = object(entry, 'runtime file')
    if (typeof row.path !== 'string') throw new Error('Persona inventory: missing runtime file path')
    runtimePath('.', row.path)
    return `dsh/${row.path}`
  })
}

function runtimeExports(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((entry: unknown) => runtimeExports(entry))
  return Object.entries(object(value, 'package exports'))
    .filter(([key]) => key !== 'types' && !key.startsWith('./src/'))
    .flatMap(([, entry]) => runtimeExports(entry))
}

/**
 * Check a real ASAR or win-unpacked directory without extraction, execution, or network.
 * Every sealed runtime file is required, including locales, templates, patches, and assets.
 * Package main/bin and dsh.bundle.patch declarations add requirements independently of the seal.
 * @param archiveOrDirectory - app.asar, or the win-unpacked directory containing resources/app.asar.
 * @param preparedDsh - Optional matching prepared dsh tree; when present, also verifies every dsh runtime byte
 * and requires all files from its sibling runtime directory. Omission checks the archived inventory only.
 * @returns Complete checked path list and missing paths; malformed archives or manifests throw.
 */
export async function inspectPersonaPackage(
  archiveOrDirectory: string,
  preparedDsh?: string,
): Promise<PersonaPackageInventory> {
  const archivePath = resolve(archiveOrDirectory.endsWith('.asar')
    ? archiveOrDirectory : join(archiveOrDirectory, 'resources', 'app.asar'))
  const archive = await readAsar(archivePath)
  const entries = new Map<string, Node>()
  archivedPaths(archive.header, '', entries)
  const required = new Set<string>(PERSONA_PACKAGE_REQUIRED_FILES)
  const descriptorPath = 'dsh/desktop-runtime.json'
  if (entries.has(descriptorPath)) {
    for (const file of descriptorPaths(JSON.parse((await archive.readFile(descriptorPath.split('/').join(sep))).toString()))) required.add(file)
  }
  if (preparedDsh !== undefined) {
    for (const file of readDesktopRuntime(preparedDsh).files) required.add(`dsh/${file.path}`)
  }
  for (const path of entries.keys()) {
    if (!/^dsh\/node_modules\/@deepseek-ai\/[^/]+\/package\.json$/u.test(path)) continue
    const manifest = object(JSON.parse((await archive.readFile(path.split('/').join(sep))).toString()), path)
    const base = path.slice(0, -'package.json'.length)
    const add = (file: string): void => {
      const local = file.replace(/^\.\//u, '')
      runtimePath('.', local)
      required.add(`${base}${local}`)
    }
    if (typeof manifest.main === 'string') add(manifest.main)
    for (const target of runtimeExports(manifest.exports)) {
      if (target.includes('*')) {
        const pattern = `${base}${target.replace(/^\.\//u, '').replaceAll('*', '**')}`
        if (![...entries.keys()].some(file => file.startsWith(base) && matchesGlob(file, pattern))) required.add(pattern)
      } else add(target)
    }
    if (typeof manifest.bin === 'string') add(manifest.bin)
    else if (manifest.bin !== undefined) {
      for (const value of Object.values(object(manifest.bin, `${path} bin`))) {
        if (typeof value !== 'string') throw new Error(`Persona inventory: invalid bin in ${path}`)
        add(value)
      }
    }
    if (manifest.dsh !== undefined) {
      const dsh = object(manifest.dsh, `${path} dsh`)
      if (dsh.bundle !== undefined) {
        const patch = object(dsh.bundle, `${path} bundle`).patch
        const patches = Array.isArray(patch) ? patch : [patch]
        for (const value of patches) {
          if (typeof value !== 'string') throw new Error(`Persona inventory: invalid bundle patch in ${path}`)
          add(value)
        }
      }
    }
  }
  const missing: string[] = []
  for (const file of required) {
    const node = entries.get(file)
    if (node === undefined || node.link !== undefined || (node.unpacked === true
      && (!existsSync(join(`${archivePath}.unpacked`, file)) || !lstatSync(join(`${archivePath}.unpacked`, file)).isFile()))) {
      missing.push(`app.asar:${file}`)
    }
  }
  const external = new Set<string>(PERSONA_PACKAGE_EXTERNAL_FILES)
  if (preparedDsh !== undefined) {
    const runtime = join(dirname(preparedDsh), 'runtime')
    for (const file of physicalFiles(runtime, '')) external.add(`runtime/${file}`)
  }
  for (const file of external) {
    const path = join(dirname(archivePath), file)
    if (!existsSync(path) || !lstatSync(path).isFile()) missing.push(`resources:${file}`)
  }
  let integrityVerified = false
  if (missing.length === 0 && preparedDsh !== undefined) {
    await verifyRuntimeArchive(archivePath, readDesktopRuntime(preparedDsh))
    integrityVerified = true
  }
  return {
    archive: archivePath,
    files: [...required].map(file => `app.asar:${file}`).concat([...external].map(file => `resources:${file}`)).sort(),
    missing: missing.sort(),
    integrityVerified,
  }
}

if (import.meta.main) {
  const target = process.argv[2]
  if (target === undefined) throw new Error('usage: persona-package-inventory.ts <app.asar|win-unpacked> [prepared-dsh]')
  const result = await inspectPersonaPackage(target, process.argv[3])
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.missing.length > 0 ? 1 : 0
}
