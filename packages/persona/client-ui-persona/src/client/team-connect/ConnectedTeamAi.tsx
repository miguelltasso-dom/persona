import { useMemo, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { TeamAiBanner } from './TeamAiBanner.tsx'
import { TeamConnectDialog } from './TeamConnectDialog.tsx'
import type { TeamConnectRemoteWire } from './team-connect-wire.ts'
import { useTeamConnect } from './use-team-connect.ts'

export interface ConnectedTeamAiProps extends PropsLocale<'persona.shell'> {
  readonly remote: TeamConnectRemoteWire | undefined
  readonly workspaceId: string | undefined
  readonly projectId: string | undefined
}

/**
 * Item 13: a faixa "N pessoas da equipe estão sem IA" na Visão geral, ligada ao host, e o modal que liga a equipe toda de uma vez. Sem host (ou sem o método) não há faixa:
 * a tela nunca afirma "sem IA" por falta de resposta. O host só conta quem teve o motor CONFIRMADO sem login/instalação; quem ainda está sendo conferido não entra.
 */
export function ConnectedTeamAi({ t, remote, workspaceId, projectId }: ConnectedTeamAiProps): ReactNode {
  const scope = useMemo(() => (workspaceId === undefined || projectId === undefined ? null : { workspaceId, projectId }), [workspaceId, projectId])
  const team = useTeamConnect(remote, scope, { enabled: scope !== null && remote !== undefined })
  const count = team.ai.without.length
  // A faixa fica enquanto há alguém sem IA; durante e logo depois de uma ligação o modal conta a história (a faixa some sozinha quando todas conectam).
  const showBanner = team.settled && count > 0
  if (!showBanner && !team.open) return null
  return (
    <>
      {showBanner && <TeamAiBanner t={t} count={count} onOpen={team.openDialog} />}
      <TeamConnectDialog
        t={t}
        open={team.open}
        ai={team.ai}
        connect={team.connect}
        accountId={team.accountId}
        starting={team.starting}
        refused={team.refused}
        onChooseAccount={team.chooseAccount}
        onStart={() => { void team.start() }}
        onRetryOne={(personaId) => { void team.retryOne(personaId) }}
        onClose={team.closeDialog}
      />
    </>
  )
}
