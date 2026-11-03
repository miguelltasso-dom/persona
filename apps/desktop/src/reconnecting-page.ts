/** Local reconnecting and boot-splash documents. Design-system tokens; never a network URL. */

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
} as const

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function shellPage(message: string, lang: string): string {
  const text = escapeHtml(message)
  const htmlLang = lang.startsWith('pt') ? 'pt-BR' : lang.startsWith('en') ? 'en' : lang
  return `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8"><title>${text}</title>
<style>
:root{--paper:${TOKENS.paper};--ink:${TOKENS.ink};--ink-soft:${TOKENS.inkSoft};--wash:${TOKENS.wash};--amber:${TOKENS.amber};--outline:${TOKENS.outline}}
@media (prefers-color-scheme:dark){:root{--paper:${TOKENS.paperDark};--ink:${TOKENS.inkDark};--ink-soft:#CDBFDB;--wash:#2E2140;--outline:#120C18}}
html,body{margin:0;height:100%;background:var(--paper);color:var(--ink);font:16px/1.45 "Segoe UI",system-ui,sans-serif;display:grid;place-items:center}
.card{border:1.5px solid var(--outline);background:var(--wash);padding:24px 28px;box-shadow:3px 3px 0 var(--outline);max-width:22rem;text-align:center}
.dot{width:10px;height:10px;border-radius:50%;background:var(--amber);display:inline-block;margin-bottom:12px}
p{margin:0}
</style>
</head><body><div class="card"><span class="dot" aria-hidden="true"></span><p role="status">${text}</p></div></body></html>`
}

/**
 * Minimal HTML for host-death recovery.
 * @param message - Locale-owned "Reconectando…".
 * @param lang - `pt` / `en` / BCP-47.
 */
export function reconnectingPageHtml(message: string, lang = 'pt-BR'): string {
  return shellPage(message, lang)
}

/**
 * Boot splash (same tokens as reconnecting).
 * @param message - Locale-owned "Abrindo o Persona…".
 * @param lang - Locale.
 */
export function bootSplashHtml(message: string, lang = 'pt-BR'): string {
  return shellPage(message, lang)
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
