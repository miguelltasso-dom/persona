// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileChangeRow, fileTypeOf, summarizeFileChanges, type FileChange } from '../src/client/primitives/FileChange.tsx'

afterEach(cleanup)
const labels = { kind: { new: 'Novo', changed: 'Mudou', deleted: 'Apagado' }, deletedNote: 'Este arquivo sai da pasta', show: 'Ver antes e depois', hide: 'Esconder antes e depois' }
const sum = {
  files: (n: number) => (n === 1 ? '1 arquivo' : `${n} arquivos`),
  new: (n: number) => (n === 1 ? '1 novo' : `${n} novos`),
  changed: (n: number) => (n === 1 ? '1 mudou' : `${n} mudaram`),
  deleted: (n: number) => (n === 1 ? '1 apagado' : `${n} apagados`),
}

describe('FileChange (SIMPLE-WORKSPACE-SPEC §3)', () => {
  it('summary in words, never line counts', () => {
    const c: FileChange[] = [
      { id: 'a', name: 'cardapio.docx', kind: 'new', type: 'text' },
      { id: 'b', name: 'precos.xlsx', kind: 'changed', type: 'sheet' },
      { id: 'c', name: 'logo.png', kind: 'changed', type: 'image' },
    ]
    const s = summarizeFileChanges(c, sum)
    expect(s).toBe('3 arquivos: 1 novo, 2 mudaram')
    expect(s).not.toMatch(/linha|\+|−|diff/u)
  })

  it('guesses the type from the extension', () => {
    expect(fileTypeOf('Cardápio.DOCX')).toBe('text')
    expect(fileTypeOf('precos.xlsx')).toBe('sheet')
    expect(fileTypeOf('foto.jpeg')).toBe('image')
    expect(fileTypeOf('contrato.pdf')).toBe('pdf')
    expect(fileTypeOf('backup.zip')).toBe('other')
  })

  it('a deleted file says so in words (not only color) and the row expands accessibly', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<ul><FileChangeRow change={{ id: 'd', name: 'velho.docx', folder: 'Cardápio/2025', kind: 'deleted', type: 'text' }} labels={labels} onToggle={onToggle} /></ul>)
    expect(screen.getByText('Apagado')).toBeTruthy()
    expect(screen.getByText('Este arquivo sai da pasta')).toBeTruthy()
    const btn = screen.getByRole('button', { name: /velho\.docx/u })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
    rerender(<ul><FileChangeRow change={{ id: 'd', name: 'velho.docx', kind: 'deleted', type: 'text' }} labels={labels} onToggle={onToggle} expanded><p>antes/depois</p></FileChangeRow></ul>)
    expect(screen.getByRole('button', { name: /velho\.docx/u }).getAttribute('aria-controls')).toBe('file-change-d')
    expect(screen.getByText('antes/depois')).toBeTruthy()
  })
})
