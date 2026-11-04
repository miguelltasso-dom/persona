// Muse: builds the living design system page into ../system (static; opens from file:// or any server).
// Real primitives are rendered; their images point back at the repo files instead of being copied here.
import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OUT = resolve(HERE, '../system')
const NM = resolve(HERE, '../../../node_modules/.pnpm')
const R = `${NM}/react@18.3.1/node_modules/react`
const RD = `${NM}/react-dom@18.3.1_react@18.3.1/node_modules/react-dom`
const IMG = /\.(png|webp|svg|jpe?g|gif)$/u

const repoAssets = {
  name: 'persona-repo-assets',
  enforce: 'pre',
  load(id) {
    const clean = id.split('?')[0]
    if (id.includes('?') || !IMG.test(clean)) return null
    // SVGs are often CSS masks, which need CORS and fail on file:// — inline them (they are tiny).
    if (clean.endsWith('.svg')) return `export default ${JSON.stringify(`data:image/svg+xml;base64,${readFileSync(clean).toString('base64')}`)}`
    return `export default ${JSON.stringify(relative(OUT, clean).split(sep).join('/'))}`
  },
}
const classicScript = {
  name: 'persona-classic-script',
  transformIndexHtml: {
    order: 'post',
    handler: html => html.replace(/<script type="module" crossorigin/gu, '<script defer').replace(/ crossorigin(?=[ >])/gu, ''),
  },
}

export default {
  root: HERE,
  base: './',
  logLevel: 'warn',
  plugins: [repoAssets, classicScript],
  resolve: { dedupe: ['react', 'react-dom'], alias: [{ find: /^react$/u, replacement: R }, { find: /^react\/(.*)$/u, replacement: `${R}/$1` }, { find: /^react-dom$/u, replacement: RD }, { find: /^react-dom\/(.*)$/u, replacement: `${RD}/$1` }] },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/system.js', assetFileNames: 'assets/[name][extname]' } },
  },
}
