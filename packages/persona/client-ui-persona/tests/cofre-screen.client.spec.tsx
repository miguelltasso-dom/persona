// @vitest-environment jsdom
// Item 15 (colheita), Configurações › Cofre (Muse 12/11): ficha, logins e chaves; painel lateral; nunca mostra nem preenche segredo.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CofreScreen, type CofreScreenProps } from '../src/client/cofre/CofreScreen.tsx'
import { cofreGroups, cofreIsEmpty, type HostCofreEntry } from '../src/client/cofre/cofre-wire.ts'
import { pt as cofrePt } from '../src/client/locale/cofre/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(cofrePt, key, params)) as CofreScreenProps['t']

function entry(over: Partial<HostCofreEntry> & Pick<HostCofreEntry, 'id' | 'kind' | 'title'>): HostCofreEntry {
  return { projectId: 'p1', fields: {}, hasSecret: false, createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', authorId: 'u1', ...over }
}

const ENTRIES: readonly HostCofreEntry[] = [
  entry({ id: 'c1', kind: 'company', title: 'Padaria Lua Ltda', fields: { legalName: 'Padaria Lua Ltda', document: '12.345.678/0001-90', email: 'oi@padarialua.com.br' } }),
  entry({ id: 'l1', kind: 'login', title: 'Mercado Livre', fields: { site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br' }, hasSecret: true }),
  entry({ id: 'k1', kind: 'key', title: 'Mercado Pago', fields: { service: 'Mercado Pago' }, hasSecret: true }),
]

function screenWith(over: Partial<CofreScreenProps> = {}): CofreScreenProps {
  return {
    state: 'ready',
    groups: cofreGroups(ENTRIES),
    sealable: true,
    onSaveLogin: vi.fn(async () => undefined),
    onSaveKey: vi.fn(async () => undefined),
    onSaveCompany: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    t,
    ...over,
  }
}

describe('o que a tela lê do host', () => {
  it('agrupa em ficha, logins e chaves, na ordem do host, e diz o segundo texto de cada linha', () => {
    const groups = cofreGroups(ENTRIES)
    expect(groups.company?.detail).toBe('12.345.678/0001-90')
    expect(groups.logins.map(row => [row.title, row.detail])).toEqual([['Mercado Livre', 'mercadolivre.com.br · loja@padarialua.com.br']])
    expect(groups.keys.map(row => [row.title, row.detail])).toEqual([['Mercado Pago', 'Mercado Pago']])
    expect(cofreIsEmpty(groups)).toBe(false)
    expect(cofreIsEmpty(cofreGroups([]))).toBe(true)
  })
})

describe('a lista', () => {
  it('mostra os três grupos, o selo "senha guardada" e NENHUM valor secreto', () => {
    const { container } = render(<CofreScreen {...screenWith()} />)
    expect(screen.getByRole('heading', { name: 'Cofre' })).toBeTruthy()
    expect(screen.getByText('Senhas e dados da empresa ficam só neste computador. A equipe usa, mas não vê.')).toBeTruthy()
    for (const name of ['Ficha da empresa', 'Logins', 'Chaves']) expect(screen.getByRole('heading', { name })).toBeTruthy()
    expect(screen.getByText('senha guardada')).toBeTruthy()
    expect(screen.getByText('chave guardada')).toBeTruthy()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(screen.queryByText(/mostrar senha/iu)).toBeNull()
  })

  it('vazio: um convite só, com o menu Adicionar; ficha vazia com dados nos outros grupos convida a preencher', () => {
    const { unmount } = render(<CofreScreen {...screenWith({ groups: cofreGroups([]) })} />)
    expect(screen.getByText('O Cofre está vazio')).toBeTruthy()
    unmount()
    render(<CofreScreen {...screenWith({ groups: cofreGroups(ENTRIES.filter(item => item.kind !== 'company')) })} />)
    expect(screen.getByText('Conte quem é a empresa')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preencher a ficha' })).toBeTruthy()
  })

  it('carregando e erro: o erro tem "Tentar de novo"', () => {
    const retry = vi.fn()
    const { unmount } = render(<CofreScreen {...screenWith({ state: 'loading' })} />)
    expect(screen.getByLabelText('Abrindo o Cofre').getAttribute('aria-busy')).toBe('true')
    unmount()
    render(<CofreScreen {...screenWith({ state: 'error', onRetry: retry })} />)
    expect(screen.getByRole('alert').textContent).toContain('Não deu para abrir o Cofre.')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('sem o cofre do Windows: Login e Chave desabilitados com o motivo; a ficha continua', () => {
    render(<CofreScreen {...screenWith({ sealable: false })} />)
    expect(screen.getByRole('status').textContent).toContain('O cofre do Windows não está disponível neste computador. A ficha da empresa continua funcionando.')
    expect((screen.getByRole('button', { name: 'Editar Mercado Livre' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Editar Mercado Pago' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Editar Padaria Lua Ltda' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('uma ação sem handler não vira botão', () => {
    const { onRemove: _remove, onSaveLogin: _login, onSaveKey: _key, onSaveCompany: _company, ...bare } = screenWith()
    void [_remove, _login, _key, _company]
    render(<CofreScreen {...bare} />)
    expect(screen.queryByRole('button', { name: /^Editar/u })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remover/u })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Adicionar' })).toBeNull()
  })
})

describe('os acertos da Muse (12/11)', () => {
  it('a linha da chave nunca repete o nome: mostra para que serve, ou a data da gravação', () => {
    const keys = [
      entry({ id: 'k1', kind: 'key', title: 'Mercado Pago', fields: { service: 'Mercado Pago' }, hasSecret: true, updatedAt: '2026-11-10T15:00:00Z' }),
      entry({ id: 'k2', kind: 'key', title: 'Pix da loja', fields: { service: 'Mercado Pago' }, hasSecret: true, updatedAt: '2026-11-10T15:00:00Z' }),
    ]
    render(<CofreScreen {...screenWith({ groups: cofreGroups(keys) })} />)
    expect(screen.getByText('Chave de acesso · guardada em 10/11')).toBeTruthy()
    // 'Mercado Pago' aparece 2 vezes: o título da 1ª chave e o serviço da 2ª (o 'Pix da loja'); a 1ª NÃO repete o nome na 2ª linha.
    expect(screen.getAllByText('Mercado Pago')).toHaveLength(2)
  })

  it('na confirmação de remover o foco cai em Manter', () => {
    render(<CofreScreen {...screenWith()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Mercado Livre' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Manter' }))
  })

  it('um campo obrigatório vazio recebe o erro e o foco, e nada é salvo', () => {
    const onSaveLogin = vi.fn(async () => undefined)
    render(<CofreScreen {...screenWith({ onSaveLogin })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Login' }))
    const panel = screen.getByRole('complementary', { name: 'Novo login' })
    fireEvent.submit((within(panel).getByLabelText('Site') as HTMLInputElement).closest('form') as HTMLFormElement)
    expect(within(panel).getByText('Preencha Site.')).toBeTruthy()
    expect(document.activeElement).toBe(within(panel).getByLabelText('Site'))
    expect(onSaveLogin).not.toHaveBeenCalled()
  })

  it('Novo login mostra só "Fica guardada só neste computador."; Guardar e Cancelar têm 40 px (Button m)', () => {
    render(<CofreScreen {...screenWith()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Login' }))
    const panel = screen.getByRole('complementary', { name: 'Novo login' })
    expect(within(panel).getByText('Fica guardada só neste computador.')).toBeTruthy()
    expect(within(panel).queryByText(/Digite a senha de novo/u)).toBeNull()
    for (const name of ['Guardar', 'Cancelar']) expect(within(panel).getByRole('button', { name }).className).toMatch(/_m_/u)
  })

  it('keepSecretOnEdit: a senha pode ficar em branco na edição e então NÃO é enviada; a dica vira a do vazio', async () => {
    const onSaveLogin = vi.fn(async () => undefined)
    render(<CofreScreen {...screenWith({ onSaveLogin, keepSecretOnEdit: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado Livre' }))
    const panel = screen.getByRole('complementary', { name: 'Editar login' })
    expect(within(panel).getByText('Deixe em branco para manter a senha guardada.')).toBeTruthy()
    fireEvent.submit((within(panel).getByLabelText('Senha') as HTMLInputElement).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(onSaveLogin).toHaveBeenCalledWith({ id: 'l1', site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br', title: 'Mercado Livre' }) })
  })
})

describe('remover confirma na própria linha', () => {
  it('pergunta, e só apaga depois do "Remover"; "Manter" desiste', async () => {
    const onRemove = vi.fn(async () => undefined)
    render(<CofreScreen {...screenWith({ onRemove })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Mercado Livre' }))
    expect(screen.getByText('Remover Mercado Livre? A senha guardada também é apagada.')).toBeTruthy()
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Manter' }))
    expect(screen.queryByText(/A senha guardada também é apagada/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remover Mercado Livre' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Remover Mercado Livre' })).getByRole('button', { name: 'Remover' }))
    await waitFor(() => { expect(onRemove).toHaveBeenCalledWith('l1') })
  })

  it('uma falha ao remover aparece em palavras, sem fechar nada', async () => {
    render(<CofreScreen {...screenWith({ onRemove: vi.fn(async () => { throw new Error('O cofre recusou.') }) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Mercado Livre' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Remover Mercado Livre' })).getByRole('button', { name: 'Remover' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('O cofre recusou.') })
  })
})

describe('o painel lateral', () => {
  it('Novo login: senha em campo de senha, com a dica; salva e fecha; o valor digitado não sobra na tela', async () => {
    const onSaveLogin = vi.fn(async () => undefined)
    const { container } = render(<CofreScreen {...screenWith({ onSaveLogin })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Login' }))
    const panel = screen.getByRole('complementary', { name: 'Novo login' })
    expect(within(panel).getByText('Fica guardada só neste computador.')).toBeTruthy()
    const password = within(panel).getByLabelText('Senha') as HTMLInputElement
    expect(password.type).toBe('password')
    fireEvent.change(within(panel).getByLabelText('Site'), { target: { value: 'loja.exemplo.com.br' } })
    fireEvent.change(within(panel).getByLabelText('Usuário'), { target: { value: 'ana' } })
    fireEvent.change(password, { target: { value: 'segredo-123' } })
    fireEvent.submit(password.closest('form') as HTMLFormElement)
    await waitFor(() => { expect(onSaveLogin).toHaveBeenCalledWith({ site: 'loja.exemplo.com.br', username: 'ana', password: 'segredo-123' }) })
    await waitFor(() => { expect(screen.queryByRole('complementary')).toBeNull() })
    expect(container.textContent).not.toContain('segredo-123')
  })

  it('Editar: os campos que não são secretos vêm preenchidos e a senha vem VAZIA e é pedida de novo', async () => {
    const onSaveLogin = vi.fn(async () => undefined)
    render(<CofreScreen {...screenWith({ onSaveLogin })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado Livre' }))
    const panel = screen.getByRole('complementary', { name: 'Editar login' })
    expect((within(panel).getByLabelText('Site') as HTMLInputElement).value).toBe('mercadolivre.com.br')
    expect((within(panel).getByLabelText('Usuário') as HTMLInputElement).value).toBe('loja@padarialua.com.br')
    const password = within(panel).getByLabelText('Senha') as HTMLInputElement
    expect(password.value).toBe('')
    expect(within(panel).getByText('Digite a senha de novo para guardar a alteração.')).toBeTruthy()
    expect(within(panel).getByText('Fica guardada só neste computador.')).toBeTruthy()
    fireEvent.submit(password.closest('form') as HTMLFormElement)
    expect(within(panel).getByText('Digite a senha para guardar.')).toBeTruthy() // o erro fica NO CAMPO, que recebe o foco; o Guardar não ficou desabilitado
    expect(document.activeElement).toBe(password)
    expect(onSaveLogin).not.toHaveBeenCalled()
    fireEvent.change(password, { target: { value: 'nova-senha' } })
    fireEvent.submit(password.closest('form') as HTMLFormElement)
    await waitFor(() => { expect(onSaveLogin).toHaveBeenCalledWith({ id: 'l1', site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br', password: 'nova-senha', title: 'Mercado Livre' }) })
  })

  it('Nova chave e Ficha da empresa: campos próprios; a ficha não tem segredo', async () => {
    const onSaveKey = vi.fn(async () => undefined)
    const onSaveCompany = vi.fn(async () => undefined)
    render(<CofreScreen {...screenWith({ groups: cofreGroups(ENTRIES.filter(item => item.kind !== 'company')), onSaveKey, onSaveCompany })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chave' }))
    let panel = screen.getByRole('complementary', { name: 'Nova chave' })
    fireEvent.change(within(panel).getByLabelText('Serviço'), { target: { value: 'Stripe' } })
    fireEvent.change(within(panel).getByLabelText('Chave'), { target: { value: 'sk_live_abc' } })
    fireEvent.submit((within(panel).getByLabelText('Chave') as HTMLInputElement).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(onSaveKey).toHaveBeenCalledWith({ service: 'Stripe', secret: 'sk_live_abc' }) })
    await waitFor(() => { expect(screen.queryByRole('complementary')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: 'Preencher a ficha' }))
    panel = screen.getByRole('complementary', { name: 'Ficha da empresa' })
    expect(panel.querySelector('input[type="password"]')).toBeNull()
    fireEvent.change(within(panel).getByLabelText('Razão social'), { target: { value: 'Padaria Lua Ltda' } })
    fireEvent.change(within(panel).getByLabelText('CNPJ ou CPF'), { target: { value: '12.345.678/0001-90' } })
    fireEvent.change(within(panel).getByLabelText('Telefone'), { target: { value: '11 99999-0000' } })
    fireEvent.submit((within(panel).getByLabelText('Razão social') as HTMLInputElement).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(onSaveCompany).toHaveBeenCalledWith({ legalName: 'Padaria Lua Ltda', document: '12.345.678/0001-90', phone: '11 99999-0000' }) })
  })

  it('a falha do host aparece dentro do painel, com a frase dele, e o painel continua aberto', async () => {
    render(<CofreScreen {...screenWith({ onSaveCompany: vi.fn(async () => { throw new Error('O CNPJ tem 14 números e o CPF tem 11. Confira o documento.') }), groups: cofreGroups([]) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ficha da empresa' }))
    const panel = screen.getByRole('complementary', { name: 'Ficha da empresa' })
    fireEvent.change(within(panel).getByLabelText('Razão social'), { target: { value: 'X' } })
    fireEvent.change(within(panel).getByLabelText('CNPJ ou CPF'), { target: { value: '123' } })
    fireEvent.submit((within(panel).getByLabelText('Razão social') as HTMLInputElement).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(within(panel).getByRole('alert').textContent).toContain('O CNPJ tem 14 números') })
    expect(screen.getByRole('complementary', { name: 'Ficha da empresa' })).toBeTruthy()
  })

  it('Fechar painel e Cancelar fecham sem salvar', () => {
    const onSaveLogin = vi.fn(async () => undefined)
    render(<CofreScreen {...screenWith({ onSaveLogin })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado Livre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado Livre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(onSaveLogin).not.toHaveBeenCalled()
  })

  it('quando já existe a ficha, "Ficha da empresa" não é oferecida de novo no menu', () => {
    render(<CofreScreen {...screenWith()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.queryByRole('menuitem', { name: 'Ficha da empresa' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Login' })).toBeTruthy()
  })
})
