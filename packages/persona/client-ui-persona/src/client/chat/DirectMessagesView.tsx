import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Avatar, BrandIcon, Button, Chip, EmptyState, Skeleton, UiIcon, type ChipTone } from '../primitives/index.ts'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import { ChannelComposer } from './ChannelComposer.tsx'
import { MessageList } from './GeneralChannelView.tsx'
import styles from './DirectMessagesView.module.css'

/** One DM row as the presentation needs it (Prism maps host data). */
export interface DmRowUi {
  readonly id: string
  readonly peerId: string
  readonly peerName: string
  /** AVATAR_96 key when the peer is a persona with gallery art. */
  readonly characterId?: string | undefined
  readonly role?: string | undefined
  readonly stateLabel?: string | undefined
  readonly stateTone?: ChipTone | undefined
  readonly unread?: number | undefined
  readonly lastLine?: string | undefined
  readonly timeLabel?: string | undefined
}

export interface DirectMessagesViewProps {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly loading: boolean
  readonly dms: readonly DmRowUi[]
  readonly selectedId: string | null
  readonly messages: readonly ChannelMessageUi[]
  readonly onSelect: (dmId: string) => void
  readonly onSend: (body: string) => void
  readonly onNewConversation?: (() => void) | undefined
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

function portraitFor(row: DmRowUi): string | undefined {
  return PORTRAITS[row.characterId ?? row.peerName.trim().toLowerCase()]
}

/** Mensagens diretas: conversation list + thread with persona header, shared stream and composer. */
export function DirectMessagesView({
  t, shellT, loading, dms, selectedId, messages, onSelect, onSend, onNewConversation,
}: DirectMessagesViewProps): ReactNode {
  const selected = dms.find(row => row.id === selectedId) ?? null

  if (!loading && dms.length === 0) {
    return (
      <div className={styles.emptyWrap} data-persona-root="">
        <EmptyState
          illustration={ILLUSTRATIONS['empty-dm']}
          title={t('dm.emptyTitle')}
          body={t('dm.emptyBody')}
          action={onNewConversation !== undefined ? (
            <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={onNewConversation}>
              {t('dm.newConversation')}
            </Button>
          ) : undefined}
        />
      </div>
    )
  }

  return (
    <div className={styles.layout} data-persona-root="">
      <aside className={styles.listPane} aria-labelledby="persona-dm-title">
        <header className={styles.listHeader}>
          <span className={styles.badge} aria-hidden="true"><BrandIcon name="mensagens-diretas" size={20} /></span>
          <div className={styles.listTitles}>
            <h1 id="persona-dm-title" className={styles.title}>{shellT('sidebar.directMessages')}</h1>
            <p className={styles.subtitle}>{t('dm.subtitle')}</p>
          </div>
        </header>
        {loading ? (
          <div className={styles.skeletons} aria-hidden="true">
            {[0, 1, 2, 3].map(key => (
              <div key={key} className={styles.skeletonRow}>
                <Skeleton shape="circle" width={40} height={40} />
                <div className={styles.skeletonText}>
                  <Skeleton width="60%" />
                  <Skeleton width="85%" height={12} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className={styles.dmList} aria-label={t('dm.listTitle')}>
            {dms.map(row => (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.dmItem}
                  aria-current={row.id === selectedId ? 'true' : undefined}
                  onClick={() => { onSelect(row.id) }}
                >
                  <Avatar name={row.peerName} src={portraitFor(row)} shape="person" size={40} decorative />
                  <span className={styles.dmText}>
                    <span className={styles.dmName}>{row.peerName}</span>
                    <span className={styles.dmLine}>{row.lastLine ?? row.role ?? ''}</span>
                  </span>
                  <span className={styles.dmMeta}>
                    {row.timeLabel !== undefined && <time className={styles.dmTime}>{row.timeLabel}</time>}
                    {row.unread !== undefined && row.unread > 0 && <span className={styles.unread}>{row.unread}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className={styles.threadPane} aria-label={selected?.peerName ?? t('dm.listTitle')}>
        {selected === null ? (
          <div className={styles.pick}>
            <EmptyState compact illustration={ILLUSTRATIONS['empty-dm']} title={t('dm.pickTitle')} body={t('dm.pickBody')} />
          </div>
        ) : (
          <>
            <header className={styles.threadHeader}>
              <Avatar name={selected.peerName} src={portraitFor(selected)} shape="portrait" size={48} decorative />
              <div className={styles.threadTitles}>
                <h2 className={styles.threadTitle}>{selected.peerName}</h2>
                {selected.role !== undefined && <p className={styles.threadRole}>{selected.role}</p>}
              </div>
              {selected.stateLabel !== undefined && <Chip tone={selected.stateTone ?? 'neutral'}>{selected.stateLabel}</Chip>}
            </header>
            <div className={styles.thread} role="log" aria-live="polite">
              {messages.length === 0 ? (
                <EmptyState compact illustration={portraitFor(selected)} title={t('dm.threadEmpty')} />
              ) : (
                <MessageList t={t} messages={messages} />
              )}
            </div>
            <div className={styles.composer}>
              <ChannelComposer t={t} members={[]} onSend={onSend} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
