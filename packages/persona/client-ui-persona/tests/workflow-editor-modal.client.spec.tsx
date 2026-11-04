// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowEditorModal } from '../src/client/kanban/WorkflowEditorModal.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('WorkflowEditorModal (BOARDS-SPEC §5)', () => {
  it('blocks save when done column is removed', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowEditorModal
          dict={pt}
          flowModel="software"
          columns={[
            { id: 'a', name: 'Backlog', category: 'todo' },
            { id: 'b', name: 'Done', category: 'done' },
          ]}
          ticketCountByColumn={{}}
          fields={[]}
          onClose={() => {}}
          onSave={() => {}}
        />
      </PreviewFrame>,
    )
    const removeButtons = screen.getAllByRole('button', { name: pt['editor.removeColumn'] })
    fireEvent.click(removeButtons[removeButtons.length - 1]!)
    expect(screen.getByRole('status').textContent).toContain(pt['editor.validation.done'])
    expect(screen.getByRole('button', { name: pt['editor.save'] }).hasAttribute('disabled')).toBe(true)
  })

  it('calls onSave with columns when valid', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowEditorModal
          dict={pt}
          flowModel="software"
          columns={[
            { id: 'a', name: 'Backlog', category: 'todo' },
            { id: 'b', name: 'Done', category: 'done' },
          ]}
          ticketCountByColumn={{}}
          fields={[]}
          onClose={() => {}}
          onSave={onSave}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['editor.save'] }))
    await vi.waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave.mock.calls[0]?.[0]).toHaveLength(2)
    expect(onSave.mock.calls[0]?.[2]).toEqual([])
  })

  it('exposes drag handle and extra field editor', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowEditorModal
          dict={pt}
          flowModel="contratacao"
          columns={[
            { id: 'a', name: 'Backlog', category: 'todo' },
            { id: 'b', name: 'Done', category: 'done' },
          ]}
          ticketCountByColumn={{}}
          fields={[{ id: 'f1', name: 'Cargo', kind: 'text' }]}
          onClose={() => {}}
          onSave={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getAllByRole('button', { name: pt['editor.dragColumn'] }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: pt['editor.fields'] })).toBeTruthy()
    expect(screen.getByDisplayValue('Cargo')).toBeTruthy()
  })

  const flow = [
    { id: 'a', name: 'Backlog', category: 'todo' as const },
    { id: 'b', name: 'Em andamento', category: 'doing' as const },
    { id: 'c', name: 'Revisão', category: 'review' as const },
    { id: 'd', name: 'Pronto', category: 'done' as const },
  ]
  const modal = (onSave: (...args: never[]) => unknown) => render(
    <PreviewFrame brandLabel="Persona">
      <WorkflowEditorModal
        dict={pt}
        flowModel="software"
        columns={flow}
        ticketCountByColumn={{ b: 3, c: 2 }}
        fields={[]}
        onClose={() => {}}
        onSave={onSave as never}
      />
    </PreviewFrame>,
  )
  const removeColumn = (name: string): void => {
    const row = screen.getByDisplayValue(name).closest('[draggable], li, div') as HTMLElement
    const scope = row.closest('li') ?? row.parentElement ?? row
    fireEvent.click(Array.from(scope.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === pt['editor.removeColumn'])!)
  }

  it('PB-9.3: remover coluna com tarefas pede o destino e manda destByRemoved ao salvar', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    modal(onSave)
    removeColumn('Em andamento')
    const group = screen.getByRole('group', { name: pt['editor.remove.pick'] })
    fireEvent.click(Array.from(group.querySelectorAll('button')).find(b => b.textContent === 'Backlog')!)
    fireEvent.click(screen.getByRole('button', { name: pt['editor.save'] }))
    await vi.waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave.mock.calls[0]?.[1]).toEqual({ b: 'a' })
  })

  it('PB-9.3: se o destino escolhido também é removido, as tarefas ganham o novo destino (nunca ficam sem coluna)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    modal(onSave)
    // 1) remove "Em andamento" mandando as 3 tarefas para "Revisão"
    removeColumn('Em andamento')
    fireEvent.click(Array.from(screen.getByRole('group', { name: pt['editor.remove.pick'] }).querySelectorAll('button')).find(b => b.textContent === 'Revisão')!)
    // 2) remove "Revisão": ela agora carrega 2 + 3 tarefas e pede destino outra vez
    removeColumn('Revisão')
    expect(screen.getByRole('dialog', { name: /5/u })).toBeTruthy()
    fireEvent.click(Array.from(screen.getByRole('group', { name: pt['editor.remove.pick'] }).querySelectorAll('button')).find(b => b.textContent === 'Backlog')!)
    fireEvent.click(screen.getByRole('button', { name: pt['editor.save'] }))
    await vi.waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave.mock.calls[0]?.[1]).toEqual({ b: 'a', c: 'a' })
  })
})
