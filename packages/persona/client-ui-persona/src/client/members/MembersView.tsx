import type { ReactNode } from 'react'
import { Avatar, Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Members.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { WorkspaceMember } from './mock-data.ts'
import { pt as defaultDict } from '../locale/members/locales.ts'
import { useRemoteTeamStatus } from '../remote-team/remote-team-status.ts'

export type MembersSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface MembersViewProps {
  readonly dict?: LocaleDict
  readonly members?: readonly WorkspaceMember[]
  readonly initialState?: MembersSurfaceState
  readonly onRemoteRetry?: () => void
  readonly onEmptyPrimary?: (() => void) | undefined
  readonly onInvite?: (() => void) | undefined
  /**
   * Per-member "Revogar acesso". Only shown when a handler exists: the host revokes by accepted invite (see Equipe remota),
   * so a button with nothing behind it would be a dead control.
   */
  readonly onRevokeMember?: ((memberId: string) => void) | undefined
  /** Seção extra abaixo da lista (E13: Equipe remota). Só aparece com a equipe remota ligada; sem ela, o estado calmo. */
  readonly extra?: ReactNode
}

/**
 * Membros (cena 20; revisão do Carbon, quill-final, item 2): o convite só existe com a equipe remota ligada. Enquanto não estiver,
 * a seção remota mostra o mesmo estado calmo do cartão Equipe à distância ("Ainda não ligada"), sem o alerta de cofre.
 * O dono aparece como "Dono · Neste computador", sem a fileira de chips.
 */
export function MembersView({
  dict = defaultDict,
  members = [],
  initialState = 'ready',
  onRemoteRetry,
  onEmptyPrimary,
  onInvite,
  onRevokeMember,
  extra,
}: MembersViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const remoteStatus = useRemoteTeamStatus()
  const remoteOn = remoteStatus === 'connected' || remoteStatus === 'offline'
  // O painel remoto (extra) fica montado mesmo escondido: é ele que publica o estado da equipe. Sem a equipe ligada, mostra-se o estado calmo.
  const remoteSection: ReactNode = (
    <>
      {!remoteOn && (
        <Card padding="m" as="section" titleAs="h2" title={t('remoteCard.title')}>
          <Chip tone="neutral" size="s">{t('remote.calm.status')}</Chip>
          <p className={styles.calmBody}>{t('remote.calm.body')}</p>
        </Card>
      )}
      <div hidden={!remoteOn}>{extra}</div>
    </>
  )

  const header = (
    <ScreenHeader
      icon="convidar"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      actions={onInvite === undefined || !remoteOn ? undefined : (
        <Button variant="primary" size="m" onClick={() => { onInvite() }}>
          {t('action.invite')}
        </Button>
      )}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="members">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="members">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }
  if (initialState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="members">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-inbox"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
        />
        {remoteSection}
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="members">
      {header}
      <ul className={styles.list}>
        {members.map(member => (
          <li key={member.id}>
            <Card padding="m" className={styles.memberCard}>
              <div className={styles.memberHead}>
                <Avatar name={member.name} size={40} shape="person" />
                <div>
                  <h3 className={styles.memberName}>{member.name}</h3>
                  {member.isSelf === true
                    ? <p className={styles.memberEmail}>{t('owner.subtitle')}</p>
                    : member.email.endsWith('@workspace.local') ? null : <p className={styles.memberEmail}>{member.email}</p>}
                </div>
              </div>
              {member.isSelf !== true && (
                <div className={styles.chips}>
                  <Chip tone="brand" size="s">{t(`role.${member.role}`)}</Chip>
                  <Chip tone="neutral" size="s">{t(`status.${member.status}`)}</Chip>
                </div>
              )}
              {member.isSelf !== true && onRevokeMember !== undefined && (
                <Button variant="secondary" size="s" onClick={() => { onRevokeMember(member.id) }}>{t('action.revoke')}</Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Card padding="m" as="section" title={t('sync.title')}>
        <ul className={styles.syncList}>
          <li>{t('sync.projects')}</li>
          <li>{t('sync.vault')}</li>
          <li>{t('sync.never')}</li>
        </ul>
      </Card>
      {remoteSection}
    </Screen>
  )
}
