import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId, ShellState } from './create-shell-store.ts'
import { PlaceTabsBar } from './PlaceTabsBar.tsx'
import { isPlacesNavEnabled } from './nav-flag.ts'
import { installComposerFocusRestore } from '../chat/composer-focus.ts'
import { ErrorState, PanelBoundary } from '../primitives/index.ts'
import styles from './PersonaAppFrame.module.css'

export interface PersonaAppFrameInjected {
  hooks: { shell: HostObservable<ShellState> }
  /** A-1: as abas do lugar trocam de tela sem mudar a rota (o mesmo `MainPanelId`). */
  selectPanel: (panel: MainPanelId) => void
}

export type PersonaAppFrameProps =
  & PropsRuntime<'root'>
  & PropsLocale<'persona.shell'>
  & PropsRenderSlots<'sidebar' | 'main' | 'shell.overlay'>
  & InjectFace<PersonaAppFrameInjected>

/** A slot entry that crashed (caught by the slot runtime) or rendered nothing leaves the panel empty. */
function isBlank(node: HTMLElement): boolean {
  if (node.querySelector('img, svg, canvas, input, textarea, button') !== null) return false
  return node.textContent.trim().length === 0
}

/**
 * "Never a blank panel" (Keel/UX-GUIDE): if the main panel is still empty shortly after it mounts, show an honest
 * error state with "Tentar de novo" instead of bare paper. Clears itself as soon as content appears.
 */
function useBlankPanelGuard(panel: string): { ref: RefObject<HTMLElement>; blank: boolean; retry: () => void; attempt: number } {
  const ref = useRef<HTMLElement>(null)
  const [blank, setBlank] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setBlank(false)
    const node = ref.current
    if (node === null) return undefined
    const timer = setTimeout(() => {
      if (isBlank(node)) {
        console.error(`[persona] painel "${panel}" ficou em branco (sem conteúdo após montar)`)
        setBlank(true)
      }
    }, 2000)
    const observer = new MutationObserver(() => { if (!isBlank(node)) setBlank(false) })
    observer.observe(node, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [panel, attempt])
  return { ref, blank, retry: () => { setAttempt(value => value + 1) }, attempt }
}

/** Persona root shell: rail + main + overlay list. */
export function PersonaAppFrame({ renderSlot, useShell, selectPanel, t }: PersonaAppFrameProps): ReactNode {
  const shell = useShell(state => state)
  const guard = useBlankPanelGuard(shell.activePanel)
  useEffect(() => installComposerFocusRestore(), [])
  return (
    <div className={styles.frame} data-persona-shell="">
      <div className={styles.dragStrip} aria-hidden="true" />
      {renderSlot('sidebar', {})}
      <div className={styles.center} data-persona-grain="">
        {/* D-077: a barra de abas do lugar só existe com a navegação em 6 lugares ligada (flag, desligada por padrão). */}
        {isPlacesNavEnabled() && <PlaceTabsBar t={t} activePanel={shell.activePanel} onSelect={selectPanel} />}
        {/* <main>: o landmark que faltava em TODA tela (axe landmark-one-main / region, Gauge F5). */}
        <main className={styles.main} ref={guard.ref} key={`${shell.activePanel}:${guard.attempt}`} data-persona-main={shell.activePanel} data-persona-area="main">
          <PanelBoundary panel={shell.activePanel}>
            {renderSlot('main', {}, { entryKey: shell.activePanel })}
          </PanelBoundary>
        </main>
        {guard.blank && (
          <div className={styles.blankFallback}>
            <ErrorState
              title="Esta tela não carregou"
              body="Algo travou ao montar esta tela. Seus dados estão salvos — tente de novo."
              retryLabel="Tentar de novo"
              onRetry={guard.retry}
            />
          </div>
        )}
      </div>
      <div className={styles.overlayLayer}>
        {renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}
