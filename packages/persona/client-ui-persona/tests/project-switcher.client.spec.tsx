// @vitest-environment jsdom
// DESIGN-01 onda 2 · #10 (Muse §5.1 #1/#2): o seletor "Pessoal ▾" do cabeçalho do lugar Projetos. Troca de projeto sem sair da aba e
// termina em "Ver todos os projetos" (a grade de cartões).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectSwitcher } from '../src/client/kanban/ProjectSwitcher.tsx'
import { pt as kanbanPt, en as kanbanEn } from '../src/client/locale/kanban/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const projects = [
  { id: 'p-pessoal', name: 'Pessoal', kind: 'personal' },
  { id: 'p-site', name: 'Site da loja', kind: 'shared' },
]

function mount(extra: Partial<Parameters<typeof ProjectSwitcher>[0]> = {}) {
  const onSelect = vi.fn()
  const onSeeAll = vi.fn()
  render(<ProjectSwitcher dict={kanbanPt} projects={projects} currentId="p-pessoal" onSelect={onSelect} onSeeAll={onSeeAll} {...extra} />)
  return { onSelect, onSeeAll, trigger: screen.getByRole('button', { name: /Pessoal/u }) }
}

describe('ProjectSwitcher', () => {
  it('o botão mostra o projeto da vez e anuncia o menu', () => {
    const { trigger } = mount()
    expect(trigger.textContent).toContain('Pessoal')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('abre com os projetos (o da vez marcado) e, no fim, "Ver todos os projetos"', () => {
    const { trigger } = mount()
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu')
    const radios = within(menu).getAllByRole('menuitemradio')
    expect(radios.map(node => node.textContent)).toEqual(['Pessoal', 'Site da loja'])
    expect(radios.map(node => node.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    const all = within(menu).getAllByRole('menuitem')
    expect(all.at(-1)?.textContent).toBe('Ver todos os projetos')
  })

  it('escolher outro projeto o seleciona e fecha o menu; escolher o da vez só fecha', () => {
    const { trigger, onSelect } = mount()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Site da loja' }))
    expect(onSelect).toHaveBeenCalledWith('p-site')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Pessoal' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('"Ver todos os projetos" abre a grade e fecha o menu', () => {
    const { trigger, onSeeAll } = mount()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver todos os projetos' }))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('teclado: as setas andam, Esc fecha e devolve o foco ao botão', () => {
    const { trigger } = mount()
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(items.at(-1))
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('um clique fora fecha o menu', () => {
    const { trigger } = mount()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('sem projeto da vez (lista vazia) o botão diz "Projetos"; com um projeto só o menu ainda leva à grade', () => {
    cleanup()
    render(<ProjectSwitcher dict={kanbanPt} projects={[]} currentId={null} onSelect={() => undefined} onSeeAll={() => undefined} />)
    expect(screen.getByRole('button', { name: /Projetos/u })).toBeTruthy()
    cleanup()
    render(<ProjectSwitcher dict={kanbanPt} projects={[projects[1]!]} currentId="p-site" onSelect={() => undefined} onSeeAll={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /Site da loja/u }))
    expect(screen.getByRole('menuitem', { name: 'Ver todos os projetos' })).toBeTruthy()
  })

  it('os textos existem em pt e en', () => {
    for (const dict of [kanbanPt, kanbanEn]) {
      for (const key of ['projects.switcher.aria', 'projects.switcher.title', 'projects.switcher.seeAll']) {
        expect((dict as Record<string, string>)[key], key).toBeTruthy()
      }
    }
  })
})
