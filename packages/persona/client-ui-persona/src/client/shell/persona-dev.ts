/** Dev-only host protocol badge (hidden in normal product chrome). */
export function showPersonaDevHostBadge(): boolean {
  if (typeof globalThis === 'undefined') return false
  try {
    return localStorage.getItem('persona.devHostBadge') === '1'
  } catch {
    return false
  }
}
