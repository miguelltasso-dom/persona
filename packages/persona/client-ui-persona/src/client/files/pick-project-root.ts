/** Ask the user for an absolute project folder path (host `setProjectRoot`). */
export async function pickProjectRootPath(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const path = window.prompt('Caminho absoluto da pasta do projeto:')
  if (path === null) return null
  const trimmed = path.trim()
  return trimmed.length > 0 ? trimmed : null
}
