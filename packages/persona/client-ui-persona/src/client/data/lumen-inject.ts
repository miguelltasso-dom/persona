import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { MainPanelId, ShellState } from '../shell/create-shell-store.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'

export type PersonaRemoteClient = ClientRemote['persona']

export interface LumenRemoteInjected {
  readonly persona: PersonaRemoteClient
  readonly hooks: {
    readonly tenant: HostObservable<PersonaTenantSnapshot>
    readonly shell: HostObservable<ShellState>
  }
  readonly sendToPersona?: ((personaId: string, text: string) => void) | undefined
  readonly selectMainPanel?: ((panel: MainPanelId) => void) | undefined
}

/** Slot panel: `useTenant` comes from `hooks.tenant`. */
export type LumenRemotePanelProps = InjectFace<LumenRemoteInjected>
