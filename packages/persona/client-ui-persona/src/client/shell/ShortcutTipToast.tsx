/**
 * P1-11 (NEXT-STEP-SHORTCUTS-SPEC §2, Muse): "Dica: Ctrl K → 'quadros' chega aqui mais rápido." — um `Toast tone="neutral"` de 6 s no canto de sempre, com as teclas em
 * `kbd`. Quando mostrar é do {@link createShortcutTipTracker} (3ª chegada pelo mouse à mesma tela, 1× por atalho para sempre, 1 por sessão, nunca digitando nem com Modal
 * aberto, só com "Dicas de atalho" ligada). Este componente só observa a troca de tela e desenha; sem dica, não renderiza nada (nem a região).
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { KeyCap, Toast, ToastRegion } from '../primitives/index.ts'
import type { MainPanelId } from './create-shell-store.ts'
import {
  SHORTCUT_TIP_MS,
  createShortcutTipTracker,
  isTypingTarget,
  shortcutTipLabelKey,
  watchMouseOrigin,
  type MouseOriginProbe,
  type ShortcutTipTracker,
} from './shortcut-tip-rules.ts'
import { isShortcutTipsEnabled, subscribeShortcutTips } from './shortcut-tips-preference.ts'

/** Marca o lugar das teclas dentro do texto traduzido ("Dica: {keys} → '{screen}' …"), para trocá-lo por `kbd`. */
const KEYS_TOKEN = '\u0001keys\u0001'

export interface ShortcutTipToastProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  /** A tela aberta agora; cada troca é uma chegada. */
  readonly activePanel: MainPanelId
}

export function ShortcutTipToast({ t, activePanel }: ShortcutTipToastProps): ReactNode {
  const [tip, setTip] = useState<MainPanelId | undefined>(undefined)
  const tracker = useRef<ShortcutTipTracker | null>(null)
  const probe = useRef<MouseOriginProbe | null>(null)
  const previous = useRef<MainPanelId>(activePanel)

  // Uma sessão = uma montagem: as contagens zeram ao recarregar; o "já mostrei" vive no localStorage.
  useEffect(() => {
    tracker.current = createShortcutTipTracker()
    probe.current = watchMouseOrigin()
    return () => {
      probe.current?.dispose()
      probe.current = null
      tracker.current = null
    }
  }, [])

  // Cada troca de tela é uma chegada; só conta a que veio do mouse e não de dentro do Ctrl K ("Ir para" já é o atalho).
  useEffect(() => {
    const from = previous.current
    previous.current = activePanel
    // A dica fala da tela em que a pessoa está: se ela saiu, a dica sai junto.
    setTip(current => (current === activePanel ? current : undefined))
    if (from === activePanel || from === 'search') return
    if (probe.current?.wasMouse() !== true) return
    const shown = tracker.current?.arrive(activePanel, {
      enabled: isShortcutTipsEnabled(),
      typing: isTypingTarget(document.activeElement),
      modalOpen: document.querySelector('[aria-modal="true"]') !== null,
    })
    if (shown !== undefined) setTip(shown)
  }, [activePanel])

  useEffect(() => {
    if (tip === undefined) return undefined
    const timer = setTimeout(() => { setTip(undefined) }, SHORTCUT_TIP_MS)
    return () => { clearTimeout(timer) }
  }, [tip])

  // Desligou "Dicas de atalho" com a dica à vista: ela some.
  useEffect(() => subscribeShortcutTips(() => { if (!isShortcutTipsEnabled()) setTip(undefined) }), [])

  if (tip === undefined) return null
  const labelKey = shortcutTipLabelKey(tip)
  if (labelKey === undefined) return null
  // As teclas vêm do mesmo texto que a dica do rail usa ("Ctrl K"), para os dois nunca divergirem.
  const keys = t('sidebar.searchShortcut').split(' ').filter(key => key !== '')
  const [before = '', after = ''] = t('tip.shortcut.goto', { keys: KEYS_TOKEN, screen: t(labelKey).toLocaleLowerCase() }).split(KEYS_TOKEN)
  return (
    <ToastRegion label={t('tip.shortcut.region')}>
      <Toast
        tone="neutral"
        title={(
          <span data-shortcut-tip={tip}>
            {before}
            {keys.map((key, index) => (
              <Fragment key={`${key}-${String(index)}`}>
                {index > 0 ? ' ' : null}
                <KeyCap>{key}</KeyCap>
              </Fragment>
            ))}
            {after}
          </span>
        )}
        dismissLabel={t('tip.shortcut.close')}
        onDismiss={() => { setTip(undefined) }}
      />
    </ToastRegion>
  )
}
