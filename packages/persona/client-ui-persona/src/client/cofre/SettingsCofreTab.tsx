/**
 * Configurações › Cofre (Muse 12/11): a aba ao lado de Conexões. Só monta a tela dentro da moldura de rolagem das Configurações.
 */

import type { ReactNode } from 'react'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import type { LocalePanelProps } from '../locale/panel-dicts.ts'
import { SettingsScrollFrame } from '../shell/SettingsScrollFrame.tsx'
import { ConnectedCofre } from './ConnectedCofre.tsx'

export function SettingsCofreTab(props: LumenRemotePanelProps & LocalePanelProps): ReactNode {
  return (
    <SettingsScrollFrame>
      <ConnectedCofre {...props} />
    </SettingsScrollFrame>
  )
}
