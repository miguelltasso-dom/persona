import type { TalkAclView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaCardInfo } from './PersonaInfoCard.tsx'

/** Maps host talk ACL into the card facts row (PERSONA-CARD-SPEC). */
export function talkAclViewToCardTalk(acl: TalkAclView): NonNullable<PersonaCardInfo['talk']> {
  return {
    everyone: acl.mode === 'workspace',
    names: acl.principals.map(row => row.name),
  }
}
