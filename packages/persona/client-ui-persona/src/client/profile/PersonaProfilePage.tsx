/** E9 — Persona profile with live state, overview, memory and skills tabs. */
import { useState, type ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { MemoryPanel } from '../memory/MemoryPanel.tsx'
import { SkillsPanel } from '../skills/SkillsPanel.tsx'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import page from './LumenPage.module.css'
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
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [tab, setTab] = useState<ProfileTab>('overview')

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
  if (initialState === 'error') {
    return <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => {}} />
  }
  if (initialState === 'empty' || snapshot === undefined) {
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

  const { persona, liveState, projectNames, recentActivity, proactivity } = snapshot

  return (
    <div className={page.shell} ref={motion.ref} style={motion.style} data-persona-surface="profile">
      <header className={page.hero}>
        <div className={page.pose} aria-hidden="true">{persona.name.slice(0, 1)}</div>
        <div>
          <h1 className={page.title}>{persona.name}</h1>
          <p className={page.subtitle}>
            {t('field.role')}: {persona.title}
            {' · '}
            {t(stateLabelKey(liveState))}
          </p>
          {persona.systemRoles.length > 0 && (
            <p className={page.meta}>
              {t('field.functions')}: {persona.systemRoles.map(r => functionLabel(dict, r)).join(', ')}
            </p>
          )}
        </div>
      </header>
      <div className={page.tabs} role="tablist" aria-label={t('title')}>
        {(['overview', 'memory', 'skills'] as const).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${page.tab}${tab === id ? ` ${page.tabActive}` : ''}`}
            onClick={() => { setTab(id) }}
          >
            {t(`tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <section>
          {proactivity !== undefined && (
            <ProactivityMetricsPanel dict={dict} metrics={proactivity} />
          )}
          <h2 className={page.title}>{t('field.projects')}</h2>
          <ul className={page.list}>
            {projectNames.map(name => (
              <li key={name} className={page.card}>{name}</li>
            ))}
          </ul>
          <h2 className={page.title}>{t('field.activity')}</h2>
          <ul className={page.list}>
            {recentActivity.map(item => (
              <li key={item.id} className={page.card}>
                <span className={page.meta}>{item.at}</span> {item.summary}
              </li>
            ))}
          </ul>
        </section>
      )}
      {tab === 'memory' && <MemoryPanel />}
      {tab === 'skills' && <SkillsPanel />}
    </div>
  )
}
