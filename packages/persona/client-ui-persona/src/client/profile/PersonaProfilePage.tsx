/** E9 — Persona profile with live state, overview, memory and skills tabs. */
import { useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Avatar, Card, Chip, Screen, ScreenHeader, Tabs } from '../primitives/index.ts'
import { MemoryPanel } from '../memory/MemoryPanel.tsx'
import { SkillsPanel } from '../skills/SkillsPanel.tsx'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './ProfileScreen.module.css'
import { ProactivityMetricsPanel } from './ProactivityMetricsPanel.tsx'
import type { PersonaLiveState, PersonaProfileSnapshot } from './mock-data.ts'
import { pt as defaultDict } from '../locale/profile/locales.ts'

export type ProfileSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type ProfileTab = 'overview' | 'memory' | 'skills'

function stateLabelKey(state: PersonaLiveState): string {
  return `state.${state}`
}

function functionLabel(dict: LocaleDict, role: 'coordination' | 'watchdog'): string {
  return bindLocale(dict, role === 'coordination' ? 'function.coordination' : 'function.watchdog')
}

function liveChipTone(state: PersonaLiveState): 'success' | 'accent' | 'danger' | 'neutral' {
  if (state === 'working') return 'success'
  if (state === 'waiting') return 'accent'
  if (state === 'error') return 'danger'
  return 'neutral'
}

export interface PersonaProfilePageProps {
  readonly dict?: LocaleDict
  readonly snapshot?: PersonaProfileSnapshot
  readonly initialState?: ProfileSurfaceState
}

export function PersonaProfilePage({
  dict = defaultDict,
  snapshot,
  initialState = 'ready',
}: PersonaProfilePageProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [tab, setTab] = useState<ProfileTab>('overview')

  const header = (
    <ScreenHeader
      icon="equipe"
      eyebrow={t('header.eyebrow')}
      title={snapshot?.persona.name ?? t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen width="reading" className={styles.shell} data-persona-surface="profile">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen width="reading" className={styles.shell} data-persona-surface="profile">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => {}} />
      </Screen>
    )
  }
  if (initialState === 'empty' || snapshot === undefined) {
    return (
      <Screen width="reading" className={styles.shell} data-persona-surface="profile">
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

  const { persona, liveState, projectNames, recentActivity, proactivity } = snapshot

  return (
    <Screen width="reading" className={styles.shell} data-persona-surface="profile">
      <Card padding="l" className={styles.heroCard}>
        <Avatar name={persona.name} size={96} shape="person" />
        <div>
          <h1 className={styles.heroTitle}>{persona.name}</h1>
          <p className={styles.heroSubtitle}>{persona.title}</p>
          <Chip tone={liveChipTone(liveState)} size="s">{t(stateLabelKey(liveState))}</Chip>
          {persona.systemRoles.length > 0 && (
            <p className={styles.heroMeta}>
              {t('field.functions')}: {persona.systemRoles.map(r => functionLabel(dict, r)).join(', ')}
            </p>
          )}
        </div>
      </Card>
      <Tabs
        label={t('title')}
        idPrefix="profile"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview' as const, label: t('tab.overview') },
          { id: 'memory' as const, label: t('tab.memory') },
          { id: 'skills' as const, label: t('tab.skills') },
        ]}
      />
      {tab === 'overview' && (
        <section className={styles.section}>
          {proactivity !== undefined && (
            <ProactivityMetricsPanel dict={dict} metrics={proactivity} />
          )}
          <Card padding="m" title={t('field.projects')}>
            <ul className={styles.simpleList}>
              {projectNames.map(name => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </Card>
          <Card padding="m" title={t('field.activity')}>
            <ul className={styles.simpleList}>
              {recentActivity.map(item => (
                <li key={item.id}>
                  <span className={styles.faint}>{item.at}</span> {item.summary}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {tab === 'memory' && <MemoryPanel />}
      {tab === 'skills' && <SkillsPanel />}
    </Screen>
  )
}
