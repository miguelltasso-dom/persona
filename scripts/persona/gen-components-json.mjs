#!/usr/bin/env node
/**
 * Write the on-demand component manifest the application ships (persona-spec/contracts/on-demand-runtime.md §4 and §11).
 *
 * The pinned entries below are the components the app downloads from a published URL; the voice model (`stt`) is the official Vosk
 * pt-BR zip, measured against the published file on 11/11/2026. The release builder adds the archives it packs itself (LibreOffice,
 * Python, MinGit, pnpm) with `--from <built components.json>`; a pinned entry always wins, so the server can never change the source.
 *
 * Usage: node scripts/persona/gen-components-json.mjs [--out <path>] [--from <path>] [--print]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Kinds the host knows; keep in sync with packages/persona/persona-components/src/manifest.ts. */
const KINDS = new Set(['libreoffice', 'python', 'mingit', 'pnpm', 'stt'])

/** Components downloaded from a published URL, with the integrity facts pinned in the app. */
export const PINNED_COMPONENTS = [
  {
    kind: 'stt',
    version: 'vosk-model-small-pt-0.3',
    url: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz',
    sha256: '499771532fc4c5fc9d7657003a4193275c7f3561a6ccda9226f1d427c010887c',
    bytes: 32_440_432,
    format: 'tar.gz',
  },
]

/**
 * Validate one manifest entry.
 * @param {unknown} value - Parsed entry.
 * @returns {{ kind: string, version: string, url: string, sha256: string, bytes: number, format?: string }} The entry.
 */
function entry(value) {
  if (value === null || typeof value !== 'object') throw new Error('components: entry is not an object')
  const { kind, version, url, sha256, bytes, format } = /** @type {Record<string, unknown>} */ (value)
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw new Error(`components: invalid kind ${String(kind)}`)
  if (typeof version !== 'string' || version === '') throw new Error(`components: invalid version for ${kind}`)
  if (typeof url !== 'string' || !/^https:\/\//u.test(url)) throw new Error(`components: invalid url for ${kind}`)
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(sha256)) throw new Error(`components: invalid sha256 for ${kind}`)
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`components: invalid bytes for ${kind}`)
  if (format !== undefined && format !== 'zip' && format !== 'tar.gz') throw new Error(`components: invalid format for ${kind}`)
  return { kind, version, url, sha256, bytes, ...(format === undefined ? {} : { format }) }
}

/**
 * Build the manifest, pinned entries first and one entry per kind.
 * @param {ReadonlyArray<unknown>} extra - Entries built by the release (archives packed from the tree).
 * @returns {{ schemaVersion: 1, components: ReadonlyArray<{ kind: string, version: string, url: string, sha256: string, bytes: number }> }}
 */
export function componentManifest(extra = []) {
  const byKind = new Map()
  for (const value of [...extra, ...PINNED_COMPONENTS]) {
    const row = entry(value)
    byKind.set(row.kind, row)
  }
  return { schemaVersion: 1, components: [...byKind.values()] }
}

/**
 * Read the entries of a built manifest.
 * @param {string} path - JSON written by the release builder.
 * @returns {ReadonlyArray<unknown>} Its components.
 */
function readBuilt(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.components)) {
    throw new Error(`components: ${path} has no components array`)
  }
  return parsed.components
}

function main(argv) {
  const at = (flag) => {
    const index = argv.indexOf(flag)
    return index === -1 ? undefined : argv[index + 1]
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const out = resolve(at('--out') ?? join(root, 'dist', 'components.json'))
  const from = at('--from')
  const manifest = componentManifest(from === undefined ? [] : readBuilt(resolve(from)))
  const text = `${JSON.stringify(manifest, null, 2)}\n`
  if (argv.includes('--print')) {
    process.stdout.write(text)
    return
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, text)
  console.log(`components: ${String(manifest.components.length)} entries written to ${out}`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
