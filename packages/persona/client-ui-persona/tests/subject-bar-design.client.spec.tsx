// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubjectBar } from '../src/client/chat/SubjectBar.tsx'
import type { ConversationSubjectUi } from '../src/client/chat/conversation-subjects.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

afterEach(() => { cleanup() })

const t = (key: string, vars?: Readonly<Record<string, string>>): string => {
  let text: string = chatPt[key as keyof typeof chatPt] ?? key
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replace(`{${name}}`, value)
  return text
}

const SUBJECTS: readonly ConversationSubjectUi[] = [
  { id: 'geral', name: 'Geral', colorIndex: 0, unreadCount: 0 },
  { id: 'ui', name: 'UI', colorIndex: 4, unreadCount: 3, working: true, workingName: 'Nina' },
  { id: 'novo', name: '', colorIndex: 2, unreadCount: 0 },
]

describe('SubjectBar (Muse, WAVE2-SPEC a)', () => {
  it('names every subject (color name when unnamed) and announces unread + who is working', () => {
    render(<SubjectBar t={t as never} subjects={SUBJECTS} activeSubjectId="geral" onSelect={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Menta' })).toBeTruthy()
    const ui = screen.getByRole('tab', { name: /UI/u })
    expect(ui.textContent).toContain('3 não lidas neste assunto')
    expect(ui.textContent).toContain('Nina está trabalhando aqui')
    expect(screen.getByRole('tab', { name: 'Geral' }).getAttribute('aria-selected')).toBe('true')
  })

  it('keeps ⋯ and + outside the tablist; rename inline saves with Enter', () => {
    const onRename = vi.fn()
    const onCreate = vi.fn()
    render(<SubjectBar t={t as never} subjects={SUBJECTS} activeSubjectId="ui" onSelect={() => undefined} onRename={onRename} onCreate={onCreate} onArchive={() => undefined} />)
    const tablist = screen.getByRole('tablist')
    expect([...tablist.children].every(child => child.getAttribute('role') === 'tab')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Novo assunto' }))
    expect(onCreate).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações para UI' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }))
    const field = screen.getByRole('textbox', { name: 'Nome do assunto' })
    fireEvent.change(field, { target: { value: 'Telas' } })
    fireEvent.submit(field.closest('form')!)
    expect(onRename).toHaveBeenCalledWith('ui', 'Telas')
  })

  it('Shift+F10 on the active tab opens its menu; arrows/Home/End move', () => {
    const onSelect = vi.fn()
    render(<SubjectBar t={t as never} subjects={SUBJECTS} activeSubjectId="geral" onSelect={onSelect} onRename={() => undefined} />)
    const geral = screen.getByRole('tab', { name: 'Geral' })
    fireEvent.keyDown(geral, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('menu', { name: 'Mais ações para Geral' })).toBeTruthy()
    fireEvent.keyDown(geral, { key: 'End' })
    expect(onSelect).toHaveBeenCalledWith('novo')
  })

  it('+ is disabled with an explanation at 7 subjects', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, colorIndex: i as ConversationSubjectUi['colorIndex'], unreadCount: 0 }))
    render(<SubjectBar t={t as never} subjects={seven} activeSubjectId="s0" onSelect={() => undefined} onCreate={() => undefined} />)
    expect((screen.getByRole('button', { name: /Até 7 assuntos/u }) as HTMLButtonElement).disabled).toBe(true)
  })
})
