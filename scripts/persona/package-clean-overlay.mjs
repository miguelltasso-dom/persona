/**
 * D-071 packaging overlay for scripts/persona/package-clean.mjs.
 *
 * The installer is built from a PUBLISHED, green commit checked out in an isolated worktree. This module therefore never
 * reads the shared (dirty) checkout: `applyOverlay` receives only the worktree path, so it cannot copy a source file from
 * anywhere else. Everything it does is one of:
 *
 *   (a) a BUILD adaptation of apps/desktop/scripts/electron-builder-config.mjs (and the host manifest) that an OLDER commit
 *       may still lack: it is applied only when missing, and the result is verified, so a commit that already has the
 *       adaptation (every commit since a1dccb5f8f) passes through untouched;
 *   (b) the test-only cast of the "Sobre a Persona" client spec, taken from the commit's OWN scripts/persona/pack-overlay/
 *       copy (not from the shared checkout) and only while the committed spec still has the uncasted JSX;
 *
 * Build outputs ignored by git (apps/web/dist, vendor/loader/lib) are NOT seeded: the build in the worktree produces them
 * (gates host-src → host-bundle for vendor/loader, gate `web` for apps/web/dist; see scripts/build.ts).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Client spec that `tsc -p tsconfig.client.json` (aggregate check, run inside the pack build) rejects with TS2698 when uncasted. */
export const ABOUT_SPEC = 'packages/persona/client-ui-persona/tests/persona-about-settings.client.spec.tsx'
/** The commit's own casted copy of that spec. */
export const ABOUT_SPEC_CASTED = 'scripts/persona/pack-overlay/persona-about-settings.client.spec.tsx'

const INSTALLER_OLD = "include: fileURLToPath(new URL('./installer.nsh', import.meta.url)),"
const INSTALLER_NEW = "include: fileURLToPath(new URL('./installer-select.nsh', import.meta.url)),"
const FRAME_OLD = `      if (windowsSigner !== undefined) {
        await windowsSigner({ path: join(buildPaths.root, 'installer-ui', 'window-frame.dll'), hash: 'sha256', isNest: false })
      }`
const FRAME_NEW = `      const frameDll = join(buildPaths.root, 'installer-ui', 'window-frame.dll')
      if (windowsSigner !== undefined && existsSync(frameDll)) {
        await windowsSigner({ path: frameDll, hash: 'sha256', isNest: false })
      }`

/**
 * Convert the LF literals above to the line endings of the file being patched.
 * @param text - Text with LF line breaks.
 * @param like - File content whose EOL convention to follow.
 * @returns `text` with the same line endings as `like`.
 */
function sameEol(text, like) {
  return like.includes('\r\n') ? text.replaceAll('\n', '\r\n') : text
}

/**
 * Check that a builder config carries every build adaptation the unsigned, non-elevated Persona installer needs.
 * @param cfg - Content of apps/desktop/scripts/electron-builder-config.mjs.
 * @returns Names of the adaptations still missing (empty when complete).
 */
export function missingBuilderAdaptations(cfg) {
  const missing = []
  if (!cfg.includes("'./installer-select.nsh'")) missing.push('installer-select.nsh include')
  if (!cfg.includes('existsSync(frameDll)')) missing.push('optional window-frame.dll signing guard')
  if (!/packElevateHelper:\s*false/u.test(cfg)) missing.push('packElevateHelper:false')
  return missing
}

/**
 * List relative imports (static or `import()`) of a module that do not exist in the checkout.
 * electron-builder-config.mjs is plain JS pulled in at pack time (afterPack runs ~15 min into the build), so no type-check
 * gate would notice a file that was never committed (e.g. persona-mingit.mjs).
 * @param file - Absolute path of the module.
 * @param text - Its content.
 * @returns Absolute paths of the missing imports.
 */
export function missingRelativeImports(file, text) {
  const missing = []
  for (const match of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/gu)) {
    const target = resolve(dirname(file), match[1])
    // `lib/` holds build outputs (git-ignored); the pack's own build produces them before the config is loaded.
    if (/[\\/]lib[\\/]/u.test(target)) continue
    if (!existsSync(target)) missing.push(target)
  }
  return [...new Set(missing)]
}

/**
 * Apply the remaining pack-only adaptations to a clean worktree of a published commit.
 * @param wt - Root of the isolated worktree (the only tree this function touches).
 * @returns `applied` = what this call changed; `inSource` = what the commit already had (nothing to do).
 * @throws If an adaptation cannot be made, rather than packaging a wrongly configured installer.
 */
export function applyOverlay(wt) {
  const applied = []
  const inSource = []
  const desktop = join(wt, 'apps', 'desktop')
  const scripts = join(desktop, 'scripts')

  // Host manifest: the runtime needs config/electron.cordis.patch.yml inside the published package.
  const hostManifestPath = join(wt, 'apps', 'desktop-host', 'package.json')
  const hostManifest = JSON.parse(readFileSync(hostManifestPath, 'utf8'))
  if (Array.isArray(hostManifest.files) && hostManifest.files.includes('config/')) {
    inSource.push('desktop-host/package.json files=config/')
  } else {
    hostManifest.files = [...new Set([...(hostManifest.files ?? []), 'config/'])]
    writeFileSync(hostManifestPath, `${JSON.stringify(hostManifest, null, 2)}\n`)
    applied.push('desktop-host/package.json files=config/')
  }
  if (!existsSync(join(wt, 'apps', 'desktop-host', 'config', 'electron.cordis.patch.yml'))) {
    throw new Error('overlay: apps/desktop-host/config/electron.cordis.patch.yml is not in the commit; publish it (D-071 forbids copying it from the shared checkout)')
  }

  // electron-builder config: unsigned, per-user, non-elevated installer.
  const ebc = join(scripts, 'electron-builder-config.mjs')
  const original = readFileSync(ebc, 'utf8')
  let cfg = original
  if (cfg.includes(INSTALLER_OLD)) cfg = cfg.replace(INSTALLER_OLD, INSTALLER_NEW)
  const frameOld = sameEol(FRAME_OLD, cfg)
  if (cfg.includes(frameOld)) {
    cfg = cfg.replace(frameOld, sameEol(FRAME_NEW, cfg))
    if (!/import \{[^}]*\bexistsSync\b[^}]*\} from 'node:fs'/u.test(cfg)) {
      cfg = cfg.replace("import { readFileSync } from 'node:fs'", "import { existsSync, readFileSync } from 'node:fs'")
    }
  }
  if (!/packElevateHelper:\s*false/u.test(cfg)) cfg = cfg.replace('allowElevation: false,', 'allowElevation: false,\n      packElevateHelper: false,')
  const stillMissing = missingBuilderAdaptations(cfg)
  if (stillMissing.length > 0) {
    throw new Error(`overlay: electron-builder-config.mjs of this commit cannot be adapted (missing: ${stillMissing.join(', ')}); fix it in source and publish`)
  }
  if (cfg.includes("'./installer-select.nsh'") && !existsSync(join(scripts, 'installer-select.nsh'))) {
    throw new Error('overlay: installer-select.nsh is not in the commit; publish it (D-071 forbids copying it from the shared checkout)')
  }
  const absent = missingRelativeImports(ebc, cfg)
  if (absent.length > 0) {
    throw new Error(`overlay: electron-builder-config.mjs imports files that are not in the commit: ${absent.map(path => path.replace(wt, '.')).join(', ')}; commit them (D-071 forbids copying from the shared checkout)`)
  }
  if (cfg === original) {
    inSource.push('electron-builder-config.mjs (installer-select include, window-frame.dll guard, packElevateHelper:false)')
  } else {
    writeFileSync(ebc, cfg)
    applied.push('electron-builder-config.mjs')
  }

  // Client spec (test only): see ABOUT_SPEC.
  const spec = join(wt, ABOUT_SPEC)
  const casted = join(wt, ABOUT_SPEC_CASTED)
  if (existsSync(spec) && existsSync(casted) && readFileSync(spec, 'utf8').includes('<PersonaAboutSettingsSection')) {
    copyFileSync(casted, spec)
    applied.push('persona-about-settings.client.spec.tsx (cast, from the commit\'s own pack-overlay copy)')
  } else {
    inSource.push('persona-about-settings.client.spec.tsx')
  }

  return { applied, inSource }
}
