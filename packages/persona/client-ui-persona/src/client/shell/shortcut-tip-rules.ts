/**
 * P1-11 (NEXT-STEP-SHORTCUTS-SPEC §2, Muse): atalhos ensinados na hora certa. Puro, sem React: decide QUANDO a dica
 * "Dica: Ctrl K → 'quadros' chega aqui mais rápido." aparece.
 *
 * - Gatilho: a 3ª vez, na mesma sessão, que a pessoa chega à MESMA tela pelo mouse (a tela tem de ser uma que o Ctrl K "Ir para" acha).
 * - Uma vez por atalho, para sempre (localStorage); no máximo 1 dica por sessão; nunca durante a digitação nem com um Modal aberto.
 * - Desligada em Configurações › Aparência ("Dicas de atalho"): nem conta chegadas.
 * Uma dica que não pôde aparecer (digitando, Modal aberto) NÃO conta como mostrada: a próxima chegada pode mostrá-la.
 */

import type { ShellKey } from '../locale/shell/locales.ts'
import type { MainPanelId } from './create-shell-store.ts'
import { NAV_GROUPS } from './nav-groups.ts'

/** A chegada que dispara a dica. */
export const SHORTCUT_TIP_ARRIVALS = 3
/** Quanto tempo a dica fica na tela (Muse: 6 s). */
export const SHORTCUT_TIP_MS = 6000
/** Entre o toque do mouse e a troca de tela, o quanto ainda vale como "chegou pelo mouse". */
export const MOUSE_ARRIVAL_WINDOW_MS = 1500
/** localStorage: a lista (JSON) das telas cuja dica já foi mostrada. */
export const SHORTCUT_TIP_SEEN_KEY = 'persona.shortcutTips.seen'

/** Telas que o Ctrl K acha por nome mas que a pessoa abre por outro caminho (a lista de conversas, o "?" ou o próprio Ctrl K): sem dica. */
const WITHOUT_TIP: ReadonlySet<string> = new Set(['channels', 'directMessages', 'help', 'search', 'profile'])

/** A chave do nome da tela, a MESMA que o "Ir para" do Ctrl K mostra e procura (a dica nunca promete um nome que o Ctrl K não acha). */
export function shortcutTipLabelKey(panel: MainPanelId): ShellKey | undefined {
  if (WITHOUT_TIP.has(panel)) return undefined
  for (const group of NAV_GROUPS) {
    const item = group.items.find(row => row.panel === panel)
    if (item !== undefined) return item.labelKey
  }
  return undefined
}

/** O que o app sabe no instante em que a pessoa chega a uma tela. */
export interface ShortcutTipContext {
  /** "Dicas de atalho" ligada. */
  readonly enabled: boolean
  /** O foco está num campo de texto (input, textarea, select, contenteditable). */
  readonly typing: boolean
  /** Há um `Modal` aberto. */
  readonly modalOpen: boolean
}

export interface ShortcutTipTracker {
  /** A pessoa chegou a `panel` pelo mouse. Devolve a tela a ensinar AGORA, ou `undefined`. */
  arrive: (panel: MainPanelId, context: ShortcutTipContext) => MainPanelId | undefined
}

type SeenStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): SeenStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function readSeen(storage: SeenStorage | undefined): Set<string> {
  try {
    const raw = storage?.getItem(SHORTCUT_TIP_SEEN_KEY)
    if (raw === null || raw === undefined) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((row): row is string => typeof row === 'string') : [])
  } catch {
    return new Set()
  }
}

/**
 * Um rastreador por sessão (as contagens vivem na memória e zeram ao recarregar; o "já mostrei" vive no storage). Sem storage
 * (janela privada, dados bloqueados) a memória segura o "já mostrei" até recarregar: nunca mais de uma dica por sessão de qualquer jeito.
 */
export function createShortcutTipTracker(storage: SeenStorage | undefined = defaultStorage()): ShortcutTipTracker {
  const counts = new Map<string, number>()
  const memorySeen = new Set<string>()
  let shownThisSession = false
  const isSeen = (panel: string): boolean => memorySeen.has(panel) || readSeen(storage).has(panel)
  const markSeen = (panel: string): void => {
    memorySeen.add(panel)
    try {
      const seen = readSeen(storage)
      seen.add(panel)
      storage?.setItem(SHORTCUT_TIP_SEEN_KEY, JSON.stringify([...seen]))
    } catch {
      /* sem storage: a memória segura até recarregar */
    }
  }
  return {
    arrive(panel, context) {
      if (shortcutTipLabelKey(panel) === undefined || !context.enabled) return undefined
      const count = (counts.get(panel) ?? 0) + 1
      counts.set(panel, count)
      if (count < SHORTCUT_TIP_ARRIVALS || shownThisSession || isSeen(panel)) return undefined
      if (context.typing || context.modalOpen) return undefined
      shownThisSession = true
      markSeen(panel)
      return panel
    },
  }
}

/** O foco está num campo de texto: a dica espera. */
export function isTypingTarget(element: Element | null): boolean {
  if (element === null) return false
  if (element instanceof HTMLElement && element.isContentEditable) return true
  return /^(INPUT|TEXTAREA|SELECT)$/u.test(element.tagName)
}

export interface MouseOriginProbe {
  /** A última coisa que a pessoa fez foi um toque do mouse, há pouco? (Teclado depois do toque cancela.) */
  wasMouse: () => boolean
  dispose: () => void
}

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/**
 * Distingue "cheguei pelo mouse" de "cheguei pelo teclado ou pelo Ctrl K": um `pointerdown` marca o instante; qualquer tecla (que não seja
 * só um modificador) apaga a marca. A troca de tela logo depois de um toque do mouse é a chegada pelo mouse. Mede no capture, antes de qualquer tela.
 */
export function watchMouseOrigin(doc: Document = document, now: () => number = Date.now): MouseOriginProbe {
  let pointerAt: number | undefined
  const onPointerDown = (event: PointerEvent): void => {
    pointerAt = event.pointerType === 'touch' ? undefined : now()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!MODIFIER_KEYS.has(event.key)) pointerAt = undefined
  }
  doc.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('keydown', onKeyDown, true)
  return {
    wasMouse: () => pointerAt !== undefined && now() - pointerAt <= MOUSE_ARRIVAL_WINDOW_MS,
    dispose: () => {
      doc.removeEventListener('pointerdown', onPointerDown, true)
      doc.removeEventListener('keydown', onKeyDown, true)
    },
  }
}
