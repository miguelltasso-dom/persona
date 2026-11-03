import type { ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { MOCK_SKILLS } from './mock-data.ts'
import { pt as defaultDict } from '../locale/skills/locales.ts'

export type SkillsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface SkillsPanelProps {
  readonly dict?: LocaleDict
  readonly initialState?: SkillsSurfaceState
}

export function SkillsPanel({ dict = defaultDict, initialState = 'ready' }: SkillsPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  if (initialState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-inbox"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <section>
      <h2 className={page.title}>{t('title')}</h2>
      <p className={page.subtitle}>{t('subtitle')}</p>
      <ul className={page.list}>
        {MOCK_SKILLS.map(skill => (
          <li key={skill.id} className={page.card}>
            <strong>{skill.name}</strong>
            {' '}
            <span className={page.chip}>{t(`status.${skill.status}`)}</span>
            <span className={page.chip}>{t('field.version', { version: skill.version })}</span>
            {skill.rating !== undefined && (
              <p className={page.meta}>{t('field.rating', { rating: skill.rating })}</p>
            )}
            {skill.proposer !== undefined && (
              <p className={page.meta}>{t('proposal.fromAgent', { name: skill.proposer })}</p>
            )}
            <div className={page.actions}>
              {skill.status === 'candidate'
                ? <PersonaButton>{t('action.reviewProposal')}</PersonaButton>
                : <PersonaButton variant="secondary">{t('action.rollback')}</PersonaButton>}
              {!skill.sharedWithTeam && (
                <PersonaButton variant="secondary">{t('action.shareTeam')}</PersonaButton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
