/**
 * The face of who asks, for a row of the inbox (list and detail): the persona's portrait when we have it; a system actor with no
 * persona ("Equipe") gets the team icon on a calm disc instead of a letter (Muse 22:25, same idea as the librarian).
 */
import type { ReactNode } from 'react'
import { Avatar, BrandIcon } from '../primitives/index.ts'
import type { InboxRow } from './inbox-model.ts'

export interface InboxActorProps {
  readonly row: InboxRow
  /** The portrait, when the persona is known. */
  readonly src: string | undefined
  readonly size: 24 | 32 | 56
  /** The name the avatar falls back to (initials) when there is no portrait and the actor IS a persona. */
  readonly name: string
}

export function InboxActor({ row, src, size, name }: InboxActorProps): ReactNode {
  const systemActor = src === undefined && (row.proposerPersonaId === undefined || row.proposerPersonaId === '')
  if (systemActor) {
    return <Avatar name={name} size={size} shape="portrait" decorative icon={<BrandIcon name="equipe" size={Math.round(size * 0.55)} />} />
  }
  return <Avatar name={name} size={size} shape="portrait" decorative {...(src === undefined ? {} : { src })} />
}
