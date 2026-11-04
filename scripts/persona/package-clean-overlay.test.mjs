// node --test scripts/persona/package-clean-overlay.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { ABOUT_SPEC, ABOUT_SPEC_CASTED, applyOverlay, missingBuilderAdaptations } from './package-clean-overlay.mjs'

const ADAPTED_CONFIG = `import { existsSync, readFileSync } from 'node:fs'
export const x = {
  nsis: {
    include: fileURLToPath(new URL('./installer-select.nsh', import.meta.url)),
    allowElevation: false,
    packElevateHelper: false,
  },
  async sign() {
      const frameDll = join(buildPaths.root, 'installer-ui', 'window-frame.dll')
      if (windowsSigner !== undefined && existsSync(frameDll)) {
        await windowsSigner({ path: frameDll, hash: 'sha256', isNest: false })
      }
  },
}
`
const LEGACY_CONFIG = `import { readFileSync } from 'node:fs'
export const x = {
  nsis: {
    include: fileURLToPath(new URL('./installer.nsh', import.meta.url)),
    allowElevation: false,
  },
  async sign() {
      if (windowsSigner !== undefined) {
        await windowsSigner({ path: join(buildPaths.root, 'installer-ui', 'window-frame.dll'), hash: 'sha256', isNest: false })
      }
  },
}
`
const UNCASTED_SPEC = '<PersonaAboutSettingsSection labels={x} />'
const CASTED_SPEC = 'const AboutSection = PersonaAboutSettingsSection as never\n<AboutSection labels={x} />'

/**
 * Build a throwaway worktree with the files the overlay looks at.
 * @param options - Which files to include and how.
 * @returns Root of the fixture.
 */
function fixture({ config = ADAPTED_CONFIG, files = ['config/'], nsh = true, patch = true, spec = UNCASTED_SPEC } = {}) {
  const wt = mkdtempSync(join(tmpdir(), 'pc-overlay-'))
  const put = (rel, text) => {
    mkdirSync(dirname(join(wt, rel)), { recursive: true })
    writeFileSync(join(wt, rel), text)
  }
  put('apps/desktop-host/package.json', JSON.stringify({ name: 'host', files: ['lib/index.js', ...files] }, null, 2))
  if (patch) put('apps/desktop-host/config/electron.cordis.patch.yml', 'plugins: {}\n')
  put('apps/desktop/scripts/electron-builder-config.mjs', config)
  if (nsh) put('apps/desktop/scripts/installer-select.nsh', '; nsh\n')
  put(ABOUT_SPEC, spec)
  put(ABOUT_SPEC_CASTED, CASTED_SPEC)
  return wt
}

test('commit already adapted: nothing is rewritten except the uncasted client spec', () => {
  const wt = fixture()
  try {
    const before = readFileSync(join(wt, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8')
    const { applied, inSource } = applyOverlay(wt)
    assert.deepEqual(applied.map(entry => entry.split(' ')[0]), ['persona-about-settings.client.spec.tsx'])
    assert.ok(inSource.some(entry => entry.startsWith('electron-builder-config.mjs')))
    assert.ok(inSource.includes('desktop-host/package.json files=config/'))
    assert.equal(readFileSync(join(wt, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8'), before)
    assert.equal(readFileSync(join(wt, ABOUT_SPEC), 'utf8'), CASTED_SPEC)
  } finally { rmSync(wt, { recursive: true, force: true }) }
})

test('commit with the casted spec already: the overlay is a complete no-op', () => {
  const wt = fixture({ spec: CASTED_SPEC })
  try {
    const { applied, inSource } = applyOverlay(wt)
    assert.deepEqual(applied, [])
    assert.equal(inSource.length, 3)
  } finally { rmSync(wt, { recursive: true, force: true }) }
})

for (const eol of ['\n', '\r\n']) {
  test(`legacy commit (${eol === '\n' ? 'LF' : 'CRLF'}): builder config and host manifest are adapted and verified`, () => {
    const wt = fixture({ config: LEGACY_CONFIG.replaceAll('\n', eol), files: [] })
    try {
      assert.equal(missingBuilderAdaptations(LEGACY_CONFIG).length, 3)
      const { applied } = applyOverlay(wt)
      assert.ok(applied.includes('electron-builder-config.mjs'))
      assert.ok(applied.includes('desktop-host/package.json files=config/'))
      const cfg = readFileSync(join(wt, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8')
      assert.deepEqual(missingBuilderAdaptations(cfg), [])
      assert.match(cfg, /import \{ existsSync, readFileSync \} from 'node:fs'/u)
      assert.deepEqual(JSON.parse(readFileSync(join(wt, 'apps/desktop-host/package.json'), 'utf8')).files, ['lib/index.js', 'config/'])
      // idempotent: a second pass changes nothing
      const second = applyOverlay(wt)
      assert.deepEqual(second.applied.filter(entry => !entry.startsWith('persona-about')), [])
    } finally { rmSync(wt, { recursive: true, force: true }) }
  })
}

test('fails fast instead of packaging a wrongly configured installer', () => {
  const noNsh = fixture({ nsh: false })
  const noPatch = fixture({ patch: false })
  const unfixable = fixture({ config: 'export const x = {}\n' })
  try {
    assert.throws(() => applyOverlay(noNsh), /installer-select\.nsh is not in the commit/u)
    assert.throws(() => applyOverlay(noPatch), /electron\.cordis\.patch\.yml is not in the commit/u)
    assert.throws(() => applyOverlay(unfixable), /cannot be adapted/u)
  } finally {
    for (const wt of [noNsh, noPatch, unfixable]) rmSync(wt, { recursive: true, force: true })
  }
})

test('fails fast when the builder config imports a file the commit does not carry', () => {
  const wt = fixture({ config: `${ADAPTED_CONFIG}
const lazy = await import('./persona-mingit.mjs')
` })
  try {
    assert.throws(() => applyOverlay(wt), /imports files that are not in the commit: .*persona-mingit\.mjs/u)
    mkdirSync(join(wt, 'apps/desktop/scripts'), { recursive: true })
    writeFileSync(join(wt, 'apps/desktop/scripts/persona-mingit.mjs'), 'export {}\n')
    assert.doesNotThrow(() => applyOverlay(wt))
  } finally { rmSync(wt, { recursive: true, force: true }) }
})
