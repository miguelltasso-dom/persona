/** Persona root child slots (mirrors ui-layout AppFrame children). */
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar': { kind: 'single'; scope: 'root' }
    'main': { kind: 'keyed'; scope: 'root' }
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /** Declared on Persona sidebar for ui-settings-general (configForms). */
    'sidebar.settings': { kind: 'single'; scope: 'root'; owner: { wide: boolean } }
    /**
     * "Configurações" do rodapé (SettingsLauncher). Mesmo formato de `SettingsLauncherOwnerProps` do ui-settings, que
     * declara a mesma entrada: as duas precisam ser idênticas para o TypeScript juntar as declarações.
     */
    'settings.launcher': {
      kind: 'single'
      scope: 'root'
      owner: {
        wide: boolean
        settingsOpen: boolean
        settingsShortcut?: { readonly keys: readonly string[]; readonly aria?: string | undefined }
        openSettings: () => void
        openOnboarding: (id: string) => void
      }
    }
  }
}
