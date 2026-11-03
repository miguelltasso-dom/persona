#!/usr/bin/env node
/**
 * Persona UI asset pipeline (Prism). Masters live in persona-assets/ (not committed when large).
 * Outputs tracked derivatives under client-ui-persona/src/client/assets/ (≤ 10 MB total in git).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'persona-assets')
const OUT = join(ROOT, 'packages/persona/client-ui-persona/src/client/assets')
const MAX_GIT_BYTES = 10 * 1024 * 1024
const AVATAR_SIZES = [256, 96, 48]
const POSE_MAX_HEIGHT = 768

/** @type {Array<{ rel: string, bytes: number }>} */
const manifest = []

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

function track(rel, abs) {
  manifest.push({ rel: rel.replace(/\\/g, '/'), bytes: statSync(abs).size })
}

function copyRel(fromAbs, toRel) {
  const toAbs = join(OUT, toRel)
  ensureDir(dirname(toAbs))
  copyFileSync(fromAbs, toAbs)
  track(toRel, toAbs)
}

async function avatarDerivatives(name, fromAbs) {
  for (const size of AVATAR_SIZES) {
    const toRel = `avatars/${name}-${size}.webp`
    const toAbs = join(OUT, toRel)
    ensureDir(dirname(toAbs))
    await sharp(fromAbs)
      .resize(size, size, { fit: 'cover' })
      .webp({ quality: 82 })
      .toFile(toAbs)
    track(toRel, toAbs)
  }
}

async function poseDerivative(fromAbs, baseName) {
  const toRel = `poses/${baseName}.webp`
  const toAbs = join(OUT, toRel)
  ensureDir(dirname(toAbs))
  const meta = await sharp(fromAbs).metadata()
  const height = meta.height ?? POSE_MAX_HEIGHT
  const resize = height > POSE_MAX_HEIGHT ? { height: POSE_MAX_HEIGHT } : undefined
  let pipeline = sharp(fromAbs)
  if (resize) pipeline = pipeline.resize(resize)
  await pipeline.webp({ quality: 80 }).toFile(toAbs)
  track(toRel, toAbs)
}

function copyTree(relDir, filter) {
  const absDir = join(SRC, relDir)
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'concepts') continue
      copyTree(join(relDir, entry.name), filter)
      continue
    }
    const rel = join(relDir, entry.name).replace(/\\/g, '/')
    if (filter && !filter(entry.name, rel)) continue
    copyRel(join(absDir, entry.name), rel)
  }
}

const ASSET_URL_STUB = join(ROOT, 'packages/persona/client-ui-persona/src/client/assets/asset-url.ts')

async function main() {
  const assetUrlBackup = existsSync(ASSET_URL_STUB) ? readFileSync(ASSET_URL_STUB, 'utf8') : null
  rmSync(OUT, { recursive: true, force: true })
  ensureDir(OUT)
  if (assetUrlBackup !== null) {
    writeFileSync(ASSET_URL_STUB, assetUrlBackup)
  }

  copyTree('brand', (name, rel) => {
    const ext = extname(name).toLowerCase()
    if (rel.includes('concepts/')) return false
    return ext === '.svg' || ext === '.png'
  })

  copyTree('icons/nav', () => true)
  copyTree('icons/overlays', () => true)

  for (const rel of [
    'brand/banner-team-light.webp',
    'brand/banner-team-dark.webp',
    'brand/rail-foliage.webp',
    'brand/rail-foliage-light.webp',
    'brand/rail-foliage-dark.webp',
  ]) {
    const abs = join(SRC, rel)
    if (existsSync(abs)) copyRel(abs, rel)
  }
  const railLightIll = join(SRC, 'illustrations/rail-foliage-light.webp')
  const railDarkIll = join(SRC, 'illustrations/rail-foliage-dark.webp')
  if (!existsSync(join(SRC, 'brand/rail-foliage-light.webp')) && existsSync(railLightIll)) {
    copyRel(railLightIll, 'brand/rail-foliage-light.webp')
  }
  if (!existsSync(join(SRC, 'brand/rail-foliage-dark.webp')) && existsSync(railDarkIll)) {
    copyRel(railDarkIll, 'brand/rail-foliage-dark.webp')
  }

  // Muse: crisp illustration derivatives from Brush @2x masters (DESIGN-SYSTEM §7).
  const ILLUSTRATION_SPECS = [
    { from: 'illustrations/team-banner-light@2x.png', to: 'illustrations/team-banner-light.webp', width: 2400, quality: 84 },
    { from: 'illustrations/team-banner-dark@2x.png', to: 'illustrations/team-banner-dark.webp', width: 2400, quality: 84 },
    { from: 'illustrations/rail-foliage-light@2x.png', to: 'illustrations/rail-foliage-light.webp', width: 544, quality: 90 },
    { from: 'illustrations/rail-foliage-dark@2x.png', to: 'illustrations/rail-foliage-dark.webp', width: 544, quality: 90 },
  ]
  for (const spec of ILLUSTRATION_SPECS) {
    const fromAbs = join(SRC, spec.from)
    if (!existsSync(fromAbs)) continue
    const toAbs = join(OUT, spec.to)
    ensureDir(dirname(toAbs))
    await sharp(fromAbs).resize({ width: spec.width, withoutEnlargement: true }).webp({ quality: spec.quality, alphaQuality: 100 }).toFile(toAbs)
    track(spec.to, toAbs)
  }

  for (const file of readdirSync(join(SRC, 'avatars')).filter(f => f.endsWith('.png'))) {
    const stem = basename(file, '.png')
    await avatarDerivatives(stem, join(SRC, 'avatars', file))
  }

  for (const file of readdirSync(join(SRC, 'poses')).filter(f => f.endsWith('.png') && !f.startsWith('poses-preview-'))) {
    const stem = basename(file, '.png')
    await poseDerivative(join(SRC, 'poses', file), stem)
  }

  const totalBytes = manifest.reduce((sum, row) => sum + row.bytes, 0)
  const summary = {
    generatedAt: new Date().toISOString(),
    source: relative(ROOT, SRC),
    output: relative(ROOT, OUT),
    files: manifest.length,
    totalBytes,
    withinBudget: totalBytes <= MAX_GIT_BYTES,
  }
  writeFileSync(join(OUT, 'manifest.build.json'), `${JSON.stringify({ summary, files: manifest }, null, 2)}\n`)

  const poseFiles = manifest.filter(f => f.rel.startsWith('poses/') && f.rel.endsWith('.webp'))
  const avatar96 = manifest.filter(f => f.rel.match(/^avatars\/[^/]+-96\.webp$/u))
  const navIcons = manifest.filter(f => f.rel.startsWith('icons/nav/') && f.rel.endsWith('.svg'))
  const overlayIcons = manifest.filter(f => f.rel.startsWith('icons/overlays/') && f.rel.endsWith('.svg'))
  const bannerLight = manifest.find(f => f.rel === 'brand/banner-team-light.webp')
  const bannerDark = manifest.find(f => f.rel === 'brand/banner-team-dark.webp')
  const railFoliage = manifest.find(f => f.rel === 'brand/rail-foliage.webp')
  const railFoliageLight = manifest.find(f => f.rel === 'brand/rail-foliage-light.webp')
  const railFoliageDark = manifest.find(f => f.rel === 'brand/rail-foliage-dark.webp')

  /** @type {string[]} */
  const imports = []
  /** @type {string[]} */
  const poseRegs = []
  for (const { rel } of poseFiles) {
    const stem = basename(rel, '.webp')
    const [character, ...rest] = stem.split('-')
    const state = rest.join('-')
    if (!character || !state) continue
    const varName = stem.replace(/-/gu, '_')
    const key = `${character}-${state}`
    imports.push(`import pose_${varName} from './${rel}'`)
    poseRegs.push(`registerPoseUrl('${key}', pose_${varName})`)
  }
  /** @type {string[]} */
  const navEntries = []
  for (const { rel } of navIcons) {
    const id = basename(rel, '.svg')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import nav_${varName} from './${rel}'`)
    navEntries.push(`  '${id}': nav_${varName},`)
  }
  /** @type {string[]} */
  const avatarEntries = []
  for (const { rel } of avatar96) {
    const stem = basename(rel, '-96.webp')
    const varName = stem.replace(/-/gu, '_')
    imports.push(`import av96_${varName} from './${rel}'`)
    avatarEntries.push(`  '${stem}': av96_${varName},`)
  }
  /** @type {string[]} */
  const overlayEntries = []
  for (const { rel } of overlayIcons) {
    const id = basename(rel, '.svg')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import overlay_${varName} from './${rel}'`)
    overlayEntries.push(`  '${id}': overlay_${varName},`)
  }
  if (bannerLight !== undefined) {
    imports.push("import teamBannerLight from './brand/banner-team-light.webp'")
  }
  if (bannerDark !== undefined) {
    imports.push("import teamBannerDark from './brand/banner-team-dark.webp'")
  }
  if (railFoliage !== undefined) {
    imports.push("import railFoliage from './brand/rail-foliage.webp'")
  }
  if (railFoliageLight !== undefined) {
    imports.push("import railFoliageLight from './brand/rail-foliage-light.webp'")
  }
  if (railFoliageDark !== undefined) {
    imports.push("import railFoliageDark from './brand/rail-foliage-dark.webp'")
  }
  const illustrationFiles = manifest.filter(f => f.rel.startsWith('illustrations/') && f.rel.endsWith('.webp'))
  /** @type {string[]} */
  const illustrationEntries = []
  for (const { rel } of illustrationFiles) {
    const id = basename(rel, '.webp')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import ill_${varName} from './${rel}'`)
    illustrationEntries.push(`  '${id}': ill_${varName},`)
  }
  imports.push("import logoHorizontalLight from './brand/logo-horizontal-light.svg'")
  imports.push("import symbol from './brand/symbol.svg'")

  const lines = [
    '/** Generated by scripts/persona/build-assets.mjs — do not edit. */',
    "import { registerPoseUrl } from './asset-url.ts'",
    '',
    ...imports,
    '',
    ...poseRegs,
    '',
    'export const NAV_ICONS = {',
    ...navEntries,
    '} as const',
    '',
    'export const AVATAR_96 = {',
    ...avatarEntries,
    '} as const',
    '',
    'export const OVERLAY_ICONS = {',
    ...overlayEntries,
    '} as const',
    '',
    ...(bannerLight !== undefined ? ['export { teamBannerLight }', ''] : ['export const teamBannerLight: string | undefined = undefined', '']),
    ...(bannerDark !== undefined ? ['export { teamBannerDark }', ''] : ['export const teamBannerDark: string | undefined = undefined', '']),
    ...(railFoliage !== undefined ? ['export { railFoliage }', ''] : ['export const railFoliage: string | undefined = undefined', '']),
    ...(railFoliageLight !== undefined ? ['export { railFoliageLight }', ''] : ['export const railFoliageLight: string | undefined = undefined', '']),
    ...(railFoliageDark !== undefined ? ['export { railFoliageDark }', ''] : ['export const railFoliageDark: string | undefined = undefined', '']),
    '/** Brush illustrations (Muse, DESIGN-SYSTEM §7). */',
    'export const ILLUSTRATIONS: Readonly<Record<string, string>> = {',
    ...illustrationEntries,
    '}',
    '',
    'export { logoHorizontalLight, symbol }',
  ]
  writeFileSync(join(OUT, 'generated-imports.ts'), `${lines.join('\n')}\n`)

  console.log(`Wrote ${manifest.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB → ${relative(ROOT, OUT)}`)
  if (!summary.withinBudget) {
    console.error(`ERROR: asset budget exceeded (${MAX_GIT_BYTES} bytes max)`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
