/**
 * Carbon P0-02: the host types a Cofre password (or the owner's six digits) into a page without the model seeing it, and keeps the value masked for ten minutes. The runners' hook gate
 * has to know about that window: while it is open, the browser tools that carry raw page data (request bodies, console, traces) are refused, and what any browser tool answers goes
 * through the host's mask before the model reads it.
 *
 * The host registers ONE probe and ONE redactor at boot (they read the `SecretMask` of the browser host); the gates (the host's and the runner's own) read them at every call, so a gate that is
 * already armed follows the window without being armed again. Nothing registered (a runner outside the host, a test) = no window and no redaction. A probe that throws is an open window: the
 * raw reads stay closed (fail closed).
 */

let probe: (() => boolean) | undefined
let redactor: ((text: string) => string) | undefined

/**
 * Register (or clear) what the gates ask about typed secrets.
 * @param open - True while a typed secret is still masked.
 * @param redact - Replaces every live secret in a text with the mask.
 */
export function registerSecretWindow(open: (() => boolean) | undefined, redact?: (text: string) => string): void {
  probe = open
  redactor = redact
}

/** Whether a typed secret is still masked (fail closed: a probe that throws says yes). */
export function secretWindowOpen(): boolean {
  if (probe === undefined) return false
  try {
    return probe()
  } catch (error) {
    void error // the mask cannot be read: treat the window as open
    return true
  }
}

/**
 * A text with every live typed secret masked (identity when no redactor is registered, and a redactor that throws masks the whole text). For what the model SAYS (the reply the host persists and posts) and
 * for what the host keeps about a failed run, as the funnels of the tools already do for what the model READS.
 * @param text - Any text that may reach a screen, the thread or a log.
 */
export function redactText(text: string): string {
  if (redactor === undefined) return text
  try {
    return redactor(text)
  } catch (error) {
    void error
    return '••••••'
  }
}

/**
 * The output of a tool with every live secret masked, in whatever shape the CLI hands it (a string, content blocks, nested objects); only strings are touched.
 * @param value - The tool's response as the CLI posted it.
 * @returns The same shape, and whether anything was replaced. A redactor that throws masks the whole text it was given.
 */
export function redactToolOutput(value: unknown): { readonly value: unknown; readonly changed: boolean } {
  if (redactor === undefined) return { value, changed: false }
  const redact = redactor
  let changed = false
  const walk = (item: unknown, depth: number): unknown => {
    if (typeof item === 'string') {
      let next: string
      try {
        next = redact(item)
      } catch (error) {
        void error
        next = '••••••'
      }
      if (next !== item) changed = true
      return next
    }
    if (depth > 12 || item === null || typeof item !== 'object') return item
    if (Array.isArray(item)) return item.map(entry => walk(entry, depth + 1))
    return Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([key, entry]) => [key, walk(entry, depth + 1)]))
  }
  const out = walk(value, 0)
  return { value: out, changed }
}
