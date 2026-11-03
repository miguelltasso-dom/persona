import type { ReactNode } from 'react'
import { Avatar, Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Members.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { WorkspaceMember } from './mock-data.ts'
import { pt as defaultDict } from '../locale/members/locales.ts'

export type MembersSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface MembersViewProps {
  readonly dict?: LocaleDict
  readonly members?: readonly WorkspaceMember[]
  readonly initialState?: MembersSurfaceState
}

export function MembersView({ dict = defaultDict, members = [], initialState = 'ready' }: MembersViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)

  const header = (
    <ScreenHeader
      icon="convidar"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      actions={<Button variant="primary" size="s">{t('action.invite')}</Button>}
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
        />
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
                  <p className={styles.memberEmail}>{member.email}</p>
                </div>
              </div>
              <div className={styles.chips}>
                <Chip tone="brand" size="s">{t(`role.${member.role}`)}</Chip>
                <Chip tone="neutral" size="s">{t(`status.${member.status}`)}</Chip>
              </div>
              <Button variant="secondary" size="s">{t('action.revoke')}</Button>
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
    </Screen>
  )
}
