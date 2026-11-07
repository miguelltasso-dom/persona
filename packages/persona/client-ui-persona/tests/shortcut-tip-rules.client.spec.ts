// @vitest-environment jsdom
// P1-11 (NEXT-STEP-SHORTCUTS-SPEC §2): as regras puras de "quando a dica de atalho aparece" + a detecção de chegada pelo mouse.
import { afterEach, describe, expect, it } from 'vitest'
import type { MainPanelId } from '../src/client/shell/create-shell-store.ts'
import { NAV_GROUPS } from '../src/client/shell/nav-groups.ts'
import {
  MOUSE_ARRIVAL_WINDOW_MS,
  SHORTCUT_TIP_ARRIVALS,
  SHORTCUT_TIP_SEEN_KEY,
  createShortcutTipTracker,
  isTypingTarget,
  shortcutTipLabelKey,
  watchMouseOrigin,
  type ShortcutTipContext,
  type ShortcutTipTracker,
} from '../src/client/shell/shortcut-tip-rules.ts'

const open = { enabled: true, typing: false, modalOpen: false } as const

function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
}

const arriveTimes = (tracker: ShortcutTipTracker, panel: MainPanelId, times: number, context: ShortcutTipContext = open): (string | undefined)[] =>
  Array.from({ length: times }, () => tracker.arrive(panel, context))

describe('quando a dica aparece', () => {
  it('a 3ª chegada pelo mouse à mesma tela mostra a dica; a 1ª e a 2ª não', () => {
    const tracker = createShortcutTipTracker(memoryStorage())
    expect(SHORTCUT_TIP_ARRIVALS).toBe(3)
    expect(arriveTimes(tracker, 'kanban', 3)).toEqual([undefined, undefined, 'kanban'])
  })

  it('as chegadas de OUTRAS telas não somam: 2 em Quadros + 1 em Rotinas não dispara nada', () => {
    const tracker = createShortcutTipTracker(memoryStorage())
    expect([tracker.arrive('kanban', open), tracker.arrive('routines', open), tracker.arrive('kanban', open)]).toEqual([undefined, undefined, undefined])
  })

  it('uma vez por atalho, PARA SEMPRE: o storage lembra, uma sessão nova (outro rastreador) não repete', () => {
    const storage = memoryStorage()
    expect(arriveTimes(createShortcutTipTracker(storage), 'kanban', 3)[2]).toBe('kanban')
    expect(JSON.parse(storage.data.get(SHORTCUT_TIP_SEEN_KEY) ?? '[]')).toEqual(['kanban'])
    expect(arriveTimes(createShortcutTipTracker(storage), 'kanban', 6)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  })

  it('no máximo 1 dica por sessão: depois de Quadros, 3 chegadas a Rotinas não mostram; numa sessão nova, mostram', () => {
    const storage = memoryStorage()
    const session = createShortcutTipTracker(storage)
    expect(arriveTimes(session, 'kanban', 3)[2]).toBe('kanban')
    expect(arriveTimes(session, 'routines', 5)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(arriveTimes(createShortcutTipTracker(storage), 'routines', 3)[2]).toBe('routines')
  })

  it('digitando ou com um Modal aberto a dica espera, NÃO conta como mostrada e a próxima chegada pode mostrá-la', () => {
    const storage = memoryStorage()
    const tracker = createShortcutTipTracker(storage)
    expect(arriveTimes(tracker, 'usage', 2)).toEqual([undefined, undefined])
    expect(tracker.arrive('usage', { ...open, typing: true })).toBeUndefined()
    expect(tracker.arrive('usage', { ...open, modalOpen: true })).toBeUndefined()
    expect(storage.data.has(SHORTCUT_TIP_SEEN_KEY)).toBe(false)
    expect(tracker.arrive('usage', open)).toBe('usage')
  })

  it('"Dicas de atalho" desligada: nada aparece e as chegadas nem contam (religar começa do zero)', () => {
    const tracker = createShortcutTipTracker(memoryStorage())
    expect(arriveTimes(tracker, 'kanban', 5, { ...open, enabled: false })).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(arriveTimes(tracker, 'kanban', 3)).toEqual([undefined, undefined, 'kanban'])
  })

  it('telas sem atalho de nome (conversas, Ajuda, Busca, perfil) nunca ensinam', () => {
    const tracker = createShortcutTipTracker(memoryStorage())
    for (const panel of ['channels', 'directMessages', 'help', 'search', 'profile'] as const) {
      expect(shortcutTipLabelKey(panel)).toBeUndefined()
      expect(arriveTimes(tracker, panel, 4)).toEqual([undefined, undefined, undefined, undefined])
    }
  })

  it('sem storage (janela privada) a memória ainda segura: no máximo 1 dica por sessão e nunca a mesma 2×', () => {
    const blocked = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    const tracker = createShortcutTipTracker(blocked)
    expect(arriveTimes(tracker, 'kanban', 3)[2]).toBe('kanban')
    expect(arriveTimes(tracker, 'kanban', 3)).toEqual([undefined, undefined, undefined])
    expect(arriveTimes(tracker, 'routines', 3)).toEqual([undefined, undefined, undefined])
  })

  it('lista "já vista" corrompida no storage não derruba nada', () => {
    const tracker = createShortcutTipTracker(memoryStorage({ [SHORTCUT_TIP_SEEN_KEY]: '{isto não é uma lista' }))
    expect(arriveTimes(tracker, 'kanban', 3)[2]).toBe('kanban')
  })
})

describe('o nome da tela na dica é o mesmo que o "Ir para" do Ctrl K acha', () => {
  it('toda tela do "Ir para" (menos as que se abrem por outro caminho) tem a chave de nome do próprio "Ir para"', () => {
    const items = NAV_GROUPS.flatMap(group => group.items)
    const taught = items.filter(item => shortcutTipLabelKey(item.panel) !== undefined)
    expect(taught.length).toBeGreaterThanOrEqual(12)
    for (const item of taught) expect(shortcutTipLabelKey(item.panel)).toBe(item.labelKey)
    expect(shortcutTipLabelKey('kanban')).toBe('sidebar.kanban')
  })
})

describe('chegou pelo mouse?', () => {
  const clock = (): { now: () => number; tick: (ms: number) => void } => {
    let value = 1_000
    return { now: () => value, tick: (ms) => { value += ms } }
  }
  afterEach(() => { document.body.innerHTML = '' })

  it('um toque do mouse e a troca logo depois: sim', () => {
    const time = clock()
    const probe = watchMouseOrigin(document, time.now)
    expect(probe.wasMouse()).toBe(false)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    time.tick(200)
    expect(probe.wasMouse()).toBe(true)
    probe.dispose()
  })

  it('passou da janela: não (uma troca de tela sozinha muito depois do toque não é do mouse)', () => {
    const time = clock()
    const probe = watchMouseOrigin(document, time.now)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    time.tick(MOUSE_ARRIVAL_WINDOW_MS + 1)
    expect(probe.wasMouse()).toBe(false)
    probe.dispose()
  })

  it('uma tecla depois do toque cancela (Enter no rail, Ctrl K, setas); só modificador não cancela', () => {
    const time = clock()
    const probe = watchMouseOrigin(document, time.now)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }))
    expect(probe.wasMouse()).toBe(true)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(probe.wasMouse()).toBe(false)
    probe.dispose()
  })

  it('toque de dedo (touch) não é "mouse", e depois de dispose nada mais é ouvido', () => {
    const time = clock()
    const probe = watchMouseOrigin(document, time.now)
    const touch = new Event('pointerdown', { bubbles: true })
    Object.defineProperty(touch, 'pointerType', { value: 'touch' })
    document.body.dispatchEvent(touch)
    expect(probe.wasMouse()).toBe(false)
    probe.dispose()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(probe.wasMouse()).toBe(false)
  })
})

describe('digitando?', () => {
  it('campos de texto e contenteditable sim; botão, corpo e vazio não', () => {
    document.body.innerHTML = '<input id="i"><textarea id="t"></textarea><select id="s"></select><div id="c" contenteditable="true"></div><button id="b">x</button>'
    const byId = (id: string): Element | null => document.getElementById(id)
    for (const id of ['i', 't', 's']) expect(isTypingTarget(byId(id))).toBe(true)
    // jsdom não implementa `isContentEditable`: o atributo vale o mesmo no navegador de verdade
    Object.defineProperty(byId('c'), 'isContentEditable', { value: true })
    expect(isTypingTarget(byId('c'))).toBe(true)
    expect(isTypingTarget(byId('b'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    document.body.innerHTML = ''
  })
})
