#!/usr/bin/env node
// Muse: builds apps/persona-site/assets from the Brush art and REAL app captures (proof before promise).
// Run from the repo root: node apps/persona-site/scripts/prepare-assets.mjs
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const sharp = createRequire(join(ROOT, 'scripts/persona/build-assets.mjs'))('sharp')
const OUT = join(ROOT, 'apps/persona-site/assets')
const A = join(ROOT, 'persona-assets')
const SHOTS = join(ROOT, '.maestri/tmp/shots/design')
rmSync(OUT, { recursive: true, force: true })
for (const d of ['img', 'shots', 'fonts']) mkdirSync(join(OUT, d), { recursive: true })

const webp = (from, to, width, quality = 82, crop) => {
  let p = sharp(from)
  if (crop) p = p.extract(crop)
  return p.resize({ width, withoutEnlargement: true }).webp({ quality, alphaQuality: 100 }).toFile(join(OUT, to))
}

const jobs = []
for (const s of ['light', 'dark']) jobs.push(webp(join(A, `brand/launch/hero-wide-${s}.png`), `img/hero-${s}.webp`, 1800, 80))
for (const p of ['atlas', 'bento', 'nina', 'sol', 'luna']) jobs.push(webp(join(A, `poses/${p}-trabalhando.png`), `img/${p}.webp`, 360, 86))
jobs.push(webp(join(A, 'brand/launch/about-team.png'), 'img/team.webp', 720, 86))
copyFileSync(join(A, 'brand/symbol.svg'), join(OUT, 'img/symbol.svg'))
copyFileSync(join(A, 'brand/app-icon.png'), join(OUT, 'img/app-icon.png'))
for (const f of ['fredoka-latin.woff2', 'nunito-latin.woff2', 'OFL-fredoka.txt', 'OFL-nunito.txt']) copyFileSync(join(A, 'fonts', f), join(OUT, 'fonts', f))

// Real captures, 1440×900 app frames. `main` crops away the rail so the feature reads at card size.
const MAIN = { left: 264, top: 0, width: 1176, height: 900 }
// [fresh capture (current bundle), gallery fallback, output name, crop]
const CARD = { left: 250, top: 150, width: 1000, height: 750 }
const shots = [
  ['overview', 'gallery/04-overview', 'overview', null],
  ['composer-slash', 'integ/depois/composer-slash', 'ask', null],
  ['onboarding-%s-4', 'gallery/02-onboarding-4', 'build', null],
  ['panel-aprovacoes', 'gallery/17-panel-aprovacoes', 'approve', MAIN],
  ['card-nina', 'gallery/07-card-nina', 'card', CARD],
  ['panel-sau-de', 'gallery/13-panel-sau-de', 'health', MAIN],
  ['org150-found', 'integ/depois/org150-found', 'org', MAIN],
  ['teach', 'teach', 'teach', { left: 380, top: 60, width: 680, height: 780 }],
  ['panel-uso-e-limites', 'gallery/22-panel-uso-e-limites', 'usage', MAIN],
  ['panel-conexoes', 'gallery/21-panel-conexoes', 'connections', MAIN],
]
for (const [fresh, fallback, name, crop] of shots) {
  for (const s of ['light', 'dark']) {
    const freshPath = join(SHOTS, fresh.includes('%s') ? `${fresh.replace('%s', s)}.png` : `${fresh}-${s}.png`)
    const from = existsSync(freshPath) ? freshPath : join(SHOTS, `${fallback}-${s}.png`)
    if (!existsSync(from)) { console.warn('missing', name, s); continue }
    if (from !== freshPath) console.warn('fallback (older capture):', name, s)
    jobs.push(webp(from, `shots/${name}-${s}.webp`, crop ? 1000 : 1440, 80, crop ?? undefined))
  }
}
await Promise.all(jobs)
console.log('ok', jobs.length)
