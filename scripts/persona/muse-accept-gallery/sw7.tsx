// Muse: SW-7 acceptance scene ("Num rascunho"): the REAL TeamChannelStrip and PersonaInfoCard with a persona working in a draft
// (draftFiles from the host's PersonaNowView). The live state needs a worker writing files, so the shell can't show it without a
// real turn; this renders the real components with the state injected. Not shipped.
import type { ReactNode } from 'react'
import { TeamChannelStrip } from '../../../packages/persona/client-ui-persona/src/client/team/TeamChannelStrip.tsx'
import { PersonaInfoCard } from '../../../packages/persona/client-ui-persona/src/client/profile/PersonaInfoCard.tsx'
import { pt as shellPt } from '../../../packages/persona/client-ui-persona/src/client/locale/shell/locales.ts'
import type { ChannelPersonaMember } from '../../../packages/persona/client-ui-persona/src/client/team/persona-work-state.ts'

type Dict = Readonly<Record<string, string>>
const bind = (dict: Dict) => (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  (dict[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))
const shellT = bind(shellPt as Dict) as never

const MEMBERS: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working', draftFiles: 3 },
  { id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working' },
  { id: 'sol', name: 'Sol', role: 'Relacionamento', state: 'waiting' },
]

export function Sw7Draft(): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 24, padding: 24, background: 'var(--persona-paper)', minHeight: '100vh', alignContent: 'start' }}>
      <TeamChannelStrip t={shellT} members={MEMBERS} />
      <div style={{ maxWidth: 380 }}>
        <PersonaInfoCard
          info={{
            personaId: 'nina',
            name: 'Nina',
            handle: '@nina',
            role: 'Pesquisa',
            characterId: 'nina',
            systemRoles: [],
            nowKind: 'working',
            nowText: 'Atualizando o cardápio de novembro',
            draftFiles: 3,
            presence: 'online',
            ownerName: 'Miguel',
            engineLabel: 'Plano do Claude · Sonnet',
          } as never}
          onOpenProfile={() => undefined}
        />
      </div>
    </div>
  )
}
