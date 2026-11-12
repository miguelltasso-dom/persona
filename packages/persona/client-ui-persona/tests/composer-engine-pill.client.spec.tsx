// @vitest-environment jsdom
// DESIGN-01 (Muse, 11/11) #03: a pílula "Modelo · Esforço" do composer mostra a configuração DA PERSONA que responde e abre o diálogo do EFF-1 dela, com a linha
// "Vale para as próximas tarefas de {nome}". NÃO é uma escolha por mensagem (esse contrato não existe). Só aparece quando "Quem responde" é uma persona definida:
// na DM sempre; no #geral não quando a Coordenação distribui (o padrão) nem com "Toda a equipe".
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { buildResponderEngine } from '../src/client/chat/responder-engine.ts'
import { ENGINE_EFFORT_FLAG_KEY } from '../src/client/profile/engine-effort-flag.ts'
import { PersonaEngineOverlay } from '../src/client/profile/PersonaEngineOverlay.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const ATLAS: ChannelPersonaMember = { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] }
const NINA: ChannelPersonaMember = { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting' }
const TEAM = {
  members: [],
  personas: [
    { id: 'p-atlas', name: 'Atlas', title: 'Coordenação', avatarRef: 'atlas', engine: { runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'opus', runnerEffort: 'max' } },
    { id: 'p-nina', name: 'Nina', title: 'Pesquisa', avatarRef: 'nina', engine: { runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'sonnet', runnerEffort: null } },
    { id: 'p-sol', name: 'Sol', title: 'Relacionamento', avatarRef: 'sol' },
  ],
} as unknown as TeamView

beforeEach(() => { localStorage.clear(); localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1'); localStorage.setItem(ENGINE_EFFORT_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const engine = (open = vi.fn()) => ({
  label: (memberId: string): string | undefined => ({ atlas: 'Opus · max', nina: 'Sonnet' } as Record<string, string>)[memberId],
  onOpen: open,
})
const pill = (): HTMLElement | null => document.querySelector('[data-persona-composer-engine]')

describe('a pílula Modelo · Esforço no composer (#03)', () => {
  it('na DM (o seletor oculto, uma persona definida) ela aparece sempre, com a configuração DA persona, e abre o diálogo dela', () => {
    const open = vi.fn()
    const onSend = vi.fn()
    render(<ChannelComposer t={t} members={[NINA]} responderHidden responderEngine={engine(open)} onSend={onSend} />)
    expect(pill()?.textContent).toContain('Sonnet')
    expect(pill()?.getAttribute('aria-label')).toContain('Nina')
    expect(pill()?.getAttribute('aria-label')).toContain('Sonnet')
    expect(pill()?.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(pill() as HTMLElement)
    expect(open).toHaveBeenCalledWith('nina')
    expect(onSend).not.toHaveBeenCalled() // não é uma escolha por mensagem: nada é enviado nem guardado
  })

  it('no #geral com a Coordenação distribuindo (o padrão) NÃO há pílula; escolher uma persona a mostra, e voltar à Coordenação a esconde', () => {
    render(<ChannelComposer t={t} members={[ATLAS, NINA]} responderEngine={engine()} />)
    expect(pill()).toBeNull()
    fireEvent.change(screen.getByLabelText('Persona que responde'), { target: { value: 'nina' } })
    expect(pill()?.textContent).toContain('Sonnet')
    fireEvent.change(screen.getByLabelText('Persona que responde'), { target: { value: 'atlas' } })
    expect(pill()).toBeNull()
  })

  it('sem o que mostrar (a persona sem configuração conhecida) ou sem como abrir, não há pílula morta', () => {
    const { unmount } = render(<ChannelComposer t={t} members={[NINA]} responderHidden responderEngine={{ label: () => undefined, onOpen: vi.fn() }} />)
    expect(pill()).toBeNull()
    unmount()
    render(<ChannelComposer t={t} members={[NINA]} responderHidden />)
    expect(pill()).toBeNull()
  })
})

describe('buildResponderEngine: a configuração é a da persona, do jeito que o cartão dela mostra', () => {
  const open = vi.fn()
  const build = () => buildResponderEngine({ team: TEAM, openEngine: open, defaultLabel: 'Padrão do motor' })

  it('"{modelo} · {esforço}", só o modelo quando o esforço é o padrão, e "Padrão do motor" quando nada foi escolhido', () => {
    expect(build()?.label('atlas')).toBe('Opus · max')
    expect(build()?.label('nina')).toBe('Sonnet')
    expect(build()?.label('sol')).toBe('Padrão do motor')
  })

  it('abrir leva o id da persona NO HOST (o rosto "nina" do composer vira "p-nina")', () => {
    build()?.onOpen('nina')
    expect(open).toHaveBeenCalledWith('p-nina')
  })

  it('sem equipe, sem como abrir ou com o EFF-1 desligado: nada (sem pílula morta)', () => {
    expect(buildResponderEngine({ team: null, openEngine: open, defaultLabel: 'x' })).toBeUndefined()
    expect(buildResponderEngine({ team: TEAM, openEngine: undefined, defaultLabel: 'x' })).toBeUndefined()
    localStorage.setItem(ENGINE_EFFORT_FLAG_KEY, '0')
    expect(build()).toBeUndefined()
  })
})

describe('o diálogo do EFF-1 diz que vale para as próximas tarefas da persona', () => {
  const CLAUDE: ConnectionView = { kind: 'claude', status: 'connected' } as unknown as ConnectionView

  function mountOverlay(personas: unknown) {
    const listConnections = vi.fn(async () => ({ ok: true as const, value: [CLAUDE] }))
    const listPersonas = vi.fn(async () => ({ ok: true as const, value: personas }))
    render(
      <PersonaEngineOverlay
        dict={profilePt}
        persona={{ listConnections, listPersonas, setPersonaEngine: vi.fn() } as never}
        cardBridge={{ invalidate: vi.fn(), revision: { getSnapshot: () => ({ n: 0 }), subscribe: () => () => {} }, cardInfo: () => undefined, prefetch: () => {}, togglePause: async () => {} }}
        useShell={selector => selector({ enginePersonaId: 'p-nina' } as never)}
        scope={() => ({ workspaceId: 'ws-1', projectId: 'proj-1' })}
        closeEngineEditor={vi.fn()}
      />,
    )
  }

  it('"Vale para as próximas tarefas de Nina", com o nome da persona do diálogo', async () => {
    mountOverlay([{ id: 'p-nina', name: 'Nina' }])
    await waitFor(() => { expect(document.querySelector('[data-engine-applies-next]')?.textContent).toBe('Vale para as próximas tarefas de Nina') })
  })

  it('sem o nome da persona, a frase vale para "desta persona" (nunca "{name}" cru nem um id)', async () => {
    mountOverlay([{ id: 'p-nina' }])
    await waitFor(() => { expect(document.querySelector('[data-engine-applies-next]')).not.toBeNull() })
    const text = document.querySelector('[data-engine-applies-next]')?.textContent ?? ''
    expect(text).toBe('Vale para as próximas tarefas desta persona')
    expect(text).not.toMatch(/\{|p-nina/u)
  })
})
