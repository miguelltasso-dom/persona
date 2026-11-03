import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShellState } from './create-shell-store.ts'
import styles from './PersonaAppFrame.module.css'

export interface PersonaAppFrameInjected {
  hooks: { shell: HostObservable<ShellState> }
}

export type PersonaAppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'main' | 'shell.overlay'>
  & InjectFace<PersonaAppFrameInjected>

/** Persona root shell: rail + main + overlay list. */
export function PersonaAppFrame({ renderSlot, useShell }: PersonaAppFrameProps): ReactNode {
  const shell = useShell(state => state)
  return (
    <div className={styles.frame} data-persona-shell="">
      {renderSlot('sidebar', {})}
      <div className={styles.center} data-persona-grain="">
        {renderSlot('main', {}, { entryKey: shell.activePanel })}
      </div>
      <div className={styles.overlayLayer}>
        {renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}
