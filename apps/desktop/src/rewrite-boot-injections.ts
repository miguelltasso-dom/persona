/**
 * Host boot rows include `kind: 'script'` (ModuleLoader queue, theme). The
 * shipped web-frontend applies those with `textContent`, which is an inline
 * classic script. Electron CSP must not list `'unsafe-eval'` or a broad
 * `'unsafe-inline'` (and must not mix hashes with `'unsafe-inline'`, which
 * Chromium then ignores). Desktop therefore rewrites those rows to
 * same-origin `script-src` files served over `dsh-app://`.
 */

/** Path prefix for rewritten Host inline scripts. */
export const PERSONA_BOOT_SCRIPT_PREFIX = '/__persona-boot__/'

/** Same-origin classic script that installs the desktop boot gate. */
export const PERSONA_BOOT_READY_SRC = `${PERSONA_BOOT_SCRIPT_PREFIX}ready.js`

/** Body of {@link PERSONA_BOOT_READY_SRC}. */
export const PERSONA_BOOT_READY_JS = 'globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()'

/** HTML tag that loads the boot gate without an inline script. */
export const PERSONA_BOOT_READY_MARKUP = `<script src="${PERSONA_BOOT_READY_SRC}"></script>`

type ScriptInjection = { kind: 'script'; placement: 'head' | 'body'; text: string }

/**
 * True when `row` is a Host inline script injection.
 * @param row - One boot-table value.
 */
function isScriptInjection(row: unknown): row is ScriptInjection {
  if (typeof row !== 'object' || row === null) return false
  const candidate = row as { kind?: unknown; placement?: unknown; text?: unknown }
  return candidate.kind === 'script'
    && (candidate.placement === 'head' || candidate.placement === 'body')
    && typeof candidate.text === 'string'
}

/**
 * Replace every `kind: 'script'` row with a same-origin `script-src` file.
 * @param rows - Host boot injection table.
 * @returns Rewritten table plus the file bodies to serve.
 */
export function rewriteBootInjections(rows: readonly unknown[]): {
  readonly injections: readonly unknown[]
  readonly files: ReadonlyMap<string, string>
} {
  const files = new Map<string, string>()
  let index = 0
  const injections = rows.map((row) => {
    if (!isScriptInjection(row)) return row
    const src = `${PERSONA_BOOT_SCRIPT_PREFIX}${String(index)}.js`
    index += 1
    files.set(src, row.text)
    return { kind: 'script-src', placement: row.placement, src }
  })
  return { injections, files }
}

/**
 * Store that always serves the boot-gate script, plus rewritten Host scripts.
 */
export function createPersonaBootScriptStore(): Map<string, string> {
  return new Map([[PERSONA_BOOT_READY_SRC, PERSONA_BOOT_READY_JS]])
}

/**
 * Replace Host script files after a (re)start. Keeps the boot-gate script.
 * @param rows - Latest Host injection table.
 * @param files - Live protocol map.
 * @returns Rewritten injection table for `dshDesktopBoot.ready()`.
 */
export function applyRewrittenBootInjections(
  rows: readonly unknown[],
  files: Map<string, string>,
): readonly unknown[] {
  const rewritten = rewriteBootInjections(rows)
  for (const key of [...files.keys()]) {
    if (key !== PERSONA_BOOT_READY_SRC) files.delete(key)
  }
  for (const [src, body] of rewritten.files) files.set(src, body)
  return rewritten.injections
}

/**
 * Serve a rewritten boot script when the request path is one we own.
 * @param request - `dsh-app://app/` request.
 * @param files - Live protocol map.
 * @returns Script response, or `undefined` when the path is not a boot file.
 */
export function servePersonaBootScript(
  request: Request,
  files: ReadonlyMap<string, string>,
): Response | undefined {
  const url = new URL(request.url)
  const body = files.get(url.pathname)
  if (body === undefined) return undefined
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
