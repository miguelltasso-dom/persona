/** Persona root child slots (mirrors ui-layout AppFrame children). */
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar': { kind: 'single'; scope: 'root' }
    'main': { kind: 'keyed'; scope: 'root' }
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /** Declared on Persona sidebar for ui-settings-general (configForms). */
    'sidebar.settings': { kind: 'single'; scope: 'root'; owner: { wide: boolean } }
  }
}
