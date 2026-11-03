/** Preview-only locale bind (production uses ctx.locale.bind). */

export type LocaleDict = Readonly<Record<string, string>>

/**
 * Format a dictionary entry with `{param}` placeholders.
 * @param dict - active locale dictionary.
 * @param key - dictionary key.
 * @param params - interpolation values.
 */
export function bindLocale(dict: LocaleDict, key: string, params?: Readonly<Record<string, string | number>>): string {
  const template = dict[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))
}
