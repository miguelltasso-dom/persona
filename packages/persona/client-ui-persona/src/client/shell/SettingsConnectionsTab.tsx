/**
 * Configurações › Conexões (decisão do Keel): o painel de contas (conteúdo do Zinc, em `connections/`) e, embaixo, o cartão
 * "Equipe à distância" (cena 20). Este arquivo só monta os dois; não muda o conteúdo de nenhum deles.
 * A pilha é a rolagem da aba, dentro da moldura SettingsScrollFrame (guilhotina de 12 px só com o corpo rolado).
 */

import type { ReactNode } from 'react'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import { RemoteConnectionsPanel } from '../data/lumen-remote-panels.tsx'
import { RemoteTeamCard } from '../members/RemoteTeamCard.tsx'
import { ConnectedBrowserProfiles } from '../browser/ConnectedBrowserProfiles.tsx'
import { SettingsScrollFrame } from './SettingsScrollFrame.tsx'
import styles from './SettingsConnectionsTab.module.css'

export function SettingsConnectionsTab(props: LumenRemotePanelProps): ReactNode {
  return (
    <SettingsScrollFrame>
      <div className={styles.stack}>
        <RemoteConnectionsPanel {...props} />
        <div className={styles.teamCard}>
          <ConnectedBrowserProfiles {...props} />
        </div>
        <div className={styles.teamCard}>
          <RemoteTeamCard {...props} />
        </div>
      </div>
    </SettingsScrollFrame>
  )
}
