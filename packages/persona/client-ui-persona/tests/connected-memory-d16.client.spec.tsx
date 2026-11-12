// @vitest-environment jsdom
// DESIGN-01 onda 3 · #16: the Resumo of the Memória da empresa reads REAL data. "Comece aqui" shows the first lines of what the person wrote about
// the business; without it the invitation saves a real profile; and the automatic updates are signed by a persona of the team (the librarian,
// else Pesquisa, else Coordenação), never by "O bibliotecário".
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { RemoteSecondBrainPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { companyProfileLines, companyProfileText, newCompanyBriefId } from '../src/client/data/company-profile.ts'
import { indexKeeperName } from '../src/client/second-brain/brain-ui-adapters.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function tenantHarness(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({
    status: 'ready',
    scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' },
  })
  return bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
}
function shellHarness(): ReturnType<typeof bindObservableForTest<ReturnType<ReturnType<typeof createShellStore>['store']['getSnapshot']>>> {
  const { store } = createShellStore()
  return bindObservableForTest(store)
}
function brainPage(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return { kind: 'company', body: 'Corpo', slug: partial.id, revision: 1, links: [], sources: [], editorHint: 'persona:atlas', updatedAt: '2026-11-04T12:00:00.000Z', restricted: false, ...partial }
}
function personaRow(id: string, name: string, title: string, systemRoles: readonly string[] = []) {
  return { id, workspaceId: 'ws', projectId: 'proj', name, title, description: '', avatarKind: 'gallery', avatarRef: '', systemRoles, canRecruit: false }
}
const HOME: BrainHomeView = {
  startHereId: 'start',
  changedToday: [brainPage({ id: 'p1', title: 'Missão remota', editorHint: 'person:system' })],
  activeGrants: [],
  contradictions: [],
  leftover: [],
}
function record(partial: { id: string; kind?: string; body: string; status?: string }) {
  return { projectId: 'proj', kind: 'brief', status: 'active', ...partial }
}

interface Options {
  readonly records?: readonly unknown[]
  readonly personas?: readonly unknown[]
  readonly withCreate?: boolean
  readonly createFails?: boolean
}
function client(options: Options = {}) {
  const createVaultRecord = vi.fn(async () => (options.createFails === true
    ? { ok: false as const, error: { code: 'boom', message: 'x' } }
    : { ok: true as const, value: record({ id: 'x', body: 'y' }) }))
  const persona = {
    getBrainHome: vi.fn(async () => ({ ok: true as const, value: HOME })),
    listPersonas: vi.fn(async () => ({ ok: true as const, value: options.personas ?? [personaRow('atlas', 'Atlas', 'Coordenação', ['coordination'])] })),
    listBrainPages: vi.fn(async () => ({ ok: true as const, value: [brainPage({ id: 'start', title: 'Comece aqui', body: '# Comece aqui\n\nÍndice automático.' })] })),
    listBrainPermissions: vi.fn(async () => ({ ok: true as const, value: [] })),
    listVaultRecords: vi.fn(async () => ({ ok: true as const, value: options.records ?? [] })),
    ...(options.withCreate === false ? {} : { createVaultRecord }),
  } as unknown as PersonaRemoteClient
  return { persona, createVaultRecord }
}
function mount(persona: PersonaRemoteClient) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <RemoteSecondBrainPanel persona={persona} useTenant={tenantHarness()} useShell={shellHarness()} />
    </PreviewFrame>,
  )
}

describe('o perfil da empresa (regra única)', () => {
  it('só um brief ativo e com texto é perfil; o vazio que o botão antigo deixava não conta', () => {
    expect(companyProfileText([record({ id: 'a', body: '   ' }), record({ id: 'b', body: ' Padaria da Ana ' })] as never)).toBe('Padaria da Ana')
    expect(companyProfileText([record({ id: 'a', body: 'Texto', status: 'archived' })] as never)).toBeNull()
    expect(companyProfileText([record({ id: 'a', kind: 'memory', body: 'Texto' })] as never)).toBeNull()
    expect(companyProfileText([])).toBeNull()
  })

  it('as 3 primeiras linhas reais, sem marcas de título ou de lista', () => {
    expect(companyProfileLines('# Padaria da Ana\n\n- Pães artesanais\n* Abre de terça a domingo\nQuarta linha')).toEqual(['Padaria da Ana', 'Pães artesanais', 'Abre de terça a domingo'])
    expect(companyProfileLines(null)).toEqual([])
  })

  it('cada descrição tem um id novo (o Cofre guarda toda versão de um id: reescrever o mesmo seria recusado)', () => {
    expect(newCompanyBriefId(1)).not.toBe(newCompanyBriefId(2))
    expect(newCompanyBriefId(1)).toMatch(/^company-brief-/u)
  })
})

describe('quem mantém o índice', () => {
  const librarian = personaRow('p1', 'Bia', 'Biblioteca', ['librarian'])
  const research = personaRow('p2', 'Nina', 'Pesquisa')
  const coordination = personaRow('p3', 'Atlas', 'Coordenação', ['coordination'])
  it('bibliotecária de papel > Pesquisa > Coordenação > ninguém', () => {
    expect(indexKeeperName([coordination, research, librarian] as never)).toBe('Bia')
    expect(indexKeeperName([coordination, research] as never)).toBe('Nina')
    expect(indexKeeperName([coordination] as never)).toBe('Atlas')
    expect(indexKeeperName([personaRow('p4', 'Sol', 'Relacionamento')] as never)).toBeUndefined()
    expect(indexKeeperName([])).toBeUndefined()
  })
})

describe('RemoteSecondBrainPanel · Resumo com dados reais', () => {
  it('com perfil: "Comece aqui" mostra as 3 primeiras linhas e nenhum convite', async () => {
    const { persona } = client({ records: [record({ id: 'company-brief', body: 'Padaria da Ana\nPães artesanais\nAbre de terça a domingo\nQuarta linha' })] })
    mount(persona)
    await waitFor(() => { expect(document.querySelectorAll('[data-company-line]').length).toBe(3) })
    expect([...document.querySelectorAll('[data-company-line]')].map(node => node.textContent)).toEqual(['Padaria da Ana', 'Pães artesanais', 'Abre de terça a domingo'])
    expect(screen.queryByRole('button', { name: 'Descrever a empresa em 3 frases' })).toBeNull()
  })

  it('sem perfil: o convite abre a janela e Salvar grava um brief novo no Cofre', async () => {
    const { persona, createVaultRecord } = client({ records: [record({ id: 'company-brief', body: '' })] })
    mount(persona)
    const cta = await screen.findByRole('button', { name: 'Descrever a empresa em 3 frases' })
    fireEvent.click(cta)
    const field = await screen.findByLabelText('A empresa em 3 frases')
    const save = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(field, { target: { value: '  Padaria da Ana. Pães artesanais.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => { expect(createVaultRecord).toHaveBeenCalledTimes(1) })
    const sent = (createVaultRecord.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(sent).toMatchObject({ workspaceId: 'ws', projectId: 'proj', kind: 'brief', body: 'Padaria da Ana. Pães artesanais.', authorId: 'owner' })
    expect(String(sent.id)).toMatch(/^company-brief-/u)
    // an id that is not the empty one the old button left behind
    expect(sent.id).not.toBe('company-brief')
    await waitFor(() => { expect(screen.queryByLabelText('A empresa em 3 frases')).toBeNull() })
  })

  it('se o Cofre recusa: a frase fica na janela, o texto não se perde e nada diz que foi salvo', async () => {
    const { persona } = client({ createFails: true })
    mount(persona)
    fireEvent.click(await screen.findByRole('button', { name: 'Descrever a empresa em 3 frases' }))
    fireEvent.change(await screen.findByLabelText('A empresa em 3 frases'), { target: { value: 'Minha empresa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não consegui salvar agora/u)
    expect(screen.getByLabelText<HTMLTextAreaElement>('A empresa em 3 frases').value).toBe('Minha empresa')
  })

  it('host sem createVaultRecord: nenhum convite (controle falso é pior que nenhum)', async () => {
    const { persona } = client({ withCreate: false })
    mount(persona)
    await waitFor(() => { expect(screen.getByRole('heading', { level: 1, name: 'Resumo' })).toBeTruthy() })
    expect(screen.queryByRole('button', { name: 'Descrever a empresa em 3 frases' })).toBeNull()
  })

  it('as atualizações automáticas são assinadas por uma persona real (Pesquisa antes de Coordenação), nunca por "O bibliotecário"', async () => {
    const { persona } = client({ personas: [personaRow('atlas', 'Atlas', 'Coordenação', ['coordination']), personaRow('nina', 'Nina', 'Pesquisa')] })
    mount(persona)
    await waitFor(() => { expect(screen.getByText('Missão remota')).toBeTruthy() })
    expect(document.body.textContent).toMatch(/Nina/u)
    expect(document.body.textContent).not.toMatch(/bibliotec/iu)
  })

  it('sem persona nenhuma que sirva: "Atualização automática da equipe"', async () => {
    const { persona } = client({ personas: [personaRow('sol', 'Sol', 'Relacionamento')] })
    mount(persona)
    await waitFor(() => { expect(screen.getByText('Missão remota')).toBeTruthy() })
    expect(document.body.textContent).toMatch(/Atualização automática da equipe/u)
  })
})

describe('RemoteSecondBrainPanel · empresa recém-criada (o caso mais comum)', () => {
  const EMPTY_HOME: BrainHomeView = { startHereId: 'start', changedToday: [], activeGrants: [], contradictions: [], leftover: [] }
  function freshClient(records: readonly unknown[]) {
    const { persona } = client({ records })
    ;(persona as unknown as { getBrainHome: unknown }).getBrainHome = vi.fn(async () => ({ ok: true as const, value: EMPTY_HOME }))
    return persona
  }

  it('sem nada ainda: o estado vazio também convida a descrever a empresa (e o convite abre a janela)', async () => {
    mount(freshClient([]))
    const cta = await screen.findByRole('button', { name: 'Descrever a empresa em 3 frases' })
    fireEvent.click(cta)
    expect(await screen.findByLabelText('A empresa em 3 frases')).toBeTruthy()
  })

  it('com o perfil escrito, a tela mostra o perfil (não só a ilustração de vazio) e não repete o convite', async () => {
    mount(freshClient([record({ id: 'company-brief', body: 'Padaria da Ana\nPães artesanais' })]))
    await waitFor(() => { expect(document.querySelectorAll('[data-company-line]').length).toBe(2) })
    expect(screen.queryByRole('button', { name: 'Descrever a empresa em 3 frases' })).toBeNull()
  })
})
