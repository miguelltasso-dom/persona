import type { ReactNode } from 'react'
import { Button, Card, Chip } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './SkillsPanel.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { MOCK_SKILLS, type SkillRecord } from './mock-data.ts'
import { pt as defaultDict } from '../locale/skills/locales.ts'

export type SkillsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface SkillsPanelProps {
  readonly dict?: LocaleDict
  readonly skills?: readonly SkillRecord[]
  readonly initialState?: SkillsSurfaceState
}

export function SkillsPanel({ dict = defaultDict, skills = MOCK_SKILLS, initialState = 'ready' }: SkillsPanelProps): ReactNode {
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
    <section aria-labelledby="skills-heading">
      <h2 id="skills-heading" className={styles.sectionTitle}>{t('title')}</h2>
      <p className={styles.sectionSubtitle}>{t('subtitle')}</p>
      <ul className={styles.list}>
        {skills.map(skill => (
          <li key={skill.id}>
            <Card padding="m">
              <div className={styles.headRow}>
                <span className={styles.skillName}>{skill.name}</span>
                <Chip tone="accent" size="s">{t(`status.${skill.status}`)}</Chip>
                <Chip tone="neutral" size="s">{t('field.version', { version: skill.version })}</Chip>
              </div>
              {skill.rating !== undefined && (
                <p className={styles.meta}>{t('field.rating', { rating: skill.rating })}</p>
              )}
              {skill.proposer !== undefined && (
                <p className={styles.meta}>{t('proposal.fromAgent', { name: skill.proposer })}</p>
              )}
              <div className={styles.actions}>
                {skill.status === 'candidate'
                  ? <Button variant="primary" size="s">{t('action.reviewProposal')}</Button>
                  : <Button variant="secondary" size="s">{t('action.rollback')}</Button>}
                {!skill.sharedWithTeam && (
                  <Button variant="secondary" size="s">{t('action.shareTeam')}</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
