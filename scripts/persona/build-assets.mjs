#!/usr/bin/env node
/**
 * Persona UI asset pipeline (Prism). Masters live in persona-assets/ (not committed when large).
 * Outputs tracked derivatives under client-ui-persona/src/client/assets/ (≤ 10 MB total in git).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { buildVivas, validateVivas } from './vivas-assets.mjs'
import { acquireLock, commitStaging, discardStaging, stagingPathOf } from './assets-swap.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'persona-assets')
const REAL_OUT = join(ROOT, 'packages/persona/client-ui-persona/src/client/assets')
// COLHEITA (Gauge, Keel/Lumen 12/11): the build writes into a STAGING folder and swaps it in at the very end (assets-swap.mjs). The real assets/ is never wiped first, so a failure (even a late one)
// or a concurrent build can no longer leave the tree without generated-imports.ts / asset-url.ts. One build at a time (lock .maestri/locks/assets-build.lock).
const OUT = stagingPathOf(REAL_OUT)
// Keel 12/11: 16 MiB (vivas: 18 animals x 4 webp, item 21). Keel 04/11: 12 MiB for the BR-P3 P1 poses + the last extras (art loads by URL per screen; nothing inlined in client.js).
const MAX_GIT_BYTES = 16 * 1024 * 1024
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
  // Muse 22:45 (budget): state poses q82→76 + alpha 90 (−19 %, indistinguishable at 2× on the dark paper); life frames unchanged.
  await pipeline.webp({ quality: life ? LIFE_POSE_QUALITY : 76, alphaQuality: life ? 100 : 90 }).toFile(toAbs)
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
  // P2-02 (Keel, D-110): persona-assets/ is NOT in git (only the build, 16 MiB, is versioned). On a clean clone there is nothing to build FROM: say so loudly and leave the committed assets/ exactly as they are.
  // On the owner's PC the folder exists and the build runs (and fails) for real. Never a silent pass: the message is on stdout and the exit code is 0 only because the source is absent by decision.
  if (!existsSync(SRC)) {
    console.log(`SKIP build-assets: ${SRC} não existe nesta máquina (D-110: só o build versionado vai ao git). Nada foi gerado; ${REAL_OUT} fica como está. No PC do dono este passo roda de verdade.`)
    return
  }
  // COLHEITA item 21 (Gauge): validate the "personas vivas" sources BEFORE anything below wipes OUT. A bad mask.json / canvas then stops the build with the old assets and generated-imports.ts untouched.
  const releaseLock = await acquireLock(join(ROOT, '.maestri/locks/assets-build.lock'), { log: console.log })
  const vivasPlans = await validateVivas({ src: SRC, sharp })
  // Hand-written code living next to the generated assets (asset-url.ts and any other *.ts/*.tsx a builder put here, e.g. Prism's
  // persona-face.ts) survives the clean; only generated-imports.ts is rewritten. (Prism 05/11: the old clean deleted an
  // unversioned file.) Everything else under OUT is generated and is wiped.
  const keep = new Map()
  const collect = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) { collect(abs); continue }
      if (/\.(ts|tsx)$/u.test(entry.name) && entry.name !== 'generated-imports.ts') keep.set(abs, readFileSync(abs, 'utf8'))
    }
  }
  collect(REAL_OUT)
  if (existsSync(ASSET_URL_STUB)) keep.set(ASSET_URL_STUB, readFileSync(ASSET_URL_STUB, 'utf8'))
  rmSync(OUT, { recursive: true, force: true })
  ensureDir(OUT)
  for (const [abs, text] of keep) {
    const target = join(OUT, relative(REAL_OUT, abs)) // hand-written files travel from the REAL assets/ into the staging
    ensureDir(dirname(target))
    writeFileSync(target, text)
  }
  if (keep.size > 1) console.log(`kept ${String(keep.size)} hand-written file(s) under assets/: ${[...keep.keys()].map(k => k.slice(REAL_OUT.length + 1)).join(', ')}`)

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
  // Muse (BR-P7): the 5 'medium' icons of external actions (preview card + action line), shipped in the same ui map. The rest of
  // icons/actions is Brush's older set that no screen uses yet, so it stays out of the bundle.
  const ACTION_MEDIA = new Set(['email.svg', 'publicar.svg', 'pagar.svg', 'apagar.svg', 'arquivo.svg'])
  if (existsSync(join(SRC, 'icons/actions'))) copyTree('icons/actions', name => ACTION_MEDIA.has(name))
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
    // Muse (DESIGN-01 momento uau 5): the same rail with the lamp OFF (only the lamp rectangle differs, feathered edge), for the
    // one-time off → on crossfade when the dark theme opens; then the lit art stays still.
    { from: 'illustrations/rail-foliage-dark-off@2x.png', to: 'illustrations/rail-foliage-dark-off.webp', width: 544, quality: 90 },
    // Muse (DESIGN-01 §5, lote 3.3): the onboarding arrival stage (no animals: the arrival poses stand on its floor).
    { from: 'illustrations/onboarding-porta-dia.png', to: 'illustrations/onboarding-porta-dia.webp', width: 1440, quality: 84 },
    { from: 'illustrations/onboarding-porta-noite.png', to: 'illustrations/onboarding-porta-noite.webp', width: 1440, quality: 84 },
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
    ...['empty-limite', 'empty-equipe-remota', 'acesso-encerrado', 'sucesso-aplicado', 'empty-aprovacoes', 'sucesso-skill-aprendida', 'sucesso-convite-aceito', 'sucesso-equipe-chegou',
      // COLHEITA item 13 (Brush, approved by Muse 11/11): "ligar a assinatura para o time inteiro" (480 shown at 240).
      'ligar-ia-equipe', 'estacao-vazio', 'estacao-pareando', 'canal-pronto', 'convite-enviado', 'convite-aguardando'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 480, quality: 86 }
    )),
    { from: 'illustrations/spot-limite.png', to: 'illustrations/spot-limite.webp', width: 192, quality: 88 },
    // Muse (BR-P3 P1): the 6 Ajuda spots (192 → 96).
    ...['conectar-ia', 'contratar', 'ensinar', 'quadros', 'avisos', 'privacidade'].map(name => (
      { from: `illustrations/spot-ajuda-${name}.png`, to: `illustrations/spot-ajuda-${name}.webp`, width: 192, quality: 88 }
    )),
    // Muse (BR-P1 P2 nº 2): "Falta uma IA" spot for the composer banner (192 shown at 96).
    { from: 'illustrations/spot-sem-ia.png', to: 'illustrations/spot-sem-ia.webp', width: 192, quality: 88 },
    // Muse (BR-P6): equipe real spots, 192 source shown at 96 (Brush asked for a 96-px output; the app shows them at 96).
    ...['spot-pedido-pronto', 'spot-bom-dia'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 96, quality: 88 }
    )),
    // Muse (kit de lançamento): "Sobre a Persona" team photo (Brush, brand/launch).
    { from: 'brand/launch/about-team.png', to: 'illustrations/about-team.webp', width: 960, quality: 86 },
    { from: 'brand/launch/release-notes-badge.png', to: 'illustrations/release-notes-badge.webp', width: 256, quality: 86 },
    ...['equipe-saudavel', 'ponto-unico-falha', 'voce-de-ferias'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 600, quality: 86 }
    )),
    // Muse (DESIGN-01-MUSE 11/11): 'sem-arquivos' (Arquivos, existing Brush art) + 'regras-da-casa' (Regras da casa, new).
    ...['inbox', 'kanban', 'search', 'vault', 'routines', 'connections', 'error', 'dm', 'sem-ia', 'sem-arquivos', 'regras-da-casa', 'memoria-resumo',
      // DESIGN-01 (onda 2): the day versions of empties whose night version is registered (Projetos, Uso e limites).
      'primeiro-projeto', 'uso-indisponivel',
      // COLHEITA (Muse + Brush 11/11): "Seus números" (Visão geral, item 19a) and "Conversa da tarefa" (Quadro, item 18).
      'seus-numeros', 'conversa-tarefa'].map(name => (
      { from: `illustrations/empty-${name}.png`, to: `illustrations/empty-${name}.webp`, width: 480, quality: 86 }
    )),
    // Muse (BR-P4 P1, NIGHT-THEME-SPEC): night empties, used ONLY in the dark theme (480 → 240).
    // + the 4 drawn for v1.2 (persona-assets/concepts/v1.2, approved by Muse; registered 11/11 for DESIGN-01 lote 0).
    ...['empty-dm-noite', 'empty-aprovacoes-noite', 'empty-geral-noite', 'empty-regras-da-casa-noite',
      'empty-kanban-noite', 'empty-routines-noite', 'empty-connections-noite', 'empty-search-noite',
      // + DESIGN-01 lote 2.2 (Brush 11/11, approved by Muse).
      'empty-sem-arquivos-noite', 'empty-primeiro-projeto-noite', 'empty-equipe-remota-noite',
      'empty-uso-indisponivel-noite', 'empty-memoria-resumo-noite',
      // + COLHEITA (Brush 11/11, approved by Muse): night version of "Seus números" (the task-conversation empty has one art for both themes).
      'empty-seus-numeros-noite'].map(name => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width: 480, quality: 86 }
    )),
    // Muse (Cofre, item 15): the empty Vault, the capivara with the key and the safe; one art for light and dark (alpha), shown at 240x160 → 480.
    { from: 'illustrations/empty-cofre.png', to: 'illustrations/empty-cofre.webp', width: 480, quality: 86 },
    // COLHEITA item 26 (Brush, approved by Muse 12/11): 7 category illustrations of the connector catalog (no third-party logos): 512 master + 96 spot.
    ...['vendas', 'pagamentos', 'atendimento', 'agenda-email', 'documentos', 'redes-sociais', 'gestao'].flatMap(name => ([
      { from: `illustrations/categorias/categoria-${name}.png`, to: `illustrations/categoria-${name}.webp`, width: 512, quality: 86 },
      { from: `illustrations/categorias/categoria-${name}-96.png`, to: `illustrations/categoria-${name}-96.webp`, width: 96, quality: 88 },
    ])),
    // Casa da equipe: lamp, empty attendance, first opening, and creation category.
    ...[['acordando-luminaria', 320], ['quem-aqui-vazio', 400], ['acordando-primeira-vez', 480]].map(([name, width]) => (
      { from: `illustrations/${name}.png`, to: `illustrations/${name}.webp`, width, quality: 86 }
    )),
    { from: 'illustrations/categorias/categoria-criacao.png', to: 'illustrations/categoria-criacao.webp', width: 512, quality: 86 },
    { from: 'illustrations/categorias/categoria-criacao-96.png', to: 'illustrations/categoria-criacao-96.webp', width: 96, quality: 88 },
    // Muse (DESIGN-01 momento uau 1): "Primeira entrega pronta" stamp, shown at 96 px → 192 (2×). No text in the art.
    { from: 'illustrations/stamp-primeira-entrega.png', to: 'illustrations/stamp-primeira-entrega.webp', width: 192, quality: 88 },
    // Muse (BR-P4 P1): team scene icons for channels (96 → 48).
    ...['marketing', 'atendimento', 'financeiro', 'diretoria', 'produto', 'equipe'].map(name => (
      { from: `illustrations/channel-${name}.png`, to: `illustrations/channel-${name}.webp`, width: 96, quality: 88 }
    )),
    // Muse (BR-P4): house decor, emitted under illustrations/ so they land in ILLUSTRATIONS (accents/ only imports SVG).
    // All sources are already 2× of the display size; kept at native width.
    ...[['accents/firefly.png', 32], ['accents/corner-leaf-tl.png', 96], ['accents/corner-leaf-br.png', 96], ['accents/flower-pin.png', 48],
      ['accents/butterfly.png', 32], ['accents/stamp-feito.png', 96], ['accents/stamp-boa.png', 96], ['accents/stamp-uau.png', 96],
      ['accents/confetti-leaves.png', 192], ['illustrations/header-doodles-light.png', 720], ['illustrations/header-doodles-dark.png', 720]].map(([from, width]) => (
      { from, to: `illustrations/${String(from).split('/').pop().replace(/\.png$/u, '.webp')}`, width, quality: 88 }
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
  // BR-P5 (Muse): bom-dia / ate-amanha are the persona's day moments (figurinhas), not picker reactions.
  // COLHEITA item 14 (Muse/Brush 11/11): 4 reaction stickers that answer without opening a turn (obrigada, uau, combinado, boa-ideia).
  const REACTIONS = new Set(['joinha', 'coracao', 'rindo', 'comemorando', 'pensando', 'feito', 'bom-dia', 'ate-amanha', 'obrigada', 'uau', 'combinado', 'boa-ideia'])
  const STICKER_FLAT = /^([a-z-]+?)-(joinha|coracao|rindo|comemorando|pensando|feito|bom-dia|ate-amanha|obrigada|uau|combinado|boa-ideia)\.png$/u
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
        // Brush's review boards (stickers-preview-*.png) are not stickers.
        const match = entry.name.startsWith('stickers-preview') ? null : STICKER_FLAT.exec(entry.name)
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

  // COLHEITA item 21 (Gauge, Keel 12/11): personas vivas, a block isolated in vivas-assets.mjs. ONE crop rectangle per animal (alpha box of the BASE + a fixed margin), the same
  // scale for every expression, and the build FAILS when an expression has another canvas or breaks the register (check-pose-register) against the base. The poses above are untouched.
  await buildVivas({ src: SRC, out: OUT, sharp, track, ensureDir, log: console.log, plans: vivasPlans.plans })

  const totalBytes = manifest.reduce((sum, row) => sum + row.bytes, 0)
  const summary = {
    generatedAt: new Date().toISOString(),
    source: relative(ROOT, SRC),
    output: relative(ROOT, REAL_OUT),
    files: manifest.length,
    totalBytes,
    withinBudget: totalBytes <= MAX_GIT_BYTES,
  }
  writeFileSync(join(OUT, 'manifest.build.json'), `${JSON.stringify({ summary, files: manifest }, null, 2)}\n`)

  const poseFiles = manifest.filter(f => f.rel.startsWith('poses/') && f.rel.endsWith('.webp'))
  const avatar96 = manifest.filter(f => f.rel.match(/^avatars\/[^/]+-96\.webp$/u))
  const navIcons = manifest.filter(f => (f.rel.startsWith('icons/nav/') || f.rel.startsWith('icons/ui/') || f.rel.startsWith('icons/actions/') || f.rel.startsWith('icons/brain/')) && f.rel.endsWith('.svg'))
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
    '/** Brush reaction stickers keyed `<animal>-<reaction>` (Muse; reactions: joinha, coracao, rindo, comemorando, pensando, feito; moments: bom-dia, ate-amanha). */',
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

  // Swap the finished staging into place only when everything above worked and the budget holds; otherwise the old assets/ stay exactly as they were.
  if (summary.withinBudget) console.log(`[assets] swapped into place (${commitStaging(REAL_OUT).mode})`)
  else discardStaging(REAL_OUT)
  releaseLock()
  console.log(`Wrote ${manifest.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB → ${relative(ROOT, REAL_OUT)}`)
  if (!summary.withinBudget) {
    console.error(`ERROR: asset budget exceeded (${MAX_GIT_BYTES} bytes max)`)
    process.exit(1)
  }
}

main().catch((error) => {
  discardStaging(REAL_OUT) // any failure: the real assets/ was never touched
  console.error(error)
  process.exit(1)
})
