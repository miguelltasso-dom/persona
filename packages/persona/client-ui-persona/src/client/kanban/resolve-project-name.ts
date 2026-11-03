/** Display name for a project id (never raw ids like `proj-pessoal` when a label exists). */
export function resolveProjectDisplayName(
  projectId: string,
  projects: readonly { readonly id: string; readonly name: string }[],
): string {
  const hit = projects.find(row => row.id === projectId)
  if (hit !== undefined && hit.name.trim().length > 0) return hit.name.trim()
  if (projectId === 'proj-pessoal') return 'Pessoal'
  const stripped = projectId.replace(/^proj[-_]?/u, '').replace(/[-_]/gu, ' ').trim()
  if (stripped.length === 0) return 'Projeto'
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}
