// @vitest-environment jsdom
// P1-10 (Carbon, colheita-s1), "Regras": a tela escondia as 5 travas da casa e as janelas de silêncio porque nunca perguntava ao host o que ele OBEDECE.
// O host (Bolt, HONEST-1) já cumpre `getRuleKinds` / `putTriageRule({ kind })` / `deleteTriageRule`; agora a tela oferece exatamente isso: um card "Travas da casa"
// com uma chave por tipo que o host obedece, a linha "Barrou N vezes esta semana" (só quando o host diz) e "Anotado; ainda não muda o que a equipe faz" para a regra
// que é só texto. Sem o contrato do host, nada disso aparece (controle falso é pior que nenhum).
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteRulesPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { pt as rulesPt } from '../src/client/locale/rules/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { TriageRulesView, type HouseLockUi } from '../src/client/rules/TriageRulesView.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const LOCKS: readonly HouseLockUi[] = [
  { kind: 'never-spend', on: true, applied: { thisWeek: 2, lastWhat: 'pagar pelo Gmail' } },
  { kind: 'never-send', on: false },
  { kind: 'never-publish', on: false },
  { kind: 'never-delete', on: false },
  { kind: 'never-hire', on: false },
]

function view(extra: Partial<Parameters<typeof TriageRulesView>[0]> = {}) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <TriageRulesView dict={rulesPt} rules={[]} quietWindows={[]} {...extra} />
    </PreviewFrame>,
  )
}

describe('o card "Travas da casa"', () => {
  it('com o contrato do host: uma chave por tipo que o host obedece, com as palavras de leigo e o estado de cada uma', () => {
    view({ obeyed: { newRules: true }, houseLocks: LOCKS, onToggleLock: vi.fn() })
    expect(screen.getByRole('heading', { name: 'Travas da casa' })).toBeTruthy()
    for (const name of ['Nunca gastar sem mim', 'Nunca enviar sem mim', 'Nunca publicar sem mim', 'Nunca apagar sem mim', 'Nunca contratar sem mim']) {
      expect(screen.getByRole('switch', { name })).toBeTruthy()
    }
    expect(screen.getByRole('switch', { name: 'Nunca gastar sem mim' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Nunca enviar sem mim' }).getAttribute('aria-checked')).toBe('false')
  })

  it('mexer na chave chama o handler com o tipo e o novo estado', async () => {
    const onToggleLock = vi.fn(async () => undefined)
    view({ obeyed: { newRules: true }, houseLocks: LOCKS, onToggleLock })
    fireEvent.click(screen.getByRole('switch', { name: 'Nunca enviar sem mim' }))
    await waitFor(() => { expect(onToggleLock).toHaveBeenCalledWith('never-send', true) })
    fireEvent.click(screen.getByRole('switch', { name: 'Nunca gastar sem mim' }))
    await waitFor(() => { expect(onToggleLock).toHaveBeenCalledWith('never-spend', false) })
  })

  it('a linha "Barrou N vezes esta semana" só aparece quando o host diz (nunca um número inventado)', () => {
    view({ obeyed: { newRules: true }, houseLocks: LOCKS, onToggleLock: vi.fn() })
    expect(screen.getByText('Barrou 2 vezes esta semana · última: pagar pelo Gmail')).toBeTruthy()
    expect(screen.queryByText(/Barrou 0/u)).toBeNull()
    expect(screen.getAllByText(/Barrou/u)).toHaveLength(1)
  })

  it('o host recusou: a chave não fica como se tivesse salvado e a tela diz que não deu', async () => {
    const onToggleLock = vi.fn(async () => { throw new Error('forbidden') })
    view({ obeyed: { newRules: true }, houseLocks: LOCKS, onToggleLock })
    fireEvent.click(screen.getByRole('switch', { name: 'Nunca enviar sem mim' }))
    expect(await screen.findByText('Não consegui salvar a trava. Tente de novo.')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Nunca enviar sem mim' }).getAttribute('aria-checked')).toBe('false')
  })

  it('sem o contrato (HONEST-1) ou sem handler: nenhuma trava na tela', () => {
    view({ houseLocks: LOCKS, onToggleLock: vi.fn() })
    expect(screen.queryByRole('switch', { name: 'Nunca gastar sem mim' })).toBeNull()
    cleanup()
    view({ obeyed: { newRules: true }, houseLocks: LOCKS })
    expect(screen.queryByRole('switch', { name: 'Nunca gastar sem mim' })).toBeNull()
  })

  it('a regra que é só texto diz que foi anotada e ainda não muda nada (nunca promete)', () => {
    view({
      rules: [
        { id: 'r-texto', gateText: 'Só a Ana pede deploy.', assessmentText: 'Pedir confirmação.', logOnly: true, speculativeEnabled: false, enforced: false },
        { id: 'house-never-spend', gateText: 'Nunca gastar sem mim', assessmentText: '', logOnly: false, speculativeEnabled: false, enforced: true },
      ],
    })
    expect(screen.getAllByText('Anotado; ainda não muda o que a equipe faz')).toHaveLength(1)
  })
})

describe('Regras ligada ao host (RemoteRulesPanel)', () => {
  const RULE_SPEND = { id: 'rule-77', gateText: 'Nunca gastar sem mim', assessmentText: '', logOnly: false, speculativeEnabled: false, kind: 'never-spend', enforced: true, applied: { total: 3, thisWeek: 2, lastWhat: 'pagar pelo Gmail' } }
  const KINDS = {
    kinds: [
      { kind: 'never-spend', enforcedBy: 'gate' }, { kind: 'never-send', enforcedBy: 'gate' }, { kind: 'never-publish', enforcedBy: 'gate' },
      { kind: 'never-delete', enforcedBy: 'gate' }, { kind: 'never-hire', enforcedBy: 'harness' },
    ],
    quietWindow: { enforced: true, holds: ['initiative'], directRequestsAnswered: true },
  }

  function mount(extra: Record<string, unknown> = {}, rules: readonly unknown[] = [RULE_SPEND]) {
    const tenant = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
    const useTenant = bindObservableForTest({ getSnapshot: () => tenant.getSnapshot(), subscribe: listener => tenant.subscribe(listener) })
    const { store } = createShellStore()
    const ok = <T,>(value: T) => async () => ({ ok: true as const, value })
    const persona = {
      listTriageRules: vi.fn(ok(rules)),
      listQuietWindows: vi.fn(ok([{ id: 'q1', label: 'Noite', start: '22:00', end: '07:00', enforced: true, applied: { total: 4, thisWeek: 1 } }])),
      getProjectLimits: vi.fn(ok({ workspaceId: 'ws', projectId: 'proj', maxProposalsPerDay: 3, tokensPerPersonaMonth: 500_000, tokensPerProjectMonth: 1_000_000 })),
      listTriageLog: vi.fn(ok([])),
      getRuleKinds: vi.fn(ok(KINDS)),
      putTriageRule: vi.fn(ok({})),
      deleteTriageRule: vi.fn(ok(true)),
      ...extra,
    }
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteRulesPanel persona={persona as unknown as PersonaRemoteClient} useTenant={useTenant} useShell={bindObservableForTest(store)} />
      </PreviewFrame>,
    )
    return persona
  }

  it('mostra as 5 travas com a que já existe ligada e a linha do que ela barrou, e mostra a janela de silêncio que o host obedece', async () => {
    mount()
    expect((await screen.findByRole('switch', { name: 'Nunca gastar sem mim' })).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Nunca enviar sem mim' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Barrou 2 vezes esta semana · última: pagar pelo Gmail')).toBeTruthy()
    expect(screen.getByText('Noite: 22:00–07:00')).toBeTruthy()
  })

  it('ligar uma trava grava a regra com o tipo (o host só obedece com `kind`), e a lista recarrega', async () => {
    const persona = mount()
    fireEvent.click(await screen.findByRole('switch', { name: 'Nunca enviar sem mim' }))
    await waitFor(() => {
      expect(persona.putTriageRule).toHaveBeenCalledWith({
        workspaceId: 'ws', projectId: 'proj', id: 'house-never-send', gateText: 'Nunca enviar sem mim', assessmentText: '', logOnly: false, speculativeEnabled: false, kind: 'never-send',
      })
    })
    await waitFor(() => { expect(persona.listTriageRules.mock.calls.length).toBeGreaterThanOrEqual(2) })
  })

  it('desligar uma trava apaga a regra que a guarda', async () => {
    const persona = mount()
    fireEvent.click(await screen.findByRole('switch', { name: 'Nunca gastar sem mim' }))
    await waitFor(() => { expect(persona.deleteTriageRule).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', id: 'rule-77' }) })
  })

  it('um host que não conhece o contrato (sem getRuleKinds): a tela segue como antes, sem travas e sem janela', async () => {
    mount({ getRuleKinds: undefined })
    await screen.findByText('Nunca gastar sem mim') // a regra salva continua na lista
    expect(screen.queryByRole('switch', { name: 'Nunca enviar sem mim' })).toBeNull()
    expect(screen.queryByText('Noite: 22:00–07:00')).toBeNull()
  })
})
