// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchPlaceholderView, foldForSearch } from '../src/client/shell/SearchPlaceholderView.tsx'
import { SEARCH_FOCUS_EVENT } from '../src/client/shell/nav-groups.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { RailPersona } from '../src/client/shell/RailTeam.tsx'

afterEach(() => { cleanup() })

const t = (key: string, vars?: Readonly<Record<string, string>>): string => {
  let text: string = shellPt[key as keyof typeof shellPt] ?? key
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replace(`{${name}}`, value)
  return text
}
const TEAM = [{ id: 'p-nina', characterId: 'nina', name: 'Nina', role: 'Pesquisa', state: 'idle', unread: 0 }] as unknown as readonly RailPersona[]
const useTeam = <T,>(selector: (rows: readonly RailPersona[]) => T): T => selector(TEAM)

describe('Busca / Ctrl K "Ir para" (UX-06)', () => {
  it('folds accents and case', () => {
    expect(foldForSearch('  Conexões ')).toBe('conexoes')
  })

  it('finds a screen hidden in a folded rail group, accent-insensitive, Enter opens it', () => {
    const navigate = vi.fn()
    render(<SearchPlaceholderView t={t as never} useTeam={useTeam as never} navigate={navigate} />)
    const field = screen.getByRole('searchbox')
    fireEvent.change(field, { target: { value: 'conexoes' } })
    expect(screen.getByRole('button', { name: 'Conexões' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rotinas' })).toBeNull()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith('connections')
  })

  it('finds personas by name or role and opens the profile', () => {
    const open = vi.fn()
    render(<SearchPlaceholderView t={t as never} useTeam={useTeam as never} navigate={() => undefined} openPersonaProfile={open} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pesq' } })
    fireEvent.click(screen.getByRole('button', { name: /Nina/u }))
    expect(open).toHaveBeenCalledWith('p-nina')
  })

  it('honest empty state when nothing matches; Ctrl K event refocuses the field', () => {
    render(<SearchPlaceholderView t={t as never} useTeam={useTeam as never} navigate={() => undefined} />)
    const field = screen.getByRole('searchbox')
    fireEvent.change(field, { target: { value: 'zzzz' } })
    expect(screen.getByText('Nada com “zzzz” por aqui')).toBeTruthy()
    field.blur()
    window.dispatchEvent(new Event(SEARCH_FOCUS_EVENT))
    expect(document.activeElement).toBe(field)
  })
})

describe('Ctrl K that DOES (harvest §2)', () => {
  it('shows "Fazer" with matching global actions and the found persona\'s actions', () => {
    const hire = vi.fn()
    const talk = vi.fn()
    render(
      <SearchPlaceholderView
        t={t as never}
        useTeam={useTeam as never}
        navigate={() => undefined}
        actions={[{ id: 'hire', label: 'Contratar persona', keywords: ['nova persona'], run: hire }]}
        personaActions={p => [{ id: `talk-${p.id}`, label: `Conversar com ${p.name}`, run: talk }]}
      />,
    )
    const field = screen.getByRole('searchbox')
    fireEvent.change(field, { target: { value: 'nova persona' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(hire).toHaveBeenCalled()
    fireEvent.change(field, { target: { value: 'nina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conversar com Nina' }))
    expect(talk).toHaveBeenCalled()
  })
})
