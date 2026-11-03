// Build index.md from existing .maestri/tmp/shots/real/*.png (no host; no lock).
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REAL_GALLERY_PANELS } from '../../packages/persona/persona-e2e/src/real-gallery/panels.ts'

const dir = join(process.cwd(), '.maestri', 'tmp', 'shots', 'real')
const ownerBySlug = new Map(REAL_GALLERY_PANELS.map(p => [p.slug, p.owner]))
ownerBySlug.set('onboarding-passo-1', 'Muse')
ownerBySlug.set('onboarding-passo-2', 'Muse')
ownerBySlug.set('onboarding-passo-3', 'Muse')
ownerBySlug.set('onboarding-passo-4', 'Muse')
ownerBySlug.set('onboarding-passo-5', 'Muse')
ownerBySlug.set('editor-persona', 'Prism')

const files = (await readdir(dir)).filter(f => f.endsWith('.png')).sort()
const lines = [
  '# Persona real-app gallery',
  '',
  '_Índice gerado a partir de capturas em disco (axe/console requer re-run `capture-real-gallery.mjs`)._',
  '',
  '| Painel | Dono | Arquivo | Console | Axe |',
  '|--------|------|---------|---------|-----|',
]
for (const file of files) {
  const base = file.replace(/\.png$/, '')
  const m = /^(.*)-(light|dark)-(1280x720|1920x1080)$/.exec(base)
  const slug = m?.[1] ?? base
  const owner = ownerBySlug.get(slug) ?? 'Probe'
  lines.push(`| ${slug} | ${owner} | \`${file}\` | — | — |`)
}
lines.push('', `_Arquivos: ${String(files.length)} · ${new Date().toISOString()}_`, '')
const indexPath = join(dir, 'index.md')
await writeFile(indexPath, lines.join('\n'), 'utf8')
console.log(`wrote ${indexPath} (${String(files.length)} png)`)
