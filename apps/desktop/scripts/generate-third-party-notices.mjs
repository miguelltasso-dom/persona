/**
 * Write apps/desktop/resources/THIRD_PARTY_NOTICES.txt from production deps.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectProductionNotices,
  formatThirdPartyNoticesFile,
} from '../src/third-party-notices.ts'
import { PERSONA_DESKTOP_NOTICES } from '../src/legal-notices.ts'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))
const dest = join(desktopRoot, 'resources/THIRD_PARTY_NOTICES.txt')
const root = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
const requireFromDesktop = createRequire(join(desktopRoot, 'package.json'))

function readManifest(name) {
  try {
    return JSON.parse(readFileSync(requireFromDesktop.resolve(`${name}/package.json`), 'utf8'))
  } catch {
    const entry = requireFromDesktop.resolve(name)
    return JSON.parse(readFileSync(join(dirname(entry), 'package.json'), 'utf8'))
  }
}

const resolved = Object.keys(root.dependencies ?? {}).map(name => ({
  name,
  license: readManifest(name).license,
}))
const notices = [
  ...collectProductionNotices(root, resolved),
  ...PERSONA_DESKTOP_NOTICES.map(item => ({
    name: item.name,
    license: item.license,
    text: item.note,
  })),
]
writeFileSync(dest, formatThirdPartyNoticesFile(notices))
process.stdout.write(`${dest}\n${String(notices.length)} notices\n`)
