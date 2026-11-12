/**
 * Muse (tickets de leigo, 12/11): what the PRODUCT says in a thread ("Boas-vindas à Persona.") is a centered line of the product — never a person.
 * The host posts it with the author `system`; drawn as a message it showed a letter "S" and an author that does not exist. No avatar, no name,
 * no time: only the sentence, quiet.
 */

import type { ReactNode } from 'react'
import styles from './SystemLine.module.css'

/** @param row - A message of the thread. @returns Whether the product itself wrote it (the host's `system` author). */
export function isProductVoice(row: { readonly authorId: string; readonly authorName: string }): boolean {
  const system = /^system$/iu
  return system.test(row.authorId.trim()) || system.test(row.authorName.trim())
}

export interface SystemLineProps {
  readonly text: string
  readonly rowTag?: 'li' | 'div'
}

/** One centered line of the product. */
export function SystemLine({ text, rowTag = 'li' }: SystemLineProps): ReactNode {
  const Tag = rowTag
  return (
    <Tag className={styles.line} data-system-line="">
      <span>{text}</span>
    </Tag>
  )
}
