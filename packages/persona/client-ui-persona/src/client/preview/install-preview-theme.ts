/** Load Persona palette in jsdom preview tests. */

import '../theme/persona-palette.css'

/** Ensures light scheme active tokens exist on documentElement. */
export function installPreviewTheme(): void {
  document.documentElement.style.setProperty('--persona-active-surface', 'var(--persona-surface)')
  document.documentElement.style.setProperty('--persona-active-ink', 'var(--persona-ink)')
  document.documentElement.style.setProperty('--persona-active-ink-muted', 'var(--persona-ink-muted)')
  document.documentElement.style.setProperty('--persona-active-rail', 'var(--persona-rail)')
  document.documentElement.style.setProperty('--persona-active-rail-ink', 'var(--persona-rail-ink)')
  document.documentElement.style.setProperty('--persona-active-surface-alt', 'var(--persona-surface-alt)')
  document.documentElement.style.setProperty('--persona-active-accent', 'var(--persona-accent)')
  document.documentElement.style.setProperty('--persona-active-accent-ink', 'var(--persona-accent-ink)')
}
