// @vitest-environment jsdom
// A-6 (Muse): o pedido do passo 5 é um campo EDITÁVEL; os chips só vêm do negócio informado no passo 2 (host, Bolt);
// o texto que está na tela é exatamente o que a equipe recebe (firstRequest no completeOnboarding).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnboardingFirstDeliveryStep } from '../src/client/onboarding/OnboardingFirstDeliveryStep.tsx'
import { FIRST_REQUEST_MAX, createPersonaLiveStore, firstRequestForHost } from '../src/client/remote/persona-live-store.ts'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const shellT = (key: string) => key

function step(extra: Partial<React.ComponentProps<typeof OnboardingFirstDeliveryStep>> = {}) {
  const onRequest = vi.fn()
  const view = render(
    <OnboardingFirstDeliveryStep
      dict={pt}
      shellT={shellT}
      greetingName="Ana"
      vaultReady
      phase="intro"
      onRequest={onRequest}
      onEnterApp={() => undefined}
      onCelebrateContinue={() => undefined}
      {...extra}
    />,
  )
  return { onRequest, ...view }
}

describe('o campo "O pedido"', () => {
  it('sem mexer, "Pedir agora" manda o texto que está na tela (nada escondido)', () => {
    const { onRequest } = step({ onPromptChange: () => undefined })
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    expect(onRequest).toHaveBeenCalledWith(pt['step5.taskPreview'])
  })

  it('editado, manda o texto editado; o campo aceita no máximo 500 caracteres', () => {
    const { onRequest } = step({ prompt: '  Monte o cardápio da semana com preços  ', onPromptChange: () => undefined })
    const field = screen.getByRole('textbox', { name: pt['step5.taskPreviewLabel'] }) as HTMLInputElement
    expect(field.maxLength).toBe(500)
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    expect(onRequest).toHaveBeenCalledWith('Monte o cardápio da semana com preços')
  })

  it('digitar avisa a tela; a dica diz que a equipe recebe exatamente o que está ali', () => {
    const onPromptChange = vi.fn()
    step({ onPromptChange })
    fireEvent.change(screen.getByRole('textbox', { name: pt['step5.taskPreviewLabel'] }), { target: { value: 'Responda os e-mails de hoje' } })
    expect(onPromptChange).toHaveBeenCalledWith('Responda os e-mails de hoje')
    expect(screen.getByText(pt['step5.taskEditHint'])).toBeTruthy()
  })

  it('campo vazio: "Pedir agora" desabilitado COM a linha do porquê (nunca botão morto sem motivo)', () => {
    step({ prompt: '   ', onPromptChange: () => undefined })
    expect((screen.getByRole('button', { name: pt['step5.requestNow'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(pt['step5.requestEmpty'])).toBeTruthy()
  })

  it('sem handler de edição (prévia) continua um texto fixo, sem campo', () => {
    step()
    expect(screen.queryByRole('textbox', { name: pt['step5.taskPreviewLabel'] })).toBeNull()
  })
})

describe('chips do negócio do passo 2', () => {
  it('com 1 a 3 ideias do host: aparecem num grupo rotulado e clicar preenche o campo', async () => {
    const suggest = vi.fn(async () => ['Monte o cardápio da semana com preços', 'Responda os pedidos do WhatsApp', 'Faça a lista de compras', 'quarta ideia some'])
    const onPromptChange = vi.fn()
    step({ onPromptChange, businessText: 'Padaria do bairro, 3 funcionários', suggestFirstRequests: suggest })
    const group = await screen.findByRole('group', { name: pt['step5.suggestionsLabel'] })
    expect(suggest).toHaveBeenCalledWith('Padaria do bairro, 3 funcionários')
    const chips = group.querySelectorAll('button')
    expect(chips).toHaveLength(3) // no máximo 3
    fireEvent.click(chips[0]!)
    expect(onPromptChange).toHaveBeenCalledWith('Monte o cardápio da semana com preços')
  })

  it('sem negócio informado: não pergunta ao host e não mostra chip', () => {
    const suggest = vi.fn(async () => ['x'])
    step({ onPromptChange: () => undefined, businessText: '   ', suggestFirstRequests: suggest })
    expect(suggest).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: pt['step5.suggestionsLabel'] })).toBeNull()
  })

  it('o host devolve vazio ou falha: sem chips, o campo segue com o texto padrão (nunca inventa a empresa)', async () => {
    step({ onPromptChange: () => undefined, businessText: 'Padaria', suggestFirstRequests: async () => [] })
    await Promise.resolve()
    expect(screen.queryByRole('group', { name: pt['step5.suggestionsLabel'] })).toBeNull()
    cleanup()
    const failing = vi.fn(async () => { throw new Error('boom') })
    step({ onPromptChange: () => undefined, businessText: 'Padaria', suggestFirstRequests: failing })
    await vi.waitFor(() => { expect(failing).toHaveBeenCalled() })
    expect(screen.queryByRole('group', { name: pt['step5.suggestionsLabel'] })).toBeNull()
    expect(screen.getByRole('textbox', { name: pt['step5.taskPreviewLabel'] })).toBeTruthy()
  })

  it('só no passo de intro (nas outras fases não pergunta nada ao host)', () => {
    const suggest = vi.fn(async () => ['x'])
    step({ phase: 'working', onPromptChange: () => undefined, businessText: 'Padaria', suggestFirstRequests: suggest })
    expect(suggest).not.toHaveBeenCalled()
  })
})

describe('o pedido que vai ao host', () => {
  it('firstRequestForHost: tira os espaços das pontas, corta em 500 e vazio vira "não mandar"', () => {
    expect(firstRequestForHost('  oi  ')).toBe('oi')
    expect(firstRequestForHost('   ')).toBeUndefined()
    expect(firstRequestForHost(undefined)).toBeUndefined()
    expect(firstRequestForHost('a'.repeat(900))).toHaveLength(FIRST_REQUEST_MAX)
  })

  function hostWithCompleteSpy() {
    const completeOnboarding = vi.fn(async () => ({ ok: true, value: undefined }))
    const ok = (value: unknown) => Promise.resolve({ ok: true, value })
    const host: Record<string, unknown> = {
      listProjects: () => ok([{ id: 'proj-pessoal' }]),
      listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
      getOnboarding: () => ok({ firstUse: true, completed: false, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
      ping: () => ok({ protocol: 1 }),
      getOverviewNow: () => ok({ personas: [] }),
      getWhileAway: () => ok({ events: [] }),
      getOverview: () => ok({ needsYou: [], inProgress: [] }),
      listTeam: () => ok({ personas: [], members: [] }),
      listTasks: () => ok([]),
      listMessages: () => ok({ events: [] }),
      listDms: () => ok([]),
      markVisit: () => ok(true),
      followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
      completeOnboarding,
    }
    return { host, completeOnboarding }
  }

  it('completeOnboarding leva firstRequest (aparado) quando a pessoa escreveu um pedido', async () => {
    const { host, completeOnboarding } = hostWithCompleteSpy()
    const live = createPersonaLiveStore(host as never)
    await live.bootstrap(() => undefined)
    await live.completeOnboarding('Ana', [], { cofreSeed: 'Padaria', firstRequest: '  Monte o cardápio  ' })
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
    expect((completeOnboarding.mock.calls[0] as unknown as [{ firstRequest?: string; cofreSeed: string }])[0]).toMatchObject({ firstRequest: 'Monte o cardápio', cofreSeed: 'Padaria' })
    live.dispose()
  })

  it('sem pedido (ou em branco) o campo nem vai: vale o padrão do host', async () => {
    const { host, completeOnboarding } = hostWithCompleteSpy()
    const live = createPersonaLiveStore(host as never)
    await live.bootstrap(() => undefined)
    await live.completeOnboarding('Ana', [], { cofreSeed: 'Padaria', firstRequest: '   ' })
    expect('firstRequest' in (completeOnboarding.mock.calls[0] as unknown as [object])[0]).toBe(false)
    live.dispose()
  })
})
