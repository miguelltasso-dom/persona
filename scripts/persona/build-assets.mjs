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
// Keel 04/11: 12 MiB for the BR-P3 P1 poses + the last extras (art loads by URL per screen; nothing inlined in client.js).
const MAX_GIT_BYTES = 12 * 1024 * 1024
const AVATAR_SIZES = [256, 96, 48]
const POSE_MAX_HEIGHT = 480
/**
 * Muse (BR-P1, Keel D-067 opção b): life frames (blink/tail overlays, aceno, pensando) are only shown in the team strip at
 * 188 CSS px, so 376 px is an exact 2×. Overlays keep the base crop and are sized by CSS, so they stay pixel-aligned.
 */
const LIFE_POSE_MAX_HEIGHT = 376
/** Same art at q76 is indistinguishable at 3× zoom from q82 (br-p1/q-compare-blink.png) and ~18% lighter. */
const LIFE_POSE_QUALITY = 76
const LIFE_POSE = /-(?:disponivel-blink|disponivel-tail|acenando|pensando-\d)$/u

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

/** Opaque bounding box of a PNG (alpha > 8). */
async function alphaBox(fromAbs) {
  const { data, info } = await sharp(fromAbs).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  let left = info.width, top = info.height, right = -1, bottom = -1
  for (let y = 0; y < info.height; y++) {
    const row = y * info.width
    for (let x = 0; x < info.width; x++) {
      if (data[row + x] > 8) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return { left: 0, top: 0, width: info.width, height: info.height, full: { width: info.width, height: info.height } }
  return { left, top, width: right - left + 1, height: bottom - top + 1, full: { width: info.width, height: info.height } }
}

function unionBox(boxes) {
  const left = Math.min(...boxes.map(b => b.left))
  const top = Math.min(...boxes.map(b => b.top))
  const right = Math.max(...boxes.map(b => b.left + b.width))
  const bottom = Math.max(...boxes.map(b => b.top + b.height))
  return { left, top, width: right - left, height: bottom - top, full: boxes[0].full }
}

/**
 * Muse (DESIGN-SYSTEM §7): poses are trimmed to their opaque box (small top/side pad, feet on the bottom edge) so every
 * character stands on the same ground line; blink/tail frames reuse their base crop to stay pixel-aligned.
 */
async function poseDerivative(fromAbs, baseName, box) {
  const toRel = `poses/${baseName}.webp`
  const toAbs = join(OUT, toRel)
  ensureDir(dirname(toAbs))
  const pad = Math.round(box.full.height * 0.015)
  const left = Math.max(0, box.left - pad)
  const top = Math.max(0, box.top - pad)
  const width = Math.min(box.full.width - left, box.width + pad * 2)
  const height = Math.min(box.full.height - top, box.height + pad)
  let pipeline = sharp(fromAbs).extract({ left, top, width, height })
  const life = LIFE_POSE.test(baseName)
  const maxHeight = life ? LIFE_POSE_MAX_HEIGHT : POSE_MAX_HEIGHT
  if (height > maxHeight) pipeline = pipeline.resize({ height: maxHeight })
  await pipeline.webp({ quality: life ? LIFE_POSE_QUALITY : 82, alphaQuality: 100 }).toFile(toAbs)
  track(toRel, toAbs)
}

function copyTree(relDir, filter) {
  const absDir = join(SRC, relDir)
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // concepts = Brush drafts; launch = README/repo marketing art (never shipped in the app bundle).
      if (entry.name === 'concepts' || entry.name === 'launch') continue
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
    // Muse (BR-P1 budget): the app imports only brand SVGs (+ webp derivatives built below). Brand PNGs (share card,
    // app icon, logo rasters) serve the site/README/installer straight from persona-assets/ and cost ~1.1 MiB here.
    return ext === '.svg'
  })

  copyTree('icons/nav', () => true)
  // Muse: Brush UI action icons (WAVE2: ensinar, trocar-conta, mover-assunto) share the BrandIcon mask set.
  if (existsSync(join(SRC, 'icons/ui'))) copyTree('icons/ui', name => name.endsWith('.svg'))
  // Muse (BRIEFING 19): Segundo cérebro page-type icons, same mask set.
  if (existsSync(join(SRC, 'icons/brain'))) copyTree('icons/brain', name => name.endsWith('.svg'))
  copyTree('icons/overlays', () => true)
  if (existsSync(join(SRC, 'accents'))) copyTree('accents', name => name.endsWith('.svg'))
  if (existsSync(join(SRC, 'icons/flows'))) copyTree('icons/flows', name => name.endsWith('.svg'))
  // Muse (W2-8): Brush engine seals (own shapes, no vendor logos), full-color SVG.
  if (existsSync(join(SRC, 'icons/engines'))) copyTree('icons/engines', name => name.endsWith('.svg'))
  if (existsSync(join(SRC, 'icons/sectors'))) copyTree('icons/sectors', name => name.endsWith('.svg'))
  if (existsSync(join(SRC, 'icons/columns'))) copyTree('icons/columns', name => name.endsWith('.svg'))

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
    { from: 'textures/paper-light.png', to: 'textures/paper-light.webp', width: 512, quality: 88 },
    { from: 'textures/paper-dark.png', to: 'textures/paper-dark.webp', width: 512, quality: 88 },
    // Per-column empties by stage category (BOARDS-SPEC §2.2): prefer empty-col-<id>.png, fall back to empty-coluna-<pt>.png.
    ...[['todo', 'a-fazer'], ['doing', 'em-andamento'], ['review', 'em-revisao'], ['needs-you', ''], ['done', 'concluido'], ['blocked', 'bloqueado']].map(([id, pt]) => (
      {
        from: existsSync(join(SRC, `illustrations/empty-col-${id}.png`)) ? `illustrations/empty-col-${id}.png` : `illustrations/empty-coluna-${pt}.png`,
        to: `illustrations/empty-col-${id}.webp`,
        width: 360,
        quality: 86,
      }
    )),
    { from: 'illustrations/sprint-concluida.png', to: 'illustrations/sprint-concluida.webp', width: 640, quality: 86 },
    { from: 'illustrations/away-entregas.png', to: 'illustrations/away-entregas.webp', width: 640, quality: 86 },
    { from: 'illustrations/primeira-entrega.png', to: 'illustrations/primeira-entrega.webp', width: 640, quality: 86 },
    // Muse (WAVE2 Ensinar): consent/"Estudando" art, 320 px shown at 160 → 2×.
    ...['atlas', 'bento', 'nina', 'sol', 'luna'].map(animal => (
      { from: `illustrations/ensinar-${animal}.png`, to: `illustrations/ensinar-${animal}.webp`, width: 320, quality: 86 }
    )),
    // Muse (BRIEFING 19): Segundo cérebro home / empty state.
    { from: 'illustrations/bibliotecario.png', to: 'illustrations/bibliotecario.webp', width: 480, quality: 86 },
    // Muse (BR-P1 P2 nº 3–5, SIMPLE-WORKSPACE-SPEC): conflict, empty history, draft being prepared (480 shown at 240).
    ...['conflito-mesmo-arquivo', 'empty-historico', 'rascunho-trabalhando'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 480, quality: 86 }
    )),
    // Muse (BR-P3 P0, UX-BEYOND + the Miguel redesign): limit, remote team, access ended, applied, empty approvals (480 → 240).
    ...['empty-limite', 'empty-equipe-remota', 'acesso-encerrado', 'sucesso-aplicado', 'empty-aprovacoes', 'sucesso-skill-aprendida', 'sucesso-convite-aceito', 'sucesso-equipe-chegou'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 480, quality: 86 }
    )),
    { from: 'illustrations/spot-limite.png', to: 'illustrations/spot-limite.webp', width: 192, quality: 88 },
    // Muse (BR-P3 P1): the 6 Ajuda spots (192 → 96).
    ...['conectar-ia', 'contratar', 'ensinar', 'quadros', 'avisos', 'privacidade'].map(name => (
      { from: `illustrations/spot-ajuda-${name}.png`, to: `illustrations/spot-ajuda-${name}.webp`, width: 192, quality: 88 }
    )),
    // Muse (BR-P1 P2 nº 2): "Falta uma IA" spot for the composer banner (192 shown at 96).
    { from: 'illustrations/spot-sem-ia.png', to: 'illustrations/spot-sem-ia.webp', width: 192, quality: 88 },
    // Muse (kit de lançamento): "Sobre a Persona" team photo (Brush, brand/launch).
    { from: 'brand/launch/about-team.png', to: 'illustrations/about-team.webp', width: 960, quality: 86 },
    { from: 'brand/launch/release-notes-badge.png', to: 'illustrations/release-notes-badge.webp', width: 256, quality: 86 },
    ...['equipe-saudavel', 'ponto-unico-falha', 'voce-de-ferias'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 600, quality: 86 }
    )),
    ...['inbox', 'kanban', 'search', 'vault', 'routines', 'connections', 'error', 'dm', 'sem-ia'].map(name => (
      { from: `illustrations/empty-${name}.png`, to: `illustrations/empty-${name}.webp`, width: 480, quality: 86 }
    )),
  ]
  for (const spec of ILLUSTRATION_SPECS) {
    const fromAbs = join(SRC, spec.from)
    if (!existsSync(fromAbs)) continue
    const toAbs = join(OUT, spec.to)
    ensureDir(dirname(toAbs))
    await sharp(fromAbs).resize({ width: spec.width, withoutEnlargement: true }).webp({ quality: spec.quality, alphaQuality: 100 }).toFile(toAbs)
    track(spec.to, toAbs)
  }

  // Muse: reaction stickers (Brush: stickers/<animal>/<reaction>.png 256², legacy flat <animal>-<reaction>.png)
  // → stickers/<animal>-<reaction>.webp at 128 px (2× of the 64 px picker).
  const REACTIONS = new Set(['joinha', 'coracao', 'rindo', 'comemorando', 'pensando', 'feito'])
  const STICKER_FLAT = /^([a-z-]+)-(joinha|coracao|rindo|comemorando|pensando|feito)\.png$/u
  /** @type {{ from: string, id: string }[]} */
  const stickerSources = []
  const stickerRoot = join(SRC, 'stickers')
  if (existsSync(stickerRoot)) {
    for (const entry of readdirSync(stickerRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const file of readdirSync(join(stickerRoot, entry.name))) {
          const reaction = basename(file, '.png')
          if (file.endsWith('.png') && REACTIONS.has(reaction)) stickerSources.push({ from: join(stickerRoot, entry.name, file), id: `${entry.name}-${reaction}` })
        }
      } else {
        const match = STICKER_FLAT.exec(entry.name)
        if (match !== null) stickerSources.push({ from: join(stickerRoot, entry.name), id: `${match[1]}-${match[2]}` })
      }
    }
  }
  for (const { from, id } of stickerSources) {
    const rel = `stickers/${id}.webp`
    const toAbs = join(OUT, rel)
    ensureDir(dirname(toAbs))
    await sharp(from).resize({ width: 128, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 100 }).toFile(toAbs)
    track(rel, toAbs)
  }

  for (const file of readdirSync(join(SRC, 'avatars')).filter(f => f.endsWith('.png'))) {
    const stem = basename(file, '.png')
    await avatarDerivatives(stem, join(SRC, 'avatars', file))
  }

  // Muse (NOTIFICATIONS-SPEC §3): Windows toasts can't read webp via nativeImage, so the desktop gets 128² PNG faces.
  // Outside the client tree (not in its 10 MiB budget); Rivet ships apps/desktop/resources/notify-avatars/.
  const NOTIFY_OUT = join(ROOT, 'apps/desktop/resources/notify-avatars')
  rmSync(NOTIFY_OUT, { recursive: true, force: true })
  ensureDir(NOTIFY_OUT)
  for (const file of readdirSync(join(SRC, 'avatars')).filter(f => f.endsWith('.png') && !f.includes('-blink'))) {
    await sharp(join(SRC, 'avatars', file)).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false }).toFile(join(NOTIFY_OUT, file))
  }

  const poseSources = readdirSync(join(SRC, 'poses')).filter(f => f.endsWith('.png') && !f.startsWith('poses-preview-'))
  /** @type {Map<string, Awaited<ReturnType<typeof alphaBox>>>} */
  const boxes = new Map()
  for (const file of poseSources) boxes.set(basename(file, '.png'), await alphaBox(join(SRC, 'poses', file)))
  for (const file of poseSources) {
    const stem = basename(file, '.png')
    const family = stem.replace(/-disponivel(-blink|-tail)?$/u, '-disponivel')
    const familyBoxes = family.endsWith('-disponivel')
      ? [family, `${family}-blink`, `${family}-tail`].map(key => boxes.get(key)).filter(Boolean)
      : [boxes.get(stem)]
    await poseDerivative(join(SRC, 'poses', file), stem, unionBox(familyBoxes))
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
  const navIcons = manifest.filter(f => (f.rel.startsWith('icons/nav/') || f.rel.startsWith('icons/ui/') || f.rel.startsWith('icons/brain/')) && f.rel.endsWith('.svg'))
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
  const engineFiles = manifest.filter(f => f.rel.startsWith('icons/engines/') && f.rel.endsWith('.svg'))
  /** @type {string[]} */
  const engineEntries = []
  for (const { rel } of engineFiles) {
    const id = basename(rel, '.svg')
    imports.push(`import engineicon_${id.replace(/-/gu, '_')} from './${rel}'`)
    engineEntries.push(`  '${id}': engineicon_${id.replace(/-/gu, '_')},`)
  }
  const flowFiles = manifest.filter(f => f.rel.startsWith('icons/flows/') && f.rel.endsWith('.svg'))
  /** @type {string[]} */
  const flowEntries = []
  for (const { rel } of flowFiles) {
    const id = basename(rel, '.svg')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import flowicon_${varName} from './${rel}'`)
    flowEntries.push(`  '${id}': flowicon_${varName},`)
  }
  const sectorFiles = manifest.filter(f => f.rel.startsWith('icons/sectors/') && f.rel.endsWith('.svg'))
  /** @type {string[]} */
  const sectorEntries = []
  for (const { rel } of sectorFiles) {
    const id = basename(rel, '.svg')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import sectoricon_${varName} from './${rel}'`)
    sectorEntries.push(`  '${id}': sectoricon_${varName},`)
  }
  const columnFiles = manifest.filter(f => f.rel.startsWith('icons/columns/') && f.rel.endsWith('.svg'))
  /** @type {string[]} */
  const columnEntries = []
  for (const { rel } of columnFiles) {
    const id = basename(rel, '.svg')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import columnicon_${varName} from './${rel}'`)
    columnEntries.push(`  '${id}': columnicon_${varName},`)
  }
  const accentFiles = manifest.filter(f => f.rel.startsWith('accents/') && f.rel.endsWith('.svg'))
  /** @type {string[]} */
  const accentEntries = []
  for (const { rel } of accentFiles) {
    const id = basename(rel, '.svg')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import accent_${varName} from './${rel}'`)
    accentEntries.push(`  '${id}': accent_${varName},`)
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
  const stickerFiles = manifest.filter(f => f.rel.startsWith('stickers/') && f.rel.endsWith('.webp'))
  /** @type {string[]} */
  const stickerEntries = []
  for (const { rel } of stickerFiles) {
    const id = basename(rel, '.webp')
    const varName = id.replace(/-/gu, '_')
    imports.push(`import sticker_${varName} from './${rel}'`)
    stickerEntries.push(`  '${id}': sticker_${varName},`)
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
    '/** Brush workflow-model icons, currentColor SVG (Muse, BOARDS-SPEC §6). */',
    '/** Brush engine seals keyed by runner id (claude, codex, cursor, opencode, gemini, grok, deepseek, openrouter, ollama, dsh). */',
    'export const ENGINE_ICONS: Readonly<Record<string, string>> = {',
    ...engineEntries,
    '}',
    '',
    'export const FLOW_ICONS: Readonly<Record<string, string>> = {',
    ...flowEntries,
    '}',
    '',
    '/** Brush sector icons, currentColor SVG (Muse, GOVERNANCE-SPEC). */',
    'export const SECTOR_ICONS: Readonly<Record<string, string>> = {',
    ...sectorEntries,
    '}',
    '',
    '/** Brush stage-column icons, currentColor SVG (Muse, BOARDS-SPEC §0). */',
    'export const COLUMN_ICONS: Readonly<Record<string, string>> = {',
    ...columnEntries,
    '}',
    '',
    '/** Brush hand-drawn accents, currentColor SVG (Muse, DESIGN-SYSTEM §5). */',
    'export const ACCENTS: Readonly<Record<string, string>> = {',
    ...accentEntries,
    '}',
    '',
    '/** Brush reaction stickers keyed `<animal>-<reaction>` (Muse; reactions: joinha, coracao, rindo, comemorando, pensando, feito). */',
    'export const STICKERS: Readonly<Record<string, string>> = {',
    ...stickerEntries,
    '}',
    '',
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
