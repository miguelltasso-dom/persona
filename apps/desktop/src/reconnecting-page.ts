/** Local reconnecting and boot-splash documents. Design-system tokens; never a network URL. */

import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Muse DESIGN-SYSTEM.md primitives (hex only here — desktop HTML is not client-ui-persona). */
const TOKENS = {
  paper: '#FAF3E4',
  paperDark: '#1E1526',
  ink: '#34243F',
  inkDark: '#F6EEE0',
  inkSoft: '#5E4E6B',
  wash: '#F2EAF8',
  amber: '#E8AF54',
  outline: '#34243F',
  plum: '#6B3A6A',
  lilac100: '#F2EAF8',
  hillDark: '#3B2B52',
  sealDark: '#8E78B0',
} as const

const WALKERS: readonly { name: string; height: number }[] = [
  { name: 'luna', height: 60 },
  { name: 'sol', height: 80 },
  { name: 'nina', height: 77 },
  { name: 'bento', height: 71 },
  { name: 'atlas', height: 84 },
]

const MIME_BY_EXT: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const CHROME_DIR = fileURLToPath(new URL('../resources/chrome', import.meta.url))

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * Compact Brush splash bytes as a data URL. Missing files omit the image.
 * @param name - File under `resources/chrome`.
 */
export function chromeDataUrl(name: string): string {
  const path = join(CHROME_DIR, name)
  if (!existsSync(path)) return ''
  const mime = MIME_BY_EXT[extname(name)] ?? 'application/octet-stream'
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

function walkerMarkup(): string {
  return WALKERS
    .map((walker, index) => {
      const url = chromeDataUrl(`walk-${walker.name}.webp`)
      if (url === '') return ''
      return `<img class="walker" alt="" src="${url}" height="${String(walker.height)}" data-who="${walker.name}" data-i="${String(index)}" style="height:${String(walker.height)}px">`
    })
    .join('')
}

function faceCss(): string {
  const fredoka = chromeDataUrl('fredoka-700.woff2')
  const nunito = chromeDataUrl('nunito-600.woff2')
  const faces = [
    fredoka === '' ? '' : `@font-face{font-family:Fredoka;font-style:normal;font-weight:700;src:url("${fredoka}") format("woff2")}`,
    nunito === '' ? '' : `@font-face{font-family:Nunito;font-style:normal;font-weight:600;src:url("${nunito}") format("woff2")}`,
  ]
  return faces.join('')
}

function splashCss(): string {
  return `${faceCss()}
:root{--paper:${TOKENS.paper};--ink:${TOKENS.ink};--ink-soft:${TOKENS.inkSoft};--wash:${TOKENS.wash};--amber:${TOKENS.amber};--outline:${TOKENS.outline};--hill:${TOKENS.lilac100};--seal-edge:${TOKENS.plum}}
@media (prefers-color-scheme:dark){:root{--paper:${TOKENS.paperDark};--ink:${TOKENS.inkDark};--ink-soft:#CDBFDB;--wash:#2E2140;--outline:#120C18;--hill:${TOKENS.hillDark};--seal-edge:${TOKENS.sealDark}}}
html,body{margin:0;height:100%;background:var(--paper);color:var(--ink);font:16px/1.45 Nunito,"Segoe UI",system-ui,sans-serif;display:grid;place-items:center}
.stage{text-align:center;max-width:28rem;display:flex;flex-direction:column;align-items:center;gap:24px}
.seal{width:40px;height:40px;display:grid;place-items:center;border:1.5px solid var(--seal-edge);border-radius:10px;background:var(--wash);box-shadow:2px 2px 0 var(--outline);transform:rotate(-4deg);overflow:hidden}
.seal img{width:28px;height:28px;display:block}
.wordmark{margin:0;font:700 32px/1 Fredoka,"Segoe UI",system-ui,sans-serif}
.hill{position:relative;width:min(420px,90vw);height:110px}
.hill::before{content:"";position:absolute;left:50%;bottom:6px;width:110%;height:14px;transform:translateX(-50%);background:var(--hill);border-radius:999px}
.walkers{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:6px;align-items:flex-end}
.walker{width:auto;animation:step 1.2s ease-in-out infinite}
.walker:nth-child(2){animation-delay:.15s}
.walker:nth-child(3){animation-delay:.3s}
.walker:nth-child(4){animation-delay:.45s}
.walker:nth-child(5){animation-delay:.6s}
@keyframes step{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-6px) rotate(2deg)}}
.team{display:none;max-width:min(420px,90vw);height:auto}
.status{margin:0;font:600 15px/1.4 Nunito,"Segoe UI",system-ui,sans-serif;color:var(--ink-soft)}
.paws{display:flex;justify-content:center;gap:6px}
.paw{width:10px;height:10px;border-radius:50% 50% 50% 0;background:var(--amber);transform:rotate(-30deg);animation:paw 1s ease-in-out infinite}
.paw:nth-child(2){animation-delay:.2s}
.paw:nth-child(3){animation-delay:.4s}
@keyframes paw{0%,100%{opacity:.35}50%{opacity:1}}
.error-title{margin:0;font:700 22px/1.25 Fredoka,"Segoe UI",system-ui,sans-serif}
.help{margin:0;font:600 15px/1.4 Nunito,"Segoe UI",system-ui,sans-serif;color:var(--ink-soft)}
@media (prefers-reduced-motion:reduce){.walker,.paw{animation:none}.hill,.walkers{display:none}.team{display:block}}
`.replaceAll('\n', '')
}

function sealMarkup(): string {
  const symbol = chromeDataUrl('symbol.svg')
  const img = symbol === '' ? '' : `<img alt="" src="${symbol}" width="28" height="28">`
  return `<div class="seal" aria-hidden="true">${img}</div>`
}

function splashPage(message: string, lang: string): string {
  const text = escapeHtml(message)
  const htmlLang = lang.startsWith('pt') ? 'pt-BR' : lang.startsWith('en') ? 'en' : lang
  const team = chromeDataUrl('splash-equipe.webp')
  const teamDark = chromeDataUrl('splash-equipe-dark.webp')
  const walkers = walkerMarkup()
  const teamImg = team === ''
    ? ''
    : `<img class="team" alt="" src="${team}" width="420">`
  const teamDarkStyle = teamDark === ''
    ? ''
    : `@media (prefers-color-scheme:dark){.team{content:url("${teamDark}")}}`
  return `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8"><title>${text}</title>
<style>${splashCss()}${teamDarkStyle}</style>
</head><body><div class="stage">
${sealMarkup()}
<h1 class="wordmark">Persona</h1>
<div class="hill"><div class="walkers">${walkers}</div></div>
${teamImg}
<p class="status" role="status">${text}</p>
<div class="paws" aria-hidden="true"><span class="paw"></span><span class="paw"></span><span class="paw"></span></div>
</div></body></html>`
}

/**
 * Minimal HTML for host-death recovery.
 * @param message - Locale-owned "Reconectando…".
 * @param lang - `pt` / `en` / BCP-47.
 */
export function reconnectingPageHtml(message: string, lang = 'pt-BR'): string {
  return splashPage(message, lang)
}

/**
 * Boot splash (same tokens as reconnecting).
 * @param message - Locale-owned "Acordando a equipe…".
 * @param lang - Locale.
 */
export function bootSplashHtml(message: string, lang = 'pt-BR'): string {
  return splashPage(message, lang)
}

/**
 * data: URL for {@link reconnectingPageHtml}.
 * @param message - Locale-owned copy.
 * @param lang - Locale.
 */
export function reconnectingPageUrl(message: string, lang = 'pt-BR'): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(reconnectingPageHtml(message, lang))}`
}

/**
 * data: URL for {@link bootSplashHtml}.
 * @param message - Locale-owned copy.
 * @param lang - Locale.
 */
export function bootSplashUrl(message: string, lang = 'pt-BR'): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(bootSplashHtml(message, lang))}`
}

/**
 * Boot-failure page: same tokens, Brush empty-error, retry + copy diagnostic.
 * @param input - Locale-owned message and button labels.
 */
export function bootErrorHtml(input: {
  message: string
  retry: string
  copy: string
  help?: string
  lang?: string
}): string {
  const lang = input.lang ?? 'pt-BR'
  const htmlLang = lang.startsWith('pt') ? 'pt-BR' : lang.startsWith('en') ? 'en' : lang
  const text = escapeHtml(input.message)
  const help = input.help === undefined || input.help === '' ? '' : `<p class="help">${escapeHtml(input.help)}</p>`
  const retry = escapeHtml(input.retry)
  const copy = escapeHtml(input.copy)
  const art = chromeDataUrl('empty-error.webp')
  const img = art === '' ? '' : `<img class="art" alt="" src="${art}" width="280" height="200">`
  return `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8"><title>${text}</title>
<style>${splashCss()}
.art{display:block;max-width:280px}
.actions{display:flex;flex-direction:column;gap:10px;align-items:center}
.retry{font:700 15px Nunito,"Segoe UI",system-ui,sans-serif;background:var(--amber);color:var(--outline);border:1.5px solid var(--outline);border-radius:12px;box-shadow:3px 3px 0 var(--outline);padding:8px 18px;cursor:pointer}
.retry:focus-visible{outline:2px solid #E8AF54;outline-offset:2px}
.copy{background:none;border:0;color:var(--ink-soft);font:600 14px Nunito,"Segoe UI",system-ui,sans-serif;cursor:pointer;text-decoration:underline}
</style></head><body><div class="stage">
${sealMarkup()}
${img}
<h1 class="error-title">${text}</h1>
${help}
<div class="actions">
<button type="button" class="retry">${retry}</button>
<button type="button" class="copy">${copy}</button>
</div>
</div></body></html>`
}

/**
 * data: URL for {@link bootErrorHtml}.
 * @param input - Locale-owned message and button labels.
 */
export function bootErrorUrl(input: {
  message: string
  retry: string
  copy: string
  help?: string
  lang?: string
}): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(bootErrorHtml(input))}`
}
