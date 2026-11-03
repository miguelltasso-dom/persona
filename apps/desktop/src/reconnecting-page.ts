/** Local reconnecting document. Never a blank window; never a network URL. */

/**
 * Minimal HTML for host-death recovery.
 * @param message - Locale-owned "Reconectando…".
 */
export function reconnectingPageHtml(message: string): string {
  const text = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${text}</title>
<style>html,body{margin:0;height:100%;background:#1b1524;color:#f4efe8;font:16px/1.4 system-ui,sans-serif;display:grid;place-items:center}</style>
</head><body><p role="status">${text}</p></body></html>`
}

/**
 * data: URL for {@link reconnectingPageHtml}.
 * @param message - Locale-owned copy.
 */
export function reconnectingPageUrl(message: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(reconnectingPageHtml(message))}`
}
