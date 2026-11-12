// @vitest-environment jsdom
// P1-10 (Muse 07:07): a lista e o editor da janela de silêncio da EQUIPE INTEIRA (só o que o host obedece: início e fim, todo dia).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pt as rulesPt } from '../src/client/locale/rules/locales.ts'
import { QuietWindows, crossesMidnight, hourLabel, isQuietNow, type QuietWindowRow } from '../src/client/rules/QuietWindows.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const NIGHT: QuietWindowRow = { id: 'q-noite', label: 'Silêncio da equipe', start: '22:00', end: '07:00' }
const DAY: QuietWindowRow = { id: 'q-dia', label: 'Silêncio da equipe', start: '09:00', end: '18:00' }

function view(props: Partial<Parameters<typeof QuietWindows>[0]> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <QuietWindows dict={rulesPt} windows={[NIGHT]} onSave={vi.fn(async () => undefined)} onDelete={vi.fn(async () => undefined)} now={() => new Date(2026, 10, 12, 12, 0)} {...props} />
    </PreviewFrame>,
  )
}

describe('as contas da janela', () => {
  it('hora em palavras de leigo e a janela que passa da meia-noite', () => {
    expect(hourLabel('22:00')).toBe('22h')
    expect(hourLabel('07:30')).toBe('7h30')
    expect(crossesMidnight(NIGHT)).toBe(true)
    expect(crossesMidnight(DAY)).toBe(false)
  })

  it('agora está dentro da janela (fim exclusivo; a noturna atravessa a meia-noite)', () => {
    expect(isQuietNow(NIGHT, new Date(2026, 10, 12, 23, 30))).toBe(true)
    expect(isQuietNow(NIGHT, new Date(2026, 10, 12, 6, 59))).toBe(true)
    expect(isQuietNow(NIGHT, new Date(2026, 10, 12, 7, 0))).toBe(false)
    expect(isQuietNow(DAY, new Date(2026, 10, 12, 12, 0))).toBe(true)
    expect(isQuietNow(DAY, new Date(2026, 10, 12, 18, 0))).toBe(false)
  })
})

describe('a lista', () => {
  it('"Toda noite" só quando o fim é na manhã seguinte; senão "Todo dia"; sempre "Toda a equipe" (sem Dias nem Quem: o host não tem)', () => {
    view({ windows: [NIGHT, DAY] })
    expect(screen.getByText('Toda noite · 22h às 7h · Toda a equipe')).toBeTruthy()
    expect(screen.getByText('Todo dia · 9h às 18h · Toda a equipe')).toBeTruthy()
    expect(screen.queryByText(/Dias úteis|Fim de semana/u)).toBeNull()
  })

  it('"Agora em silêncio até 7h" só quando é hora de silêncio', () => {
    view({ now: () => new Date(2026, 10, 12, 23, 30) })
    expect(screen.getByText('Agora em silêncio até 7h')).toBeTruthy()
    cleanup()
    view({ now: () => new Date(2026, 10, 12, 12, 0) })
    expect(screen.queryByText(/Agora em silêncio/u)).toBeNull()
  })

  it('sem handler é só leitura: nenhuma chave, nenhum Editar, nenhum botão de nova janela', () => {
    view({ onSave: undefined, onDelete: undefined })
    expect(screen.getByText('Toda noite · 22h às 7h · Toda a equipe')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Nova janela de silêncio' })).toBeNull()
  })
})

describe('desligar pela chave', () => {
  it('apaga no host na hora, guarda o rascunho com "Janela desligada · Desfazer", e Desfazer grava de volta com os MESMOS campos', async () => {
    const onSave = vi.fn(async () => undefined)
    const onDelete = vi.fn(async () => undefined)
    view({ onSave, onDelete })
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => { expect(onDelete).toHaveBeenCalledWith('q-noite') })
    expect(await screen.findByText('Janela desligada')).toBeTruthy()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledWith(NIGHT) })
    await waitFor(() => { expect(screen.queryByText('Janela desligada')).toBeNull() })
  })

  it('o host recusou: a chave não muda e a tela diz que não deu', async () => {
    view({ onDelete: vi.fn(async () => { throw new Error('forbidden') }) })
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByText('Não consegui salvar a janela. Tente de novo.')).toBeTruthy()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })
})

describe('apagar', () => {
  it('o botão "Apagar" (não um "⋯" que promete menu) pede a confirmação NA LINHA, com o foco em "Manter"; Manter fecha e Apagar apaga no host', async () => {
    const onDelete = vi.fn(async () => undefined)
    view({ onDelete })
    expect(screen.queryByRole('button', { name: 'Mais opções' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(screen.getByText('Apagar esta janela?')).toBeTruthy()
    // Enquanto a confirmação está aberta só há UM "Apagar" (o da confirmação, em perigo): o da linha some.
    expect(screen.getAllByRole('button', { name: 'Apagar' })).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Manter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manter' }))
    expect(screen.queryByText('Apagar esta janela?')).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    await waitFor(() => { expect(onDelete).toHaveBeenCalledWith('q-noite') })
  })

  it('o chip "Agora em silêncio" não é âmbar (âmbar é "espera você"): leva o tom de "Descansando"', () => {
    view({ now: () => new Date(2026, 10, 12, 23, 30) })
    const chip = screen.getByText('Agora em silêncio até 7h').closest('span')!
    expect(chip.className).toMatch(/quietNowChip/u)
    expect(chip.className).not.toMatch(/accent/u)
  })
})

describe('o formulário', () => {
  it('"+ Nova janela de silêncio" abre o formulário na própria lista e grava com início e fim (a frase do que a janela faz está ali)', async () => {
    const onSave = vi.fn(async (item: QuietWindowRow) => { void item })
    view({ windows: [], onSave })
    expect(screen.getByText('Nenhuma janela de silêncio ainda.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Nova janela de silêncio' }))
    expect(screen.getByText('Nesse horário a equipe não começa nada sozinha e não manda mensagens nem sons. O que pode esperar, espera.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Das'), { target: { value: '21:30' } })
    fireEvent.change(screen.getByLabelText('às'), { target: { value: '06:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: 'Silêncio da equipe', start: '21:30', end: '06:00' })) })
    expect(onSave.mock.calls[0]![0].id.startsWith('quiet-')).toBe(true)
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull() })
  })

  it('duas horas iguais não salvam (não faria silêncio nenhum): a tela diz e o botão fica parado', () => {
    const onSave = vi.fn(async () => undefined)
    view({ windows: [], onSave })
    fireEvent.click(screen.getByRole('button', { name: '+ Nova janela de silêncio' }))
    fireEvent.change(screen.getByLabelText('às'), { target: { value: '22:00' } })
    expect(screen.getByText('Escolha duas horas diferentes.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Editar abre a janela com os horários dela e salva com o MESMO id', async () => {
    const onSave = vi.fn(async () => undefined)
    view({ onSave })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect((screen.getByLabelText('Das') as HTMLInputElement).value).toBe('22:00')
    fireEvent.change(screen.getByLabelText('às'), { target: { value: '08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledWith({ id: 'q-noite', label: 'Silêncio da equipe', start: '22:00', end: '08:00' }) })
  })

  it('o host recusou: o formulário continua aberto com o que a pessoa escreveu e a tela diz que não deu', async () => {
    view({ windows: [], onSave: vi.fn(async () => { throw new Error('forbidden') }) })
    fireEvent.click(screen.getByRole('button', { name: '+ Nova janela de silêncio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Não consegui salvar a janela. Tente de novo.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy()
  })
})
