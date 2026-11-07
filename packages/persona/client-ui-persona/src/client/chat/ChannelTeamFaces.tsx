/** CV-2 (CONVERSAS-SPEC §2): até 5 rostos empilhados da equipe no cabeçalho do canal (+N quando há mais). */

import type { ReactNode } from 'react'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar } from '../primitives/index.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import styles from './ChannelTeamFaces.module.css'

const MAX_FACES = 5
const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

export interface ChannelTeamFacesProps {
  readonly members: readonly ChannelPersonaMember[]
  /** Nome acessível do grupo ("Quem está no canal"). */
  readonly label: string
}

export function ChannelTeamFaces({ members, label }: ChannelTeamFacesProps): ReactNode {
  if (members.length === 0) return null
  const shown = members.slice(0, MAX_FACES)
  const extra = members.length - shown.length
  return (
    <ul className={styles.faces} aria-label={label}>
      {shown.map(member => (
        <li key={member.id} className={styles.face}>
          <Avatar name={member.name} src={PORTRAITS[member.id]} shape="portrait" size={32} />
        </li>
      ))}
      {extra > 0 && <li className={styles.more} aria-label={`+${String(extra)}`}>+{extra}</li>}
    </ul>
  )
}
