/**
 * Configurações › Ferramentas (item 26): "Ferramentas do seu negócio". A aba de Conexões continua sendo a das contas de IA (nada de aba dentro de aba);
 * esta fica logo depois dela e rola dentro da moldura das abas de Configurações.
 */

import type { ReactNode } from 'react'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import { RemoteToolsPanel } from '../tools/RemoteToolsPanel.tsx'
import { SettingsScrollFrame } from './SettingsScrollFrame.tsx'

export function SettingsToolsTab(props: LumenRemotePanelProps): ReactNode {
  return (
    <SettingsScrollFrame>
      <RemoteToolsPanel {...props} />
    </SettingsScrollFrame>
  )
}
