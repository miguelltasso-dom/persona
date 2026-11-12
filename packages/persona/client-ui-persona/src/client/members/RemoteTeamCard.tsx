/**
 * Cartão "Equipe à distância" em Conexões (cena 20 da Muse; decisão do Keel; revisão do Carbon, item 4): UM cartão só, em estado
 * calmo enquanto a equipe remota não está ligada. O próprio painel de equipe remota (ConnectedRemoteTeamPanel) é o cartão: não há
 * cartão de fora nem título repetido. A aba Membros só aparece com a flag remoteTeamTab.
 */

import type { ReactNode } from 'react'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import { useRemoteProjectScope } from '../data/use-remote-project-scope.ts'
import { ConnectedRemoteTeamPanel } from '../remote-team/ConnectedRemoteTeamPanel.tsx'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as membersDict } from '../locale/members/locales.ts'

export function RemoteTeamCard({ persona, useTenant, useShell, openHelp }: LumenRemotePanelProps): ReactNode {
  const { scope } = useRemoteProjectScope(useTenant, useShell)
  return (
    <ConnectedRemoteTeamPanel
      t={(key, params) => bindLocale(membersDict, key, params)}
      remote={persona as never}
      title={bindLocale(membersDict, 'remoteCard.title')}
      calm
      scope={scope === null ? null : { workspaceId: scope.workspaceId, projectId: scope.projectId }}
      onOpenHelp={openHelp === undefined ? undefined : () => { openHelp('solucao-de-problemas') }}
    />
  )
}
