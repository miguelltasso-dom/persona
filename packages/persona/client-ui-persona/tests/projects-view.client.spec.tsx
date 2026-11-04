// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectsView } from '../src/client/shell/ProjectsView.tsx'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

afterEach(() => { cleanup() })

describe('ProjectsView', () => {
  it('each project is one keyboard-reachable button and "Novo projeto" is a tile', () => {
    const onOpen = vi.fn()
    const onCreate = vi.fn()
    render(<ProjectsView t={shellTranslate} loading={false} error={null} projects={[{ id: 'p1', name: 'Pessoal', kind: 'personal' }]} onOpen={onOpen} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pessoal' }))
    expect(onOpen).toHaveBeenCalledWith('p1')
    const create = screen.getAllByRole('button').filter(button =>  button.textContent?.includes(shellTranslate('projects.new')))
    expect(create.length).toBeGreaterThan(0)
  })
})
