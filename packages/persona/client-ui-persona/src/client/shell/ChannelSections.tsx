/**
 * COLHEITA 22 (Muse §22) — the sidebar's channels as ONE kind of thing: the channels with no section first (no header), then each equipe as a
 * collapsible section with its channels inside. The model (`channel-sections.ts`) decides what is open and what shows an unread seal;
 * this file draws and wires the keyboard.
 *
 *  - header (32 px): chevron 16 px (turns −90° when closed), the name (13 px, 800), the 8 px dot of the equipe, up to 3 faces of 16 px, and the
 *    "+" (32 px, "Novo canal em Marketing") only on hover and focus and only for whoever arranges the sidebar;
 *  - closed with something unread: a neutral read-only count on the header (amber only when something waits for the person);
 *  - channel row (32 px): `#`, the name (15 px); unread = bold name + count; active = the cream pill; muted = the soft ink;
 *  - the section opens and closes in height (`grid-template-rows 0fr → 1fr`, the `panel` motion). No continuous animation.
 */

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { subjectColorVar, type SubjectColorIndex } from '../chat/conversation-subjects.ts'
import { UiIcon } from '../primitives/index.ts'
import { rovingVerticalKey } from './rail-roving-focus.ts'
import type { ChannelLayoutUi, ChannelRowUi, ChannelSectionUi } from './channel-sections.ts'
import styles from './ChannelSections.module.css'

type T = PropsLocale<'persona.shell'>['t']

export interface ChannelSectionsProps {
  readonly t: T
  readonly layout: ChannelLayoutUi
  /** The portrait of a persona for the 16 px faces of a header (the same animal the DM draws; never a letter). */
  readonly faceSrc: (personaId: string) => string | undefined
  readonly onToggleSection: (key: string, currentlyOpen: boolean) => void
  readonly onOpenChannel: (channelId: string) => void
  /** "Novo canal em {equipe}": only whoever arranges the sidebar. Without it the "+" does not exist (no dead control). */
  readonly onNewChannel?: ((sectionKey: string) => void) | undefined
}

function unreadLabel(t: T, count: number): string {
  return t(count === 1 ? 'channels.unread.one' : 'channels.unread.other', { count: String(count) })
}

function ChannelRow({ t, row, index, count, onOpen, focusRow }: {
  readonly t: T
  readonly row: ChannelRowUi
  readonly index: number
  readonly count: number
  readonly onOpen: (channelId: string) => void
  readonly focusRow: (index: number) => void
}): ReactNode {
  const unread = row.unread > 0
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        className={styles.row}
        data-active={row.active ? '' : undefined}
        data-unread={unread ? '' : undefined}
        data-muted={row.muted ? '' : undefined}
        data-section-row=""
        aria-current={row.active ? 'page' : undefined}
        onClick={() => { onOpen(row.id) }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { rovingVerticalKey(event, index, count, focusRow) }}
      >
        <span className={styles.hash} aria-hidden="true">#</span>
        <span className={styles.name}>{row.name}</span>
        {unread && <span className={styles.count} aria-hidden="true">{row.unread > 99 ? '99+' : row.unread}</span>}
        {unread && <span className="persona-sr-only">{unreadLabel(t, row.unread)}</span>}
      </button>
    </li>
  )
}

function Section({ t, section, faceSrc, onToggle, onOpenChannel, onNewChannel }: {
  readonly t: T
  readonly section: ChannelSectionUi
  readonly faceSrc: ChannelSectionsProps['faceSrc']
  readonly onToggle: ChannelSectionsProps['onToggleSection']
  readonly onOpenChannel: ChannelSectionsProps['onOpenChannel']
  readonly onNewChannel: ChannelSectionsProps['onNewChannel']
}): ReactNode {
  const bodyId = useId()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // A closed section is inert: no focus and no screen reader reaches its channels. Set on the DOM node (React 18 does not forward a boolean `inert`).
  useEffect(() => { bodyRef.current?.toggleAttribute('inert', !section.open) }, [section.open])
  const focusRow = (index: number): void => {
    document.getElementById(bodyId)?.querySelectorAll<HTMLButtonElement>('[data-section-row]')[index]?.focus()
  }
  // The channels with no section have no header: just the rows.
  if (section.name === null) {
    return (
      <ul className={styles.rows} id={bodyId}>
        {section.rows.map((row, index) => <ChannelRow key={row.id} t={t} row={row} index={index} count={section.rows.length} onOpen={onOpenChannel} focusRow={focusRow} />)}
      </ul>
    )
  }
  const tone = section.toneIndex === 0 ? undefined : subjectColorVar((section.toneIndex - 1) as SubjectColorIndex)
  return (
    <section className={styles.section} data-open={section.open ? '' : undefined} data-section={section.key}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={section.open}
          aria-controls={bodyId}
          onClick={() => { onToggle(section.key, section.open) }}
        >
          <UiIcon name="chevronDown" size={16} strokeWidth={2.4} className={styles.chevron} />
          <span className={styles.title}>{section.name}</span>
          {tone !== undefined && <span className={styles.dot} style={{ background: tone }} aria-hidden="true" />}
          <span className={styles.faces} aria-hidden="true">
            {section.faceIds.map((id) => {
              const src = faceSrc(id)
              return src === undefined ? null : <img key={id} className={styles.face} src={src} alt="" draggable={false} />
            })}
          </span>
          {section.headerBadge > 0 && (
            <>
              <span className={styles.seal} data-needs-you={section.needsYou ? '' : undefined} aria-hidden="true">{section.headerBadge > 99 ? '99+' : section.headerBadge}</span>
              <span className="persona-sr-only">{unreadLabel(t, section.headerBadge)}</span>
            </>
          )}
        </button>
        {onNewChannel !== undefined && (
          <button
            type="button"
            className={styles.add}
            aria-label={t('channels.newIn', { name: section.name })}
            title={t('channels.newIn', { name: section.name })}
            onClick={() => { onNewChannel(section.key) }}
          >
            <UiIcon name="plus" size={16} strokeWidth={2.4} />
          </button>
        )}
      </div>
      <div ref={bodyRef} className={styles.body} id={bodyId} role="group" aria-label={section.name}>
        <ul className={styles.rows}>
          {section.rows.map((row, index) => <ChannelRow key={row.id} t={t} row={row} index={index} count={section.rows.length} onOpen={onOpenChannel} focusRow={focusRow} />)}
        </ul>
      </div>
    </section>
  )
}

/** The channels of the sidebar: no-section first, then one section per equipe. */
export function ChannelSections({ t, layout, faceSrc, onToggleSection, onOpenChannel, onNewChannel }: ChannelSectionsProps): ReactNode {
  return (
    <div className={styles.sections} data-channel-sections="">
      {layout.sections.map(section => (
        <Section key={section.key} t={t} section={section} faceSrc={faceSrc} onToggle={onToggleSection} onOpenChannel={onOpenChannel} onNewChannel={onNewChannel} />
      ))}
    </div>
  )
}
