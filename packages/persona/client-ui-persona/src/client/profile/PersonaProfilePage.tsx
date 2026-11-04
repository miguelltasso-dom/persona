/** E9 — Persona profile with live state, overview, memory and skills tabs. */
import { useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId, type PersonaPoseState } from '../assets/asset-url.ts'
import { Avatar, BrandIcon, Button, Card, Chip, EmptyState, NOW_POSE, Screen, ScreenHeader, Tabs, UiIcon } from '../primitives/index.ts'
import { MemoryPanel } from '../memory/MemoryPanel.tsx'
import { SkillsPanel } from '../skills/SkillsPanel.tsx'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './ProfileScreen.module.css'
import { ProactivityMetricsPanel } from './ProactivityMetricsPanel.tsx'
import { ActivityGroup, type ActivityItem } from '../primitives/Pooled.tsx'
import { activityGroupLabelsFromDict } from '../governance/activity-group-labels.ts'
import { pt as governanceDict } from '../locale/governance/locales.ts'
import type { MemoryRow } from '../memory/mock-data.ts'
import type { SkillRecord } from '../skills/mock-data.ts'
import type { PersonaLiveState, PersonaProfileSnapshot } from './mock-data.ts'
import { pt as defaultDict } from '../locale/profile/locales.ts'
import { engineLabel } from '../team/engine-label.ts'
import { liveStateToNowKind, PersonaInfoFacts, type PersonaCardInfo } from './PersonaInfoCard.tsx'
import { cardSystemRoles } from './card-system-roles.ts'

export type ProfileSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type ProfileTab = 'overview' | 'memory' | 'skills'

function stateLabelKey(state: PersonaLiveState): string {
  return `state.${state}`
}

/** Live pose for the hero (UX-GUIDE §3: pose follows the real state). */
const STATE_POSE: Readonly<Record<PersonaLiveState, PersonaPoseState>> = {
  idle: 'disponivel',
  working: 'trabalhando',
  reviewing: 'revisando',
  waiting: 'aguardando-aprovacao',
  resting: 'descansando',
  offline: 'offline',
  error: 'erro',
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
  readonly onRemoteRetry?: () => void
  readonly memoryRows?: readonly MemoryRow[]
  readonly skillRecords?: readonly SkillRecord[]
  /** Hero actions (Prism/Lumen wire: open DM, open editor). */
  readonly onMessage?: (() => void) | undefined
  readonly onEdit?: (() => void) | undefined
  /** Card data from the host (PersonaCardInfo); fields left out fall back to the snapshot. */
  readonly card?: Partial<Omit<PersonaCardInfo, 'personaId' | 'name'>> | undefined
  /** What she is doing next (queue), newest first. */
  readonly queue?: readonly ProfileQueueItem[] | undefined
  /** Recent deliveries (done tasks), newest first. */
  readonly deliveries?: readonly ProfileDeliveryItem[] | undefined
  readonly onEditTalk?: (() => void) | undefined
  readonly onEmptyPrimary?: (() => void) | undefined
  /** GES-5 — gestor audit (mock/host); shown when persona is team manager. */
  readonly gestorAuditItems?: readonly ActivityItem[] | undefined
}

export interface ProfileQueueItem {
  readonly id: string
  readonly title: string
  /** "Em andamento", "A fazer"… */
  readonly status?: string | undefined
}

export interface ProfileDeliveryItem {
  readonly id: string
  readonly title: string
  readonly at: string
}

function avatarCharacter(ref: string): string {
  return ref.replace(/-default$/u, '')
}

export function PersonaProfilePage({
  dict = defaultDict,
  snapshot,
  initialState = 'ready',
  onRemoteRetry,
  memoryRows,
  skillRecords,
  onMessage,
  onEdit,
  card,
  queue,
  deliveries,
  onEditTalk,
  onEmptyPrimary,
  gestorAuditItems,
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
      <Screen className={styles.shell} data-persona-surface="profile">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="profile">
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
  if (initialState === 'empty' || snapshot === undefined) {
    return (
      <Screen className={styles.shell} data-persona-surface="profile">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-inbox"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
        />
      </Screen>
    )
  }

  const { persona, liveState, projectNames, recentActivity, proactivity } = snapshot
  const avatarRef = avatarCharacter(persona.avatar.kind === 'gallery' ? persona.avatar.ref : persona.name.trim().toLowerCase())
  const nowKind = card?.nowKind ?? liveStateToNowKind(liveState)
  const heroPose = poseUrl(avatarRef as PersonaCharacterId, card?.nowKind === undefined ? STATE_POSE[liveState] : NOW_POSE[nowKind])
  const info: PersonaCardInfo = {
    personaId: persona.id,
    name: persona.name,
    role: persona.title,
    systemRoles: cardSystemRoles(persona.systemRoles),
    presence: liveState === 'offline' ? 'offline' : 'online',
    projectName: projectNames[0],
    engineLabel: persona.runner.kind === 'cli' ? engineLabel(persona.runner.cli, persona.runner.model) : undefined,
    ...card,
    nowKind,
  }
  const subtitle = [info.handle, persona.title, info.sector].filter((part): part is string => part !== undefined && part.length > 0).join(' · ')

  return (
    <Screen width="reading" className={styles.shell} data-persona-surface="profile">
      <section className={styles.hero} aria-labelledby="persona-profile-name">
        <div className={styles.heroStage} aria-hidden="true">
          {ILLUSTRATIONS['team-banner-light'] !== undefined && <img className={styles.stageLight} src={ILLUSTRATIONS['team-banner-light']} alt="" />}
          {ILLUSTRATIONS['team-banner-dark'] !== undefined && <img className={styles.stageDark} src={ILLUSTRATIONS['team-banner-dark']} alt="" />}
          {heroPose !== undefined
            ? <img key={liveState} className={styles.heroPose} data-state={liveState} src={heroPose} alt="" />
            : <span className={styles.heroAvatar}><Avatar name={persona.name} size={96} shape="person" decorative /></span>}
        </div>
        <div className={styles.heroBody}>
          <p className={styles.heroEyebrow}>{t('title')}</p>
          <h1 id="persona-profile-name" className={styles.heroTitle}>{persona.name}</h1>
          <p className={styles.heroSubtitle}>{subtitle}</p>
          <div className={styles.heroChips}>
            <Chip tone={liveChipTone(liveState)}>{t(stateLabelKey(liveState))}</Chip>
            {persona.systemRoles.map(role => <Chip key={role} tone="brand" icon={<BrandIcon name="equipe" size={14} />}>{t(`card.badge.${role}`)}</Chip>)}
          </div>
          {(onMessage !== undefined || onEdit !== undefined) && (
            <div className={styles.heroActions}>
              {onMessage !== undefined && <Button variant="primary" icon={<BrandIcon name="mensagens-diretas" size={18} />} onClick={onMessage}>{t('action.message')}</Button>}
              {onEdit !== undefined && <Button variant="secondary" icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />} onClick={onEdit}>{t('action.edit')}</Button>}
            </div>
          )}
          <div className={styles.heroFacts}>
            <PersonaInfoFacts info={info} dict={dict} onEditTalk={onEditTalk} />
          </div>
        </div>
      </section>
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
      <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`} className={styles.section}>
        {tab === 'overview' && (
          <section className={styles.section}>
            <div className={styles.pair}>
              <Card padding="m" title={t('section.queue')}>
                {queue !== undefined && queue.length > 0 ? (
                  <ol className={styles.workList}>
                    {queue.map(item => (
                      <li key={item.id} className={styles.workItem}>
                        <span className={styles.workTitle}>{item.title}</span>
                        {item.status !== undefined && <Chip size="s">{item.status}</Chip>}
                      </li>
                    ))}
                  </ol>
                ) : <p className={styles.quiet}>{t('queue.empty')}</p>}
              </Card>
              <Card padding="m" title={t('section.deliveries')}>
                {deliveries !== undefined && deliveries.length > 0 ? (
                  <ul className={styles.workList}>
                    {deliveries.map(item => (
                      <li key={item.id} className={styles.workItem}>
                        <span className={styles.doneMark} aria-hidden="true"><UiIcon name="check" size={14} strokeWidth={2.8} /></span>
                        <span className={styles.workTitle}>{item.title}</span>
                        <span className={styles.faint}>{item.at}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.quiet}>{t('deliveries.empty')}</p>}
              </Card>
            </div>
            {proactivity !== undefined && (
              <ProactivityMetricsPanel dict={dict} metrics={proactivity} />
            )}
            {persona.systemRoles.includes('team_manager') && gestorAuditItems !== undefined && gestorAuditItems.length > 0 && (
              <Card padding="m" title={bindLocale(governanceDict, 'health.gestorAudit')}>
                <p className={styles.quiet}>{bindLocale(governanceDict, 'health.gestorAuditLead')}</p>
                <ActivityGroup
                  persona={{ name: persona.name, avatarSrc: AVATAR_96[avatarRef as keyof typeof AVATAR_96] }}
                  items={gestorAuditItems}
                  labels={activityGroupLabelsFromDict(governanceDict)}
                />
              </Card>
            )}
            <Card padding="m" title={t('field.activity')}>
              {recentActivity.length > 0 ? (
                <ul className={styles.simpleList}>
                  {recentActivity.map(item => (
                    <li key={item.id}>
                      <span className={styles.faint}>{item.at}</span> {item.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  illustration={heroPose ?? ILLUSTRATIONS['empty-inbox']}
                  title={t('activity.emptyTitle')}
                  body={bindLocale(dict, 'activity.emptyBody', { name: persona.name })}
                  action={onMessage !== undefined ? <Button variant="primary" onClick={onMessage}>{t('activity.emptyAction')}</Button> : undefined}
                />
              )}
            </Card>
            {projectNames.length > 1 && (
              <Card padding="m" title={t('field.projects')}>
                <ul className={styles.simpleList}>
                  {projectNames.map(name => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        )}
        {tab === 'memory' && (
          <MemoryPanel
            {...(memoryRows !== undefined ? { rows: memoryRows } : {})}
            initialState={memoryRows !== undefined && memoryRows.length === 0 ? 'empty' : 'ready'}
            {...(onEdit === undefined ? {} : { onEmptyPrimary: onEdit })}
          />
        )}
        {tab === 'skills' && (
          <SkillsPanel
            {...(skillRecords !== undefined ? { skills: skillRecords } : {})}
            initialState={skillRecords !== undefined && skillRecords.length === 0 ? 'empty' : 'ready'}
            {...(onEdit === undefined ? {} : { onEmptyPrimary: onEdit })}
          />
        )}
      </div>
    </Screen>
  )
}
