// @vitest-environment jsdom
// Item 15 (colheita), importar logins do Chrome/Bitwarden (Muse 12/11): prévia SEM senha antes de guardar; o arquivo nunca é desenhado.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CofreScreen, type CofreScreenProps } from '../src/client/cofre/CofreScreen.tsx'
import { counted, resultLine } from '../src/client/cofre/CofreImportDialog.tsx'
import { cofreGroups, type HostImportPreview, type HostImportResult } from '../src/client/cofre/cofre-wire.ts'
import { pt as cofrePt } from '../src/client/locale/cofre/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(cofrePt, key, params)) as CofreScreenProps['t']

const CSV = 'name,url,username,password\nML,https://mercadolivre.com.br,loja@x.com,SENHA-SECRETA-123\n'

const PREVIEW: HostImportPreview = {
  format: 'chrome',
  entries: [
    { line: 2, title: 'Mercado Livre', site: 'mercadolivre.com.br', username: 'loja@x.com' },
    { line: 3, title: 'Shopee', site: 'shopee.com.br', username: 'loja@x.com' },
  ],
  duplicates: [{ line: 4, title: 'Canva', site: 'canva.com', username: 'ana', reason: 'no-cofre' }, { line: 5, title: 'Canva', site: 'canva.com', username: 'ana', reason: 'no-arquivo' }],
  ignored: [{ line: 6, reason: 'Sem o endereço do site.' }],
}

function screenWith(over: Partial<CofreScreenProps> = {}): CofreScreenProps {
  return {
    state: 'ready',
    groups: cofreGroups([]),
    sealable: true,
    onSaveCompany: vi.fn(async () => undefined),
    onSaveLogin: vi.fn(async () => undefined),
    onPreviewImport: vi.fn(async () => PREVIEW),
    onCommitImport: vi.fn(async (): Promise<HostImportResult> => ({ imported: 2, duplicates: 2, ignored: 1 })),
    t,
    ...over,
  }
}

function pick(text: string, name = 'senhas.csv'): void {
  const input = screen.getByLabelText('Escolher arquivo') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/csv' })] } })
}

describe('as frases', () => {
  it('conta no singular e no plural, e a linha do resultado só nomeia o que não é zero', () => {
    expect(counted(t, 'preview.save', 1)).toBe('1 login para guardar')
    expect(counted(t, 'preview.save', 12)).toBe('12 logins para guardar')
    expect(counted(t, 'preview.dup', 3)).toBe('3 já estão no Cofre')
    expect(counted(t, 'preview.ignored', 1)).toBe('1 ignorado')
    expect(resultLine(t, { imported: 12, duplicates: 3, ignored: 1 })).toBe('12 logins guardados (3 repetidos, 1 ignorado)')
    expect(resultLine(t, { imported: 1, duplicates: 0, ignored: 0 })).toBe('1 login guardado')
    expect(resultLine(t, { imported: 5, duplicates: 0, ignored: 2 })).toBe('5 logins guardados (2 ignorados)')
  })
})

describe('importar do Chrome ou Bitwarden', () => {
  it('o botão fica no convite do Cofre vazio e no cabeçalho depois; sem o cofre do Windows, desabilitado; sem handler, não existe', () => {
    const { unmount } = render(<CofreScreen {...screenWith()} />)
    expect(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' })).toBeTruthy()
    unmount()
    const { unmount: second } = render(<CofreScreen {...screenWith({ sealable: false })} />)
    expect((screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }) as HTMLButtonElement).disabled).toBe(true)
    second()
    const { onPreviewImport: _preview, onCommitImport: _commit, ...bare } = screenWith()
    void [_preview, _commit]
    render(<CofreScreen {...bare} />)
    expect(screen.queryByRole('button', { name: 'Importar do Chrome ou Bitwarden' })).toBeNull()
  })

  it('escolher o arquivo mostra a PRÉVIA: a frase, o que entra, o que já está e o que foi ignorado, com o motivo; nenhuma senha na tela', async () => {
    const onPreview = vi.fn(async () => PREVIEW)
    const { baseElement } = render(<CofreScreen {...screenWith({ onPreviewImport: onPreview })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Apague o arquivo depois: ele tem as suas senhas.')).toBeTruthy()
    pick(CSV)
    await waitFor(() => { expect(within(dialog).getByText('2 logins para guardar · 2 já estão no Cofre · 1 ignorado')).toBeTruthy() })
    expect(onPreview).toHaveBeenCalledWith(CSV)
    expect(within(dialog).getByText('Arquivo do Chrome')).toBeTruthy()
    expect(within(dialog).getByText('Mercado Livre')).toBeTruthy()
    expect(within(dialog).getByText(/já está no Cofre/u)).toBeTruthy()
    expect(within(dialog).getByText(/repetido no arquivo/u)).toBeTruthy()
    expect(within(dialog).getByText('Sem o endereço do site.')).toBeTruthy()
    expect(within(dialog).getByText('linha 6')).toBeTruthy()
    expect(baseElement.textContent).not.toContain('SENHA-SECRETA-123')
    expect(within(dialog).getByRole('button', { name: 'Guardar 2' })).toBeTruthy()
  })

  it('Guardar manda o MESMO texto, fecha o diálogo e deixa o aviso "12 logins guardados (3 repetidos, 1 ignorado)"', async () => {
    const onCommit = vi.fn(async (): Promise<HostImportResult> => ({ imported: 12, duplicates: 3, ignored: 1 }))
    render(<CofreScreen {...screenWith({ onCommitImport: onCommit })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }))
    pick(CSV)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Guardar 2' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 2' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(onCommit).toHaveBeenCalledWith(CSV)
    expect(screen.getByText('12 logins guardados (3 repetidos, 1 ignorado)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText(/logins guardados/u)).toBeNull()
  })

  it('Voltar descarta o arquivo; formato desconhecido e arquivo grande demais param no primeiro passo com a frase', async () => {
    const onPreview = vi.fn(async (): Promise<HostImportPreview> => ({ format: 'desconhecido', entries: [], duplicates: [], ignored: [] }))
    render(<CofreScreen {...screenWith({ onPreviewImport: onPreview })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }))
    pick('qualquer coisa')
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Formato não reconhecido.') })
    expect(screen.getByRole('button', { name: 'Escolher arquivo' })).toBeTruthy()
    const input = screen.getByLabelText('Escolher arquivo') as HTMLInputElement
    const big = new File(['x'], 'grande.csv', { type: 'text/csv' })
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [big] } })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('grande demais') })
    expect(onPreview).toHaveBeenCalledTimes(1) // o grande nem chegou ao host
  })

  it('uma prévia sem nada novo não deixa guardar; Voltar volta ao primeiro passo', async () => {
    render(<CofreScreen {...screenWith({ onPreviewImport: vi.fn(async (): Promise<HostImportPreview> => ({ ...PREVIEW, entries: [] })) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }))
    pick(CSV)
    await waitFor(() => { expect(screen.getByText('Nada novo para guardar neste arquivo.')).toBeTruthy() })
    expect((screen.getByRole('button', { name: 'Guardar 0' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('button', { name: 'Escolher arquivo' })).toBeTruthy()
  })

  it('uma falha ao guardar aparece em palavras e a prévia continua na tela', async () => {
    render(<CofreScreen {...screenWith({ onCommitImport: vi.fn(async () => { throw new Error('O cofre do Windows recusou.') }) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }))
    pick(CSV)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Guardar 2' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 2' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('O cofre do Windows recusou.') })
    expect(screen.getByText('Mercado Livre')).toBeTruthy()
  })

  it('Cancelar fecha sem chamar o host de novo', () => {
    const onCommit = vi.fn(async (): Promise<HostImportResult> => ({ imported: 0, duplicates: 0, ignored: 0 }))
    render(<CofreScreen {...screenWith({ onCommitImport: onCommit })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar do Chrome ou Bitwarden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
