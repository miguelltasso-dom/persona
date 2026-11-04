/**
 * Visible-copy helpers. Parent `textContent` glues sibling elements
 * ("Bem-vindo" + "ao" + "#geral" → "Bem-vindoao#geral") and caused DF-003.
 * Prefer Playwright `getByText` / `innerText` for assertions.
 */

/**
 * What `parent.textContent` returns for adjacent element siblings (no layout spaces).
 * @param parts - Text of each sibling, in order.
 */
export function gluedSiblingTextContent(parts: readonly string[]): string {
  return parts.join('')
}

/**
 * Layout-aware stand-in: block/inline-block siblings read with a space.
 * @param parts - Visible text of each sibling, in order.
 */
export function visibleSiblingText(parts: readonly string[]): string {
  return parts.map(part => part.trim()).filter(part => part !== '').join(' ')
}

/**
 * True when a glued `textContent` dump would look like a missing-space font bug
 * while the layout-aware string is fine (DF-003 false positive).
 * @param glued - `textContent` of a parent.
 * @param expectedVisible - Copy a person (or `innerText` / `getByText`) sees.
 */
export function isGluedCopyFalsePositive(glued: string, expectedVisible: string): boolean {
  const compact = (value: string): string => value.replace(/\s+/g, '')
  return glued !== expectedVisible && compact(glued) === compact(expectedVisible)
}
