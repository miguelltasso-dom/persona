import type { ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
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
  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  if (initialState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <div className={page.shell} data-persona-surface="members">
      <header>
        <h1 className={page.title}>{t('title')}</h1>
        <p className={page.subtitle}>{t('subtitle')}</p>
      </header>
      <PersonaButton>{t('action.invite')}</PersonaButton>
      <ul className={page.list}>
        {members.map(member => (
          <li key={member.id} className={page.card}>
            <strong>{member.name}</strong>
            <p className={page.meta}>{member.email}</p>
            <span className={page.chip}>{t(`role.${member.role}`)}</span>
            {' '}
            <span className={page.chip}>{t(`status.${member.status}`)}</span>
            <div className={page.actions}>
              <PersonaButton variant="secondary">{t('action.revoke')}</PersonaButton>
            </div>
          </li>
        ))}
      </ul>
      <section aria-labelledby="sync-heading">
        <h2 id="sync-heading" className={page.title}>{t('sync.title')}</h2>
        <ul className={page.list}>
          <li className={page.card}>{t('sync.projects')}</li>
          <li className={page.card}>{t('sync.vault')}</li>
          <li className={page.card}>{t('sync.never')}</li>
        </ul>
      </section>
    </div>
  )
}
