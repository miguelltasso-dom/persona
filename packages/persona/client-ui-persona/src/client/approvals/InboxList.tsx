/** The left pane of the Aprovações inbox: a listbox of rows in three groups (REVIEW-APPROVALS-REDESIGN §2). */

import type { ReactNode } from 'react'
import { Chip, formatWhen } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Inbox.module.css'
import { InboxActor } from './InboxActor.tsx'
import { resolvePersonaFace } from './approvals-ui-helpers.ts'
import { isOpen, type InboxGroup, type InboxRow } from './inbox-model.ts'

export interface InboxListProps {
  readonly dict: LocaleDict
  readonly groups: readonly InboxGroup[]
  readonly selectedId: string | undefined
  readonly onSelect: (id: string) => void
  /** Lets the screen move focus to a row (J/K, and after a decision). */
  readonly registerRow: (id: string, node: HTMLElement | null) => void
}

/** The face on a row is who asks (the proposer), for every kind of card. A persona is never a letter (D-069): a persona with no known animal gets the stable gallery one. */
function rowFace(row: InboxRow): string | undefined {
  return resolvePersonaFace({ id: row.proposerPersonaId, characterId: row.proposerCharacterId, name: row.proposerName, avatarSrc: row.proposerAvatarSrc })
}

function rowClass(row: InboxRow): string {
  if (row.state === 'accepted') return `${styles.row} ${styles.rowLeaving}`
  if (row.state === 'declined') return `${styles.row} ${styles.rowLeavingDeclined}`
  return styles.row ?? ''
}

export function InboxList({ dict, groups, selectedId, onSelect, registerRow }: InboxListProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return (
    // Keep the "reactive" marker the screen has always had: it is how the host-driven cycle (and its tests) finds the cards.
    <div className={styles.list} role="listbox" aria-label={t('inbox.listLabel')} data-persona-approvals="reactive">
      {groups.map((group) => {
        // Cobalt/Keel 07/11: the count is the OPEN rows that are REAL (the "Exemplo" samples never count), so it matches the badge on the rail.
        const openCount = group.rows.filter(row => row.example !== true && isOpen(row.state)).length
        const label = `${group.title}, ${openCount}`
        return (
          <div key={group.id} role="group" aria-label={label} className={styles.group} data-inbox-group={group.id}>
            <p className={styles.groupTitle} aria-hidden="true">
              <span>{group.title}</span>
              <span className={styles.groupCount}>{openCount}</span>
            </p>
            {group.rows.map((row) => {
              const selected = row.id === selectedId
              const face = rowFace(row)
              const when = row.at === undefined || row.at.length === 0 ? '' : formatWhen(row.at)
              const meta = [row.proposerName, when].filter(part => part.length > 0).join(' · ')
              return (
                <div
                  key={row.id}
                  ref={(node) => { registerRow(row.id, node) }}
                  role="option"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  className={rowClass(row)}
                  data-decision-id={row.id}
                  data-decision-state={row.state}
                  onClick={() => { onSelect(row.id) }}
                >
                  <span className={styles.rowFace} aria-hidden="true">
                    <InboxActor row={row} src={face} size={32} name={row.proposerName.length > 0 ? row.proposerName : row.listTitle} />
                  </span>
                  {/* Muse 07/11: the title takes the whole line (up to 2 lines, the full name in title and in the accessible name); the chips go UNDER it on one line ("+n" when they do not fit). */}
                  <span className={styles.rowTitle} title={row.listTitle}>{row.listTitle}</span>
                  <span className={styles.rowChips}>
                    <Chip tone="accent" size="s">{t(`type.${row.kind}`)}</Chip>
                    {row.example === true && <span className={styles.chipExtra}><Chip tone="neutral" size="s">{t('inbox.example')}</Chip></span>}
                    {row.example === true && <span className={styles.chipMore} title={t('inbox.example')}><Chip tone="neutral" size="s">+1</Chip></span>}
                  </span>
                  {meta.length > 0 && <span className={styles.rowMeta}>{meta}</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
