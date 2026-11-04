// @vitest-environment jsdom
// SW-8 acceptance: Revisar mudanças in plain words — files with Novo/Mudou/Apagado, before/after by type,
// apply states, conflict choices, three actions — and a jargon scan over everything the person can read.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftReviewPanel } from '../src/client/review/simple/DraftReviewPanel.tsx'
import { conflictCopyName } from '../src/client/review/simple/ConflictChoices.tsx'
import { AppliedToast, APPLIED_TOAST_MS } from '../src/client/review/simple/AppliedToast.tsx'
import type { DraftFileUi } from '../src/client/review/simple/draft-types.ts'
import { diffLines } from '../src/client/review/simple/text-diff.ts'
import { en as reviewEn, pt as reviewPt } from '../src/client/locale/review/locales.ts'
import { en as kanbanEn, pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

/** SIMPLE-WORKSPACE-SPEC §1 "nunca diga", pt + en. */
const JARGON = /\b(git|worktree|branch|branches|diff|patch|merge|commit|push|rollback|reset|snapshot|integrar|reverter|linhas?|lines?|reposit[oó]rio|repository|ponto de restaura[cç][aã]o|restore point)\b/iu

const doc: DraftFileUi = {
  id: 'cardapio/cardapio.md',
  name: 'cardapio.md',
  folder: 'Cardápio/2026',
  kind: 'changed',
  type: 'text',
  ops: diffLines('# Preços\nPão: R$ 12\nBolo: R$ 30\n', '# Preços\nPão: R$ 14\nBolo: R$ 30\n'),
}
const sheet: DraftFileUi = {
  id: 'precos.xlsx',
  name: 'precos.xlsx',
  kind: 'changed',
  type: 'sheet',
  cells: [
    { sheet: 'Preços', cell: 'C4', before: 'R$ 12', after: 'R$ 14' },
    { sheet: 'Preços', cell: 'C5', before: 'R$ 30', after: 'R$ 32' },
  ],
}
const image: DraftFileUi = { id: 'logo.png', name: 'logo.png', kind: 'changed', type: 'image', beforeImageSrc: 'data:image/png;base64,AAAA', afterImageSrc: 'data:image/png;base64,BBBB' }
const pdf: DraftFileUi = { id: 'contrato.pdf', name: 'contrato.pdf', kind: 'new', type: 'pdf', canOpenDraft: true }
const gone: DraftFileUi = { id: 'velho.txt', name: 'velho.txt', kind: 'deleted', type: 'text', ops: diffLines('adeus\n', '') }

function renderPanel(props: Partial<React.ComponentProps<typeof DraftReviewPanel>> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <DraftReviewPanel personaName="Bia" files={[doc, sheet, image, pdf, gone]} onApply={() => {}} {...props} />
    </PreviewFrame>,
  )
}

const open = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name, 'u') }))
}

describe('Revisar mudanças, em palavras', () => {
  it('header, the question and the summary use words — never line counts', () => {
    renderPanel()
    expect(screen.getByRole('heading', { level: 1, name: 'Revisar mudanças' })).toBeTruthy()
    expect(screen.getByText('Bia fez isto num rascunho. Sua pasta ainda não mudou.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Aplico estas mudanças na sua pasta?' })).toBeTruthy()
    expect(screen.getByText('5 arquivos: 1 novo, 3 mudaram, 1 apagado')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/[+−]\d+|linhas/u)
  })

  it('each file shows its Novo/Mudou/Apagado chip; a deleted file also says it leaves the folder (never colour alone)', () => {
    renderPanel()
    expect(screen.getByText('Cardápio/2026')).toBeTruthy()
    expect(screen.getAllByText('Mudou').length).toBe(3)
    expect(screen.getByText('Novo')).toBeTruthy()
    expect(screen.getByText('Apagado')).toBeTruthy()
    expect(screen.getByText('Este arquivo sai da pasta')).toBeTruthy()
  })

  it('text: Antes and Depois; what left is struck (<del>), what came in is underlined (<ins>)', () => {
    renderPanel()
    open('cardapio.md')
    const table = screen.getByRole('table')
    expect(within(table).getByText('Pão: R$ 12').tagName).toBe('DEL')
    expect(within(table).getByText('Pão: R$ 14').tagName).toBe('INS')
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Antes', 'Depois'])
    // narrow window → tabs "Antes / Depois" exist in the DOM (CSS shows them by the review's width)
    expect(screen.getByRole('tablist', { name: 'Versão do texto' })).toBeTruthy()
  })

  it('a deleted file opens on "Antes" (nothing "Depois" to show), a new one on "Depois"', () => {
    renderPanel({ files: [gone] }) // a single file opens by itself
    expect(screen.getByRole('tab', { name: 'Antes', selected: true })).toBeTruthy()
    expect(screen.getByText('adeus').tagName).toBe('DEL')
    cleanup()
    renderPanel({ files: [{ ...doc, id: 'novo.md', name: 'novo.md', kind: 'new', ops: diffLines('', 'oi\n') }] })
    expect(screen.getByRole('tab', { name: 'Depois', selected: true })).toBeTruthy()
  })

  it('spreadsheet: "2 células mudaram" and one line per cell, "Preços › C4: R$ 12 → R$ 14"', () => {
    renderPanel()
    open('precos.xlsx')
    expect(screen.getByText('2 células mudaram')).toBeTruthy()
    expect(screen.getByText('Preços › C4: R$ 12 → R$ 14')).toBeTruthy()
  })

  it('image: both versions side by side (the Antes/Depois control only matters when narrow) and the active one is marked', () => {
    renderPanel()
    open('logo.png')
    expect(screen.getByAltText('logo.png · Antes')).toBeTruthy()
    expect(screen.getByAltText('logo.png · Depois')).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Ver a imagem' })
    // starts on "Depois": the narrow layout shows one image, and the active button says which
    expect(within(group).getByRole('button', { name: 'Depois' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: 'Antes' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(within(group).getByRole('button', { name: 'Antes' }))
    expect(within(group).getByRole('button', { name: 'Antes' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: 'Depois' }).getAttribute('aria-pressed')).toBe('false')
    expect(group.closest('[data-view]')?.getAttribute('data-view')).toBe('before')
    // pressing the active one keeps it active (it is a choice of two, not an on/off)
    fireEvent.click(within(group).getByRole('button', { name: 'Antes' }))
    expect(within(group).getByRole('button', { name: 'Antes' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('PDF and other types: "Não dá para mostrar a prévia" + open the draft file read-only', () => {
    const onOpenDraftFile = vi.fn()
    renderPanel({ onOpenDraftFile })
    open('contrato.pdf')
    expect(screen.getByText('Não dá para mostrar a prévia deste tipo.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o arquivo do rascunho' }))
    expect(onOpenDraftFile).toHaveBeenCalledWith('contrato.pdf')
  })

  it('the three actions: Aplicar na pasta (primary), Pedir ajustes (asks what to change), Descartar (asks first)', () => {
    const onApply = vi.fn()
    const onRequestChanges = vi.fn()
    const onDiscard = vi.fn()
    renderPanel({ onApply, onRequestChanges, onDiscard })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar na pasta' }))
    expect(onApply).toHaveBeenCalledWith({})

    fireEvent.click(screen.getByRole('button', { name: 'Pedir ajustes' }))
    expect(screen.getByLabelText('O que precisa mudar?')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('O que precisa mudar?'), { target: { value: 'Use o preço novo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }))
    expect(onRequestChanges).toHaveBeenCalledWith('Use o preço novo')

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Descartar o rascunho?')).toBeTruthy()
    expect(within(dialog).getByText('As mudanças de Bia somem. Sua pasta continua como está.')).toBeTruthy()
    expect(onDiscard).not.toHaveBeenCalled() // never without asking
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})

describe('Aplicar na pasta: estados', () => {
  it('applying: the button says "Aplicando…" and nothing else can be started', () => {
    renderPanel({ phase: { kind: 'applying' } })
    expect(screen.getByRole('button', { name: 'Aplicando…' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pedir ajustes' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Descartar' }).hasAttribute('disabled')).toBe(true)
  })

  it('a file open in another program: "Feche {arquivo} para eu aplicar as mudanças." + Tentar de novo', () => {
    const onRetry = vi.fn()
    renderPanel({ phase: { kind: 'locked', file: 'precos.xlsx' }, onRetry })
    expect(screen.getByText('Feche precos.xlsx para eu aplicar as mudanças.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('OneDrive: "Baixando {arquivo} do OneDrive…" with progress, and Aplicar waits', () => {
    renderPanel({ phase: { kind: 'downloading', file: 'cardapio.docx', percent: 40 } })
    expect(screen.getAllByText('Baixando cardapio.docx do OneDrive…').length).toBeGreaterThan(0)
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('40')
    expect(screen.getByRole('button', { name: 'Aplicar na pasta' }).hasAttribute('disabled')).toBe(true)
  })

  it('any other failure: plain sentence, "Sua pasta não mudou", support detail folded', () => {
    renderPanel({ phase: { kind: 'failed', detail: 'ENOSPC: no space left on device' }, onRetry: () => {} })
    expect(screen.getByText('Não consegui aplicar agora. Sua pasta não mudou.')).toBeTruthy()
    expect(screen.getByText('Detalhes para o suporte').closest('details')?.textContent).toContain('ENOSPC')
  })
})

describe('"Aplicado na pasta" · Desfazer', () => {
  it('shows Desfazer only when the host gave a way back; no false Undo', () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()
    const { unmount } = render(<AppliedToast onUndo={onUndo} onDismiss={onDismiss} />)
    expect(screen.getByText('Aplicado na pasta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalled()
    unmount()
    render(<AppliedToast onDismiss={() => {}} />)
    expect(screen.getByText('Aplicado na pasta')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('leaves by itself after 6 s', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<AppliedToast onUndo={() => {}} onDismiss={onDismiss} />)
    act(() => { vi.advanceTimersByTime(APPLIED_TOAST_MS - 100) })
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('Conflito por arquivo', () => {
  const clash: DraftFileUi = { ...doc, id: 'cardapio.docx', name: 'cardapio.docx', folder: undefined, conflict: true }

  it('the file row says "Escolha o que fica" (warning) instead of "Mudou"; "Ver as duas versões" only when the folder text is known', () => {
    const { unmount } = renderPanel({ files: [clash, pdf] })
    const row = screen.getByRole('button', { name: /cardapio.docx/u }).closest('li') as HTMLElement
    expect(within(row).getByText('Escolha o que fica')).toBeTruthy()
    expect(within(row).queryByText('Mudou')).toBeNull()
    expect(screen.queryByText('Ver as duas versões lado a lado')).toBeNull()
    unmount()
    renderPanel({ files: [{ ...clash, folderText: '# Preços\nPão: R$ 13\nBolo: R$ 30\n' }, pdf] })
    const compare = screen.getByText('Ver as duas versões lado a lado').closest('details') as HTMLElement
    expect(within(compare).getAllByText('Na sua pasta').length).toBeGreaterThan(0) // column header (and its narrow tab)
    expect(within(compare).getAllByText('No rascunho de Bia').length).toBeGreaterThan(0)
    expect(within(compare).getByText('Pão: R$ 13').tagName).toBe('DEL') // what is in the folder now
    expect(within(compare).getByText('Pão: R$ 14').tagName).toBe('INS') // what the draft has
  })

  it('Aplicar waits for an answer on every clashing file; the three choices are plain, "Manter os dois" is recommended', () => {
    const onApply = vi.fn()
    renderPanel({ files: [clash, pdf], onApply })
    expect(screen.getByRole('heading', { level: 4, name: 'Você e Bia mudaram cardapio.docx' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aplicar na pasta' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Escolha o que fica em 1 arquivo antes de aplicar.')).toBeTruthy()
    expect(screen.getByText('Recomendado')).toBeTruthy()
    expect(screen.getByText('Salva a versão de Bia como “cardapio (de Bia).docx” ao lado da sua.')).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/Ficar com o de Bia/u))
    expect(screen.getByRole('button', { name: 'Aplicar na pasta' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar na pasta' }))
    expect(onApply).toHaveBeenCalledWith({ 'cardapio.docx': 'theirs' })
  })

  it('the copy name keeps the extension: "{nome} (de {Persona}).{ext}"', () => {
    expect(conflictCopyName('cardapio.docx', 'Bia')).toBe('cardapio (de Bia).docx')
    expect(conflictCopyName('LEIAME', 'Bia')).toBe('LEIAME (de Bia)')
  })
})

describe('varredura de jargão (SIMPLE-WORKSPACE-SPEC §1 e Aceite 1)', () => {
  it('no word of the "nunca diga" list in the review or kanban copy, in either language', () => {
    for (const [label, dict] of [['review pt', reviewPt], ['review en', reviewEn], ['kanban pt', kanbanPt], ['kanban en', kanbanEn]] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect({ label, key, value, hit: JARGON.test(value) }).toMatchObject({ hit: false })
      }
    }
  })

  it('nothing on screen says it either — every state the person can reach, with the host words folded', () => {
    const states: Partial<React.ComponentProps<typeof DraftReviewPanel>>[] = [
      {},
      { phase: { kind: 'applying' } },
      { phase: { kind: 'locked', file: 'precos.xlsx' } },
      { phase: { kind: 'downloading', file: 'cardapio.docx', percent: 10 } },
      { phase: { kind: 'failed', detail: 'git: fatal: index.lock exists' }, onRetry: () => {} },
      { blocked: true, blockedDetail: 'CONFLICT (content): Merge conflict in a.md' },
      { files: [{ ...doc, conflict: true }] },
    ]
    for (const props of states) {
      const view = renderPanel(props)
      for (const name of ['cardapio.md', 'precos.xlsx', 'logo.png', 'contrato.pdf', 'velho.txt']) {
        const toggle = screen.queryByRole('button', { name: new RegExp(name, 'u') })
        if (toggle !== null && toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle)
      }
      const folded = [...document.querySelectorAll('details')].map(node => node.textContent ?? '')
      let readable = document.body.textContent ?? ''
      for (const text of folded) readable = readable.replace(text, '')
      // file names and folders belong to the person's own files, not to our vocabulary
      const hit = JARGON.exec(readable)
      expect({ props: Object.keys(props), hit: hit?.[0] }).toMatchObject({ hit: undefined })
      view.unmount()
    }
  })
})
