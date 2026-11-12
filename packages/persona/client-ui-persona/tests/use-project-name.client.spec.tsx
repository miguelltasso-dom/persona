// @vitest-environment jsdom
// DESIGN-01 onda 2 · #10: as abas Arquivos e Canvas são do projeto da vez, e a tela diz QUAL pelo nome ("Projeto: Pessoal"), nunca pelo id.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProjectName } from '../src/client/data/use-project-name.ts'
import { ProjectWorkspaceScopeChip } from '../src/client/data/ProjectWorkspaceScopeChip.tsx'
import { pt as filesPt } from '../src/client/locale/files/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function Probe({ persona, projectId }: { persona: PersonaRemoteClient; projectId: string | null }) {
  const name = useProjectName(persona, { workspaceId: 'ws', projectId: 'pp' }, projectId)
  return <p data-testid="name">{name ?? '(sem nome)'}</p>
}

function remote(rows: readonly { id: string; name: string }[]) {
  return { listProjects: vi.fn(async () => ({ ok: true as const, value: rows })) } as unknown as PersonaRemoteClient
}

describe('useProjectName', () => {
  it('devolve o nome do projeto quando a lista chega; antes disso, nada (nunca o id cru)', async () => {
    const persona = remote([{ id: 'p-site', name: 'Site da loja' }, { id: 'p-pessoal', name: 'Pessoal' }])
    render(<Probe persona={persona} projectId="p-site" />)
    expect(screen.getByTestId('name').textContent).toBe('(sem nome)')
    await waitFor(() => { expect(screen.getByTestId('name').textContent).toBe('Site da loja') })
    expect(persona.listProjects).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp' })
  })

  it('sem projeto da vez não pergunta ao host; projeto que a lista não tem, ou host sem a lista, ficam sem nome', async () => {
    const persona = remote([{ id: 'p-pessoal', name: 'Pessoal' }])
    render(<Probe persona={persona} projectId={null} />)
    expect(persona.listProjects).not.toHaveBeenCalled()
    cleanup()
    render(<Probe persona={persona} projectId="p-sumiu" />)
    await waitFor(() => { expect(persona.listProjects).toHaveBeenCalled() })
    expect(screen.getByTestId('name').textContent).toBe('(sem nome)')
    cleanup()
    render(<Probe persona={{} as unknown as PersonaRemoteClient} projectId="p-site" />)
    expect(screen.getByTestId('name').textContent).toBe('(sem nome)')
  })
})

describe('ProjectWorkspaceScopeChip', () => {
  it('diz "Projeto: {nome}" e some sem nome', () => {
    render(<ProjectWorkspaceScopeChip dict={filesPt} projectName="Site da loja" />)
    expect(screen.getByText('Projeto: Site da loja')).toBeTruthy()
    cleanup()
    expect(render(<ProjectWorkspaceScopeChip dict={filesPt} projectName={null} />).container.firstChild).toBeNull()
  })
})
