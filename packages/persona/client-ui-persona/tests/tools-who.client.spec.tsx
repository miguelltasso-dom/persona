// @vitest-environment jsdom
// Item 26 · "Quem pode usar?" (Muse §26): os rostos de 40 px, marcáveis, TODOS desmarcados até o host dizer (D-084); o que a ferramenta permite em Ler · Mudar · Enviar ·
// Pagar · Apagar, com o cadeado nas que sempre pedem; "Pronto". Nenhum botão morto: sem a chamada do host (ou sem um conector para entregar) a lista é só de leitura.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { pt as toolsPt } from '../src/client/locale/tools/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { ConnectedWho } from '../src/client/tools/ConnectedWho.tsx'
import { readCatalog, type ToolCard } from '../src/client/tools/tools-model.ts'
import { WhoPanel, type WhoPanelProps } from '../src/client/tools/WhoPanel.tsx'
import { grantsOfTool, permitsOf, readGrants, refOfTool, whoRows, type WhoFace } from '../src/client/tools/who-model.ts'

installPreviewTheme()
afterEach(cleanup)

const CARD = readCatalog({
  categories: [{ id: 'payments', name: 'Pagamentos' }],
  cards: [{ id: 'mp', name: 'Mercado Pago', category: 'payments', sentence: 'Ver os pagamentos.', via: 'official', promised: true, linked: true }],
})!.cards[0] as ToolCard

const FACES: readonly WhoFace[] = [{ id: 'p-nina', name: 'Nina' }, { id: 'p-bento', name: 'Bento' }, { id: 'p-sol', name: 'Sol' }]

const grant = (personaId: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  personaId, cli: 'claude', connectorId: 'mcp-mp', name: 'claude.ai Mercado Pago', access: 'read', confirm: { send: 'ask', pay: 'ask', delete: 'ask' }, loadedAlways: false, grantedBy: 'owner', grantedAt: '2026-11-12T08:00:00Z', ...over,
})

const GRANTS = readGrants([grant('p-nina'), { ...grant('p-nina'), name: 'Gmail', connectorId: 'mcp-gm' }])

function mount(extra: Partial<WhoPanelProps> = {}): void {
  render(
    <PreviewFrame brandLabel="Persona">
      <WhoPanel card={CARD} faces={FACES} grants={GRANTS} onClose={() => undefined} onToggle={() => Promise.resolve()} {...extra} />
    </PreviewFrame>,
  )
}

describe('o que o painel lê do host (puro)', () => {
  it('lê as concessões e descarta o que não entende (um host mais novo ou mais antigo não quebra a tela)', () => {
    const read = readGrants([grant('p1'), { personaId: 'p2' }, 'lixo', grant('p3', { access: 'write', confirm: { send: 'never', pay: 'x' } })])
    expect(read.map(item => item.personaId)).toEqual(['p1', 'p3'])
    expect(read[1]).toMatchObject({ access: 'write', confirm: { send: 'never', pay: 'ask', delete: 'ask' } }) // o que não é "never" é "ask": nada some em silêncio
    expect(readGrants(undefined)).toEqual([])
  })
  it('as concessões de UMA ferramenta casam pelo nome como no host (um contém o outro)', () => {
    expect(grantsOfTool(CARD, GRANTS).map(item => item.connectorId)).toEqual(['mcp-mp']) // o Gmail da Nina não é do Mercado Pago
  })
  it('NINGUÉM marcado sem concessão (D-084): só quem o host diz', () => {
    expect(whoRows(CARD, FACES, []).every(row => !row.on)).toBe(true)
    expect(whoRows(CARD, FACES, GRANTS).map(row => [row.face.id, row.on])).toEqual([['p-nina', true], ['p-bento', false], ['p-sol', false]])
  })
  it('o conector para marcar mais um rosto é o de uma concessão que já existe; sem nenhuma, não há como (nunca inventa)', () => {
    expect(refOfTool(CARD, GRANTS)).toEqual({ cli: 'claude', id: 'mcp-mp', name: 'claude.ai Mercado Pago' })
    expect(refOfTool(CARD, [])).toBeUndefined()
  })
  it('o que permite: as classes do host; "pede sempre" até alguém dispensar de propósito; "Mudar" só com concessão de escrita', () => {
    expect(permitsOf([]).map(item => item.on)).toEqual([false, false, false, false, false])
    const base = permitsOf(grantsOfTool(CARD, GRANTS))
    expect(base.map(item => [item.id, item.on, item.asks])).toEqual([['read', true, false], ['change', false, false], ['send', true, true], ['pay', true, true], ['delete', true, true]])
    const waived = permitsOf(readGrants([grant('p-nina', { access: 'write', confirm: { send: 'never', pay: 'ask', delete: 'ask' } })]))
    expect(waived.find(item => item.id === 'change')?.on).toBe(true)
    expect(waived.find(item => item.id === 'send')?.asks).toBe(false)
    expect(waived.find(item => item.id === 'pay')?.asks).toBe(true)
  })
})

describe('o painel', () => {
  it('"Quem pode usar?" com o nome da ferramenta; os rostos são caixas de marcar e só a Nina (que tem concessão) vem marcada', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Quem pode usar?' })).toBeTruthy()
    expect(screen.getByText('Marque quem da equipe pode usar Mercado Pago. Mesmo assim, enviar, pagar e apagar sempre pedem a você.')).toBeTruthy() // vale com ou sem alguém marcado (Muse)
    const boxes = screen.getAllByRole('checkbox')
    // o nome vem do próprio rosto (sem foto, o avatar desenha a inicial: o texto do botão inteiro seria "NNina")
    expect(boxes.map(box => [box.querySelector('[class*="faceName"]')?.textContent, box.getAttribute('aria-checked')])).toEqual([['Nina', 'true'], ['Bento', 'false'], ['Sol', 'false']])
  })

  it('sem nenhuma concessão: todos desmarcados e a frase diz que a equipe pergunta antes (e sem conector, os rostos não são botão)', () => {
    mount({ grants: [] })
    expect(screen.getByText('Ninguém usa ainda. A equipe sempre pergunta antes.')).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0) // nada a entregar ao host: nada de botão morto
    expect(screen.getByText(/ligue Mercado Pago de novo pelo botão Conectar/u)).toBeTruthy()
  })

  it('com o host resolvendo por NOME (canGrantWithoutRef), até a 1ª pessoa de uma ferramenta que ninguém tem ainda pode ser marcada: os rostos viram botão e some o "ligue de novo"', () => {
    mount({ grants: [], canGrantWithoutRef: true })
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.queryByText(/ligue Mercado Pago de novo/u)).toBeNull()
    expect(screen.getByText('Ninguém usa ainda. A equipe sempre pergunta antes.')).toBeTruthy() // continua desmarcado: nada vem marcado sem concessão
  })

  it('marcar e desmarcar chamam o host com a linha certa; um de cada vez', async () => {
    const onToggle = vi.fn(() => Promise.resolve())
    mount({ onToggle })
    fireEvent.click(screen.getByRole('checkbox', { name: /Bento/u }))
    await waitFor(() => { expect(onToggle).toHaveBeenCalledTimes(1) })
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ face: expect.objectContaining({ id: 'p-bento' }), on: false }), true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Nina/u }))
    await waitFor(() => { expect(onToggle).toHaveBeenCalledTimes(2) })
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ face: expect.objectContaining({ id: 'p-nina' }), on: true }), false)
  })

  it('se o host recusa, diz que não deu (sem fingir que mudou)', async () => {
    mount({ onToggle: () => Promise.reject(new Error('owner-only')) })
    fireEvent.click(screen.getByRole('checkbox', { name: /Bento/u }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu para mudar agora. Tente de novo.')
  })

  it('sem a chamada do host a lista é só de leitura: ninguém vira botão', () => {
    mount({ onToggle: undefined })
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('Aqui você só vê quem pode usar.')).toBeTruthy()
    expect(screen.getByText('Nina')).toBeTruthy()
  })

  it('o que permite: Ler · Mudar · Enviar · Pagar · Apagar, com o cadeado "Sempre pede" em Enviar, Pagar e Apagar', () => {
    mount()
    const items = [...document.querySelectorAll('[data-permit]')]
    expect(items.map(item => item.getAttribute('data-permit'))).toEqual(['read', 'change', 'send', 'pay', 'delete'])
    expect(within(items[2] as HTMLElement).getByText('Sempre pede')).toBeTruthy()
    expect(within(items[0] as HTMLElement).queryByText('Sempre pede')).toBeNull()
    expect(within(items[0] as HTMLElement).getByText('Sem perguntar')).toBeTruthy() // cada linha diz a regra (Muse): Ler não pergunta
    expect(within(items[1] as HTMLElement).getByText('Não liberado')).toBeTruthy() // só leitura
  })

  it('o motor que já carrega tudo (Codex): a tela diz que a decisão continua sendo sua', () => {
    mount({ grants: readGrants([grant('p-nina', { loadedAlways: true })]) })
    expect(screen.getByText(/já fica carregada para todos/u)).toBeTruthy()
  })

  it('"Pronto", o ✕ e o Esc fecham', () => {
    const onClose = vi.fn()
    mount({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }))
    fireEvent.keyDown(screen.getByRole('heading', { name: 'Quem pode usar?' }).closest('aside') as HTMLElement, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('carregando e erro usam as frases de sempre; "Tentar de novo" sem seta', () => {
    mount({ state: 'loading' })
    expect(screen.getByText('Carregando quem pode usar…')).toBeTruthy()
    cleanup()
    const onRetry = vi.fn()
    mount({ state: 'error', onRetry })
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry.querySelector('svg')).toBeNull()
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('sem equipe, diz por quê', () => {
    mount({ faces: [], grants: [] })
    expect(screen.getByText('Ainda não há pessoas na equipe.')).toBeTruthy()
  })
})

describe('ligado ao host (ConnectedWho)', () => {
  const ok = <T,>(value: T): { ok: true; value: T } => ({ ok: true, value })
  function fakeHost(grants: Record<string, unknown>[]) {
    const state = { grants: [...grants] }
    const host = {
      listPersonas: vi.fn(() => Promise.resolve(ok([{ id: 'p-nina', name: 'Nina' }, { id: 'p-bento', name: 'Bento' }]))),
      listConnectorGrants: vi.fn(() => Promise.resolve(ok(state.grants))),
      grantConnector: vi.fn((request: { personaId: string }) => { state.grants.push(grant(request.personaId)); return Promise.resolve(ok(grant(request.personaId))) }),
      revokeConnector: vi.fn((request: { personaId: string }) => { state.grants = state.grants.filter(item => item.personaId !== request.personaId); return Promise.resolve(ok(true)) }),
    }
    return host
  }
  const scope = { workspaceId: 'ws', projectId: 'proj' }
  const show = (host: object, card: ToolCard = CARD): void => {
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedWho persona={host as unknown as PersonaRemoteClient} scope={scope} card={card} onClose={() => undefined} />
      </PreviewFrame>,
    )
  }

  it('carrega o time e as concessões; marcar chama grantConnector (leitura) com o conector de uma concessão existente, e relê', async () => {
    const host = fakeHost([grant('p-nina')])
    show(host)
    await screen.findByRole('checkbox', { name: /Bento/u })
    expect(screen.getByRole('checkbox', { name: /Nina/u }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: /Bento/u }).getAttribute('aria-checked')).toBe('false')
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Bento/u })) })
    await waitFor(() => { expect(host.grantConnector).toHaveBeenCalledTimes(1) })
    expect(host.grantConnector).toHaveBeenCalledWith({ ...scope, personaId: 'p-bento', connector: { cli: 'claude', id: 'mcp-mp', name: 'claude.ai Mercado Pago' }, access: 'read' })
    await waitFor(() => { expect(screen.getByRole('checkbox', { name: /Bento/u }).getAttribute('aria-checked')).toBe('true') }) // o host é a verdade: relido
  })

  it('desmarcar chama revokeConnector com o cli e o id da concessão', async () => {
    const host = fakeHost([grant('p-nina')])
    show(host)
    const nina = await screen.findByRole('checkbox', { name: /Nina/u }) // fora do act: dentro dele o React segura a atualização e a espera nunca termina
    await act(async () => { fireEvent.click(nina) })
    await waitFor(() => { expect(host.revokeConnector).toHaveBeenCalledWith({ ...scope, personaId: 'p-nina', cli: 'claude', connectorId: 'mcp-mp' }) })
    // desmarcou a ÚLTIMA concessão: o painel guardou o conector da sessão, então dá para marcar de novo (não encalha em "ligue de novo")
    await waitFor(() => { expect(screen.getByRole('checkbox', { name: /Nina/u }).getAttribute('aria-checked')).toBe('false') })
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Nina/u })) })
    await waitFor(() => { expect(host.grantConnector).toHaveBeenCalledWith({ ...scope, personaId: 'p-nina', connector: { cli: 'claude', id: 'mcp-mp', name: 'claude.ai Mercado Pago' }, access: 'read' }) })
  })

  it('sem NENHUMA concessão, o host resolve por nome: marcar chama grantConnectorByName com o nome do cartão (nunca um id) e nunca grantConnector', async () => {
    const host = { ...fakeHost([]), grantConnectorByName: vi.fn(() => Promise.resolve(ok(grant('p-bento')))) }
    show(host)
    const bento = await screen.findByRole('checkbox', { name: /Bento/u })
    expect(bento.getAttribute('aria-checked')).toBe('false')
    await act(async () => { fireEvent.click(bento) })
    await waitFor(() => { expect(host.grantConnectorByName).toHaveBeenCalledWith({ ...scope, personaId: 'p-bento', name: 'Mercado Pago', access: 'read' }) })
    expect(host.grantConnector).not.toHaveBeenCalled()
  })

  it('o host recusa pelo nome (a conta não tem a ferramenta): a tela diz que não deu, sem fingir que marcou', async () => {
    const host = { ...fakeHost([]), grantConnectorByName: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'not-found', message: 'A conta ainda não tem Mercado Pago: ligue pelo botão Conectar.' } })) }
    show(host)
    const bento = await screen.findByRole('checkbox', { name: /Bento/u }) // fora do act: dentro dele o React segura a atualização
    await act(async () => { fireEvent.click(bento) })
    expect((await screen.findByRole('alert')).textContent).toBe('Não deu para mudar agora. Tente de novo.')
    expect(screen.getByRole('checkbox', { name: /Bento/u }).getAttribute('aria-checked')).toBe('false')
  })

  it('um host sem as concessões mostra o erro honesto, nunca uma lista inventada', async () => {
    show({ listPersonas: () => Promise.resolve(ok([])) })
    expect(await screen.findByText('Não deu para carregar quem pode usar agora.')).toBeTruthy()
  })

  it('um host que só lê (sem grant/revoke): lista de leitura, nenhum botão', async () => {
    const host = fakeHost([grant('p-nina')])
    show({ listPersonas: host.listPersonas, listConnectorGrants: host.listConnectorGrants })
    await screen.findByText('Bento')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('o CSS (a régua da Muse)', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'client', 'tools', 'WhoPanel.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replaceAll('\r\n', '\n')
  it('o painel tem 440 px; o rosto 56 px de linha (avatar de 40); o texto miúdo 13 px; só token de movimento', () => {
    expect(/\n\.panel \{([^}]*)\}/u.exec(`\n${css}`)?.[1] ?? '').toMatch(/flex:\s*0 0 440px/u)
    expect(/\n\.face \{([^}]*)\}/u.exec(`\n${css}`)?.[1] ?? '').toMatch(/min-height:\s*56px/u)
    expect(/\n\.note \{([^}]*)\}/u.exec(`\n${css}`)?.[1] ?? '').toMatch(/font-size:\s*13px/u)
    expect(css).not.toMatch(/\b\d+ms\b/u)
  })
  it('o locale tem os textos da Muse', () => {
    expect(toolsPt['who.title']).toBe('Quem pode usar?')
    expect(toolsPt['who.done']).toBe('Pronto')
    expect(toolsPt['who.alwaysAsks']).toBe('Sempre pede')
  })
})
