/** The left pane of the Aprovações inbox: a listbox of rows in three groups (REVIEW-APPROVALS-REDESIGN §2). */

import type { ReactNode } from 'react'
import { Avatar, Chip, formatWhen } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Inbox.module.css'
import { personaPortraitSrc } from './approvals-ui-helpers.ts'
import type { InboxGroup, InboxRow } from './inbox-model.ts'

export interface InboxListProps {
  readonly dict: LocaleDict
  readonly groups: readonly InboxGroup[]
  readonly selectedId: string | undefined
  readonly onSelect: (id: string) => void
  /** Lets the screen move focus to a row (J/K, and after a decision). */
  readonly registerRow: (id: string, node: HTMLElement | null) => void
}

/** The face on a row is who asks (the proposer), for every kind of card. */
function rowFace(row: InboxRow): string | undefined {
  return personaPortraitSrc(row.proposerPersonaId, row.proposerName)
    ?? personaPortraitSrc(row.proposerCharacterId, row.proposerName)
    ?? personaPortraitSrc(undefined, row.proposerName)
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
        const label = `${group.title}, ${group.rows.length}`
        return (
          <div key={group.id} role="group" aria-label={label} className={styles.group} data-inbox-group={group.id}>
            <p className={styles.groupTitle} aria-hidden="true">
              <span>{group.title}</span>
              <span className={styles.groupCount}>{group.rows.length}</span>
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
                    <Avatar
                      name={row.proposerName.length > 0 ? row.proposerName : row.listTitle}
                      size={32}
                      shape="portrait"
                      decorative
                      {...(face === undefined ? {} : { src: face })}
                    />
                  </span>
                  <span className={styles.rowTitle}>{row.listTitle}</span>
                  {meta.length > 0 && <span className={styles.rowMeta}>{meta}</span>}
                  <span className={styles.rowChip}>
                    <Chip tone="accent" size="s">{t(`type.${row.kind}`)}</Chip>
                    {row.example === true && <> <Chip tone="neutral" size="s">{t('inbox.example')}</Chip></>}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
