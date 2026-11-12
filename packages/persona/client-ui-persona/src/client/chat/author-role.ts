/**
 * Muse (ticket de leigo, 12/11): the line above a message is "Nome · função · hora". When the function is the same word as the name
 * ("Probe · Probe · 00:46") the repeat says nothing: it shows once ("Probe · 00:46").
 */

/**
 * @param role - The persona's function (title), when the team knows it.
 * @param name - The author's name as the line shows it.
 * @returns The function to write after the name, or `''` when there is none worth writing.
 */
export function roleAfterName(role: string | undefined, name: string): string {
  const cleaned = (role ?? '').trim()
  if (cleaned === '') return ''
  return cleaned.toLowerCase() === name.trim().toLowerCase() ? '' : cleaned
}
