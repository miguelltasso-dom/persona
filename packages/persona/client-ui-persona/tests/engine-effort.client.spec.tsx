// @vitest-environment jsdom
// EFF-1 — Modelo e esforço por persona, com os níveis NATIVOS do motor (EFFORT-SPEC.md, D-088): modelo puro, Modal em 3 blocos (listas), chip no cartão.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { ENGINE_EFFORT_FLAG_KEY, isEngineEffortEnabled } from '../src/client/profile/engine-effort-flag.ts'
import {
  ENGINE_DEFAULT_ID,
  acceptedEffortLevels,
  effortLevelHint,
  effortLevelLabel,
  formatEngineEffortChip,
  modelOptionsForConnection,
  snapEffort,
} from '../src/client/profile/engine-effort-model.ts'
import { PersonaEngineOverlay } from '../src/client/profile/PersonaEngineOverlay.tsx'
import { PersonaInfoCard } from '../src/client/profile/PersonaInfoCard.tsx'

installPreviewTheme()
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

const t = (key: string, params?: Readonly<Record<string, string>>) => bindLocale(profilePt, key, params)

const CLAUDE_CONN: ConnectionView = {
  id: 'conn-claude',
  kind: 'claude',
  available: true,
  loggedIn: true,
  loginHint: '',
  phase: 'ready',
  defaultEffortLevels: ['low', 'medium', 'high'],
  models: [
    { id: 'opus', label: 'Opus', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { id: 'sonnet', label: 'Sonnet', effortLevels: ['low', 'medium', 'high'] },
    { id: 'haiku', label: 'Haiku', effortLevels: [] },
  ],
}

const CODEX_NO_EFFORT: ConnectionView = {
  id: 'conn-codex',
  kind: 'codex',
  available: true,
  loggedIn: true,
  loginHint: '',
  phase: 'ready',
}

describe('EFF-1 — modelo puro (engine-effort-model)', () => {
  it('flag nasce desligada e liga por localStorage ou __PERSONA_FLAGS__', () => {
    expect(isEngineEffortEnabled()).toBe(false)
    localStorage.setItem(ENGINE_EFFORT_FLAG_KEY, '1')
    expect(isEngineEffortEnabled()).toBe(true)
    localStorage.clear()
    ;(window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__ = { engineEffort: true }
    expect(isEngineEffortEnabled()).toBe(true)
  })

  it('lista só os modelos e níveis que o host mandou, na ordem do host, começando por Padrão do motor', () => {
    const models = modelOptionsForConnection(t, CLAUDE_CONN)
    expect(models.map(m => m.id)).toEqual([ENGINE_DEFAULT_ID, 'opus', 'sonnet', 'haiku'])
    expect(models[0]?.title).toBe('Padrão do motor')
    expect(acceptedEffortLevels(CLAUDE_CONN, null)).toEqual(['low', 'medium', 'high'])
    expect(acceptedEffortLevels(CLAUDE_CONN, 'opus')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(acceptedEffortLevels(CLAUDE_CONN, 'haiku')).toEqual([])
    expect(acceptedEffortLevels(CODEX_NO_EFFORT, null)).toEqual([])
  })

  it('snapEffort cai para o nível válido mais próximo abaixo quando o modelo muda', () => {
    expect(snapEffort('xhigh', ['low', 'medium', 'high'])).toEqual({ next: 'high', snappedFrom: 'xhigh' })
    expect(snapEffort('high', ['low', 'medium', 'high'])).toEqual({ next: 'high', snappedFrom: null })
    expect(snapEffort('medium', [])).toEqual({ next: null, snappedFrom: 'medium' })
    expect(snapEffort(null, ['low', 'high'])).toEqual({ next: null, snappedFrom: null })
  })

  it('chip formata "Opus · max" com o nome NATIVO do nível, só "Sonnet" no padrão do motor, e o rótulo do padrão quando nada foi escolhido', () => {
    const nameOf = (lvl: string) => effortLevelLabel(t, lvl)
    expect(formatEngineEffortChip({ runnerModel: 'opus', runnerEffort: 'max' }, nameOf)).toBe('Opus · max')
    expect(formatEngineEffortChip({ runnerModel: 'opus', runnerEffort: 'xhigh' })).toBe('Opus · xhigh')
    expect(formatEngineEffortChip({ runnerModel: 'opus', runnerEffort: ' Ultra ' })).toBe('Opus · ultra')
    expect(formatEngineEffortChip({ runnerModel: 'sonnet', runnerEffort: null }, nameOf)).toBe('Sonnet')
    expect(formatEngineEffortChip({ runnerModel: null, runnerEffort: null }, nameOf)).toBeUndefined()
    expect(formatEngineEffortChip({ runnerModel: null, runnerEffort: null }, nameOf, 'Padrão do motor')).toBe('Padrão do motor')
    expect(formatEngineEffortChip({ runnerModel: null, runnerEffort: 'high' }, nameOf, 'Padrão do motor')).toBe('Padrão do motor · high')
  })

  it('nível: o rótulo é o nome nativo em minúsculas; a dica é a da Muse, e um nome que o host mandou sem dica fica só com o nome', () => {
    expect(effortLevelLabel(t, 'MAX')).toBe('max')
    expect(effortLevelLabel(t, null)).toBe('Padrão do motor')
    expect(effortLevelHint(t, null)).toBe('O motor decide quanto pensar')
    expect(effortLevelHint(t, 'minimal')).toBe('O mínimo de raciocínio, o mais rápido')
    expect(effortLevelHint(t, 'low')).toBe('Mais rápido, gasta menos do limite')
    expect(effortLevelHint(t, 'medium')).toBe('Equilíbrio entre rapidez e cuidado')
    expect(effortLevelHint(t, 'high')).toBe('Mais cuidadoso')
    expect(effortLevelHint(t, 'xhigh')).toBe('Bem mais cuidadoso, gasta mais do limite')
    expect(effortLevelHint(t, 'max')).toBe('O máximo de cuidado, mais lento e gasta bem mais do limite')
    expect(effortLevelHint(t, 'ultra')).toBe('Acima do max: o mais lento e o que mais gasta')
    expect(effortLevelHint(t, 'turbo')).toBeUndefined()
  })

  it('o ajuste (snap) cai para o nível conhecido mais próximo abaixo, inclusive com minimal e ultra; nome desconhecido não se compara', () => {
    expect(snapEffort('ultra', ['low', 'medium', 'high', 'xhigh', 'max'])).toEqual({ next: 'max', snappedFrom: 'ultra' })
    expect(snapEffort('xhigh', ['low', 'high', 'max'])).toEqual({ next: 'high', snappedFrom: 'xhigh' })
    expect(snapEffort('minimal', ['low', 'medium'])).toEqual({ next: null, snappedFrom: 'minimal' })
    expect(snapEffort('turbo', ['low', 'high'])).toEqual({ next: null, snappedFrom: 'turbo' })
  })
})

describe('EFF-1 — PersonaEngineOverlay (3 blocos)', () => {
  function mountOverlay(options: {
    readonly connections?: readonly ConnectionView[]
    readonly personas?: readonly { readonly id: string; readonly engine?: { readonly runnerKind: 'dsh' | 'cli'; readonly runnerCli: string; readonly runnerModel: string | null; readonly runnerEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null } }[]
    readonly onSetEngine?: (req: unknown) => void
  } = {}) {
    const setPersonaEngine = vi.fn(async (req: unknown) => {
      options.onSetEngine?.(req)
      return { ok: true as const, value: {} }
    })
    const listConnections = vi.fn(async () => ({
      ok: true as const,
      value: options.connections ?? [CLAUDE_CONN, CODEX_NO_EFFORT],
    }))
    const listPersonas = vi.fn(async () => ({
      ok: true as const,
      value: options.personas ?? [{ id: 'p-atlas' }],
    }))
    const closeEngineEditor = vi.fn()
    const invalidate = vi.fn()

    render(
      <PersonaEngineOverlay
        dict={profilePt}
        persona={{ listConnections, listPersonas, setPersonaEngine } as never}
        cardBridge={{ invalidate, revision: { getSnapshot: () => ({ n: 0 }), subscribe: () => () => {} }, cardInfo: () => undefined, prefetch: () => {}, togglePause: async () => {} }}
        useShell={selector => selector({ enginePersonaId: 'p-atlas' } as never)}
        scope={() => ({ workspaceId: 'ws-1', projectId: 'proj-1' })}
        closeEngineEditor={closeEngineEditor}
      />,
    )
    return { setPersonaEngine, closeEngineEditor, invalidate }
  }

  it('persona nova sai com Padrão do motor (modelo e esforço = null), sem selo Recomendado e sem a palavra Capricho', async () => {
    const { setPersonaEngine } = mountOverlay()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Claude Code/u })).toBeTruthy()
    })

    // Nenhum selo Recomendado; o campo é Esforço (nunca Capricho); os níveis aparecem com o nome nativo do motor
    expect(document.body.textContent).not.toMatch(/Recomendado/u)
    expect(document.body.textContent).not.toMatch(/[Cc]aprich/u)
    expect(screen.getByRole('radiogroup', { name: 'Esforço' })).toBeTruthy()
    expect(document.querySelector('[data-engine-block="effort"] label[data-checked="true"]')?.textContent ?? '').toContain('Padrão do motor')

    // Salvar direto sem mexer manda runnerModel: null e runnerEffort: null
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => {
      expect(setPersonaEngine).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        personaId: 'p-atlas',
        runnerKind: 'cli',
        runnerCli: 'claude',
        runnerModel: null,
        runnerEffort: null,
      })
    })
  })

  it('origem da lista em palavras simples, embaixo de Modelo (§4.1): "Da sua conta" (cli) ou "Lista padrão do Claude Code: sua conta não informou os modelos" (static); sem a palavra técnica', async () => {
    mountOverlay({ connections: [{ ...CLAUDE_CONN, source: 'cli' } as ConnectionView] })
    await waitFor(() => {
      expect(screen.getByText('Da sua conta')).toBeTruthy()
    })
    cleanup()
    mountOverlay({ connections: [{ ...CLAUDE_CONN, source: 'static' } as ConnectionView] })
    await waitFor(() => {
      expect(screen.getByText('Lista padrão do Claude Code: sua conta não informou os modelos')).toBeTruthy()
    })
    expect(document.body.textContent).not.toMatch(/\bstatic\b/u)
  })

  it('escolher Opus + xhigh: a lista de esforço tem uma linha por nível nativo com a dica da Muse; trocar para Sonnet derruba o nível e avisa com os nomes nativos', async () => {
    const { setPersonaEngine } = mountOverlay()
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Opus/u })).toBeTruthy()
    })

    // Escolhe modelo Opus
    fireEvent.click(screen.getByRole('radio', { name: /Opus/u }))

    // A lista de Esforço mostra "Padrão do motor" e os 5 níveis nativos do Opus, na ordem do host, cada um com a dica embaixo
    const group = screen.getByRole('radiogroup', { name: 'Esforço' })
    const rows = [...group.querySelectorAll('label')].map(row => row.textContent ?? '')
    expect(rows.map(text => text.replace('✓', ''))).toEqual([
      'Padrão do motorO motor decide quanto pensar',
      'lowMais rápido, gasta menos do limite',
      'mediumEquilíbrio entre rapidez e cuidado',
      'highMais cuidadoso',
      'xhighBem mais cuidadoso, gasta mais do limite',
      'maxO máximo de cuidado, mais lento e gasta bem mais do limite',
    ])
    // São botões de rádio de UM grupo (o navegador dá as setas) e só um está marcado
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(new Set(radios.map(radio => radio.name))).toEqual(new Set(['persona-engine-effort']))
    const veryCareful = within(group).getByRole('radio', { name: /^xhigh/u }) as HTMLInputElement
    fireEvent.click(veryCareful)
    expect(veryCareful.checked).toBe(true)
    expect(radios.filter(radio => radio.checked)).toHaveLength(1)

    // Trocar para Sonnet (que vai só até high) derruba de xhigh para high e avisa com os nomes nativos
    fireEvent.click(screen.getByRole('radio', { name: /Sonnet/u }))
    expect(screen.getByText('O Sonnet não tem "xhigh"; ficou em "high".')).toBeTruthy()
    expect((within(screen.getByRole('radiogroup', { name: 'Esforço' })).getByRole('radio', { name: /^high/u }) as HTMLInputElement).checked).toBe(true)

    // Salva direto, sem confirmação extra
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => {
      expect(setPersonaEngine).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        personaId: 'p-atlas',
        runnerKind: 'cli',
        runnerCli: 'claude',
        runnerModel: 'sonnet',
        runnerEffort: 'high',
      })
    })
  })

  it('quando o modelo derruba o nível, a linha do aviso (role=status) rola para a vista: nunca fica sob o degradê do fim da rolagem', async () => {
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoViewSpy(this: Element) { scrolled.push(this) }
    try {
      mountOverlay()
      await waitFor(() => { expect(screen.getByRole('radio', { name: /Opus/u })).toBeTruthy() })
      fireEvent.click(screen.getByRole('radio', { name: /Opus/u }))
      fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Esforço' })).getByRole('radio', { name: /^xhigh/u }))
      scrolled.length = 0
      fireEvent.click(screen.getByRole('radio', { name: /Sonnet/u }))
      const notice = screen.getByRole('status')
      expect(notice.textContent).toBe('O Sonnet não tem "xhigh"; ficou em "high".')
      expect(scrolled).toContain(notice)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('motor ou modelo sem esforço esconde a lista e mostra a frase honesta', async () => {
    mountOverlay()
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Haiku/u })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('radio', { name: /Haiku/u }))
    expect(screen.queryByRole('radiogroup', { name: 'Esforço' })).toBeNull()
    expect(screen.getByText('Este motor não deixa escolher o esforço.')).toBeTruthy()
  })

  it('um nome de nível que o host mandou e que não tem dica (ou ultra, que tem) aparece com o NOME nativo, sem quebrar e sem inventar dica', async () => {
    const codexLike: ConnectionView = {
      id: 'conn-codex',
      kind: 'codex',
      available: true,
      loggedIn: true,
      loginHint: '',
      phase: 'ready',
      defaultEffortLevels: ['minimal', 'low', 'turbo', 'ultra'] as never,
      models: [{ id: 'gpt-6-sol', label: 'GPT-6 Sol', effortLevels: ['low', 'ultra', 'turbo'] as never }],
    }
    mountOverlay({ connections: [codexLike] })
    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: 'Esforço' })).toBeTruthy()
    })
    const rowOf = (name: string): HTMLElement => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-engine-block="effort"] label')].find(label => (label.querySelector('input') as HTMLInputElement).value === name)
      if (row === undefined) throw new Error(`no effort row ${name}`)
      return row
    }
    expect(rowOf('turbo').textContent?.replace('✓', '')).toBe('turbo')
    // Só o nome (a linha tem o nome e nenhuma dica); a de "ultra" tem o nome e a dica.
    expect(rowOf('turbo').querySelector('input + span')?.children).toHaveLength(1)
    expect(rowOf('ultra').querySelector('input + span')?.children).toHaveLength(2)
    expect(rowOf('ultra').textContent?.replace('✓', '')).toBe('ultraAcima do max: o mais lento e o que mais gasta')
    expect(rowOf('minimal').textContent?.replace('✓', '')).toBe('minimalO mínimo de raciocínio, o mais rápido')
    // Escolher um nome sem dica grava esse nome, tal qual o host mandou
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Esforço' })).getByRole('radio', { name: /^turbo/u }))
    expect((within(screen.getByRole('radiogroup', { name: 'Esforço' })).getByRole('radio', { name: /^turbo/u }) as HTMLInputElement).checked).toBe(true)
  })

  it('clicar de novo no motor que já está escolhido não joga fora o modelo e o esforço escolhidos', async () => {
    mountOverlay()
    fireEvent.click(await screen.findByRole('option', { name: /Claude Code/u }))
    const opus = await screen.findByRole('radio', { name: /Opus/u })
    fireEvent.click(opus)
    fireEvent.click(await screen.findByRole('radio', { name: /^max/u }))
    expect((screen.getByRole('radio', { name: /Opus/u }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('option', { name: /Claude Code/u }))
    expect((screen.getByRole('radio', { name: /Opus/u }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: /^max/u }) as HTMLInputElement).checked).toBe(true)
    // Trocar para OUTRO motor continua zerando o modelo (o padrão do motor novo).
    fireEvent.click(screen.getByRole('option', { name: /Codex/u }))
    expect(document.querySelector('[data-engine-block="model"] label[data-checked="true"]')?.textContent ?? '').toContain('Padrão do motor')
  })

  it('o modelo salvo vem marcado e rola para a vista (a lista longa do host passa da primeira tela)', async () => {
    const scrolled: Element[] = []
    const options: unknown[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoViewSpy(this: Element, arg?: boolean | ScrollIntoViewOptions) { scrolled.push(this); options.push(arg) }
    try {
      mountOverlay({ personas: [{ id: 'p-atlas', engine: { runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', runnerEffort: null } }] })
      await waitFor(() => {
        expect(scrolled.some(el => el.getAttribute('data-checked') === 'true' && (el.textContent ?? '').includes('Haiku'))).toBe(true)
      })
      // Muse 16:25: o modelo salvo vai para o CENTRO da área (a dica dele nunca fica colada no fim, sob o degradê).
      const savedIndex = scrolled.findIndex(el => el.getAttribute('data-checked') === 'true' && (el.textContent ?? '').includes('Haiku'))
      expect(options[savedIndex]).toEqual({ block: 'center' })
      // Only the saved row is checked, and it is the one that scrolled.
      const checkedRows = document.querySelectorAll('[data-engine-block="model"] label[data-checked="true"]')
      expect(checkedRows).toHaveLength(1)
      expect(checkedRows[0]?.textContent ?? '').toContain('Haiku')
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('com o Padrão do motor salvo (a 1ª linha, no alto) o diálogo não rola: nada a trazer para a vista', async () => {
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoViewSpy(this: Element) { scrolled.push(this) }
    try {
      mountOverlay()
      await waitFor(() => { expect(screen.getByRole('radiogroup', { name: 'Esforço' })).toBeTruthy() })
      expect(scrolled.filter(el => el.closest('[data-engine-block="model"]') !== null)).toHaveLength(0)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('com o esforço desligado, grava o modelo escolhido (aqui, Padrão do motor = null), nunca "sonnet" fixo', async () => {
    localStorage.setItem('persona.flag.engineEffort', '0')
    try {
      const { setPersonaEngine } = mountOverlay()
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Claude Code/u })).toBeTruthy()
      })
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      await waitFor(() => {
        expect(setPersonaEngine).toHaveBeenCalled()
      })
      const req = setPersonaEngine.mock.calls[0]?.[0] as { runnerModel?: unknown } | undefined
      expect(req?.runnerModel).toBeNull()
      expect(JSON.stringify(setPersonaEngine.mock.calls)).not.toContain('"sonnet"')
    } finally {
      localStorage.removeItem('persona.flag.engineEffort')
    }
  })

  it('a lista de motores é um listbox com as opções diretamente dentro, sem li (axe listitem, captura personas)', async () => {
    mountOverlay()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Claude Code/u })).toBeTruthy()
    })
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getAllByRole('option').length).toBeGreaterThan(0)
    expect(listbox.querySelector('li')).toBeNull()
  })
})

describe('EFF-1 — chip no cartão da persona', () => {
  it('mostra o chip "Opus · xhigh" (nome nativo do nível) ao lado do motor quando configurado', () => {
    localStorage.setItem(ENGINE_EFFORT_FLAG_KEY, '1')
    render(
      <PersonaInfoCard
        dict={profilePt}
        info={{
          personaId: 'p-atlas',
          name: 'Atlas',
          role: 'Coordenação',
          systemRoles: ['coordination'],
          nowKind: 'idle',
          presence: 'online',
          engineLabel: 'Claude · Opus',
          runnerModel: 'opus',
          runnerEffort: 'xhigh',
        }}
      />,
    )
    expect(screen.getByText('Opus · xhigh')).toBeTruthy()
  })
})
