import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { BrandIcon, Button, Card, Chip, EmptyState, ErrorState, Screen, ScreenHeader, Skeleton, UiIcon } from '../primitives/index.ts'
import styles from './ProjectsView.module.css'

export interface ProjectCardUi {
  readonly id: string
  readonly name: string
  readonly kind: string
}

export interface ProjectsViewProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  readonly loading: boolean
  readonly error: string | null
  readonly projects: readonly ProjectCardUi[]
  readonly onOpen?: ((projectId: string) => void) | undefined
  readonly onCreate?: (() => void) | undefined
}

/** Projetos — grid of sticker cards (SCREEN-SPECS: Prism/Projetos). */
export function ProjectsView({ t, loading, error, projects, onOpen, onCreate }: ProjectsViewProps): ReactNode {
  const create = onCreate !== undefined
    ? <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={onCreate}>{t('projects.new')}</Button>
    : undefined
  return (
    <Screen>
      <ScreenHeader
        icon="projetos"
        eyebrow={t('projects.eyebrow')}
        title={t('sidebar.projects')}
        subtitle={t('projects.subtitle')}
        actions={projects.length > 0 ? create : undefined}
      />
      {error !== null ? (
        <ErrorState title={t('overview.hostOffline')} detail={error} />
      ) : loading ? (
        <ul className={styles.grid} aria-hidden="true">
          {[0, 1, 2].map(key => <li key={key}><Skeleton shape="block" height={148} /></li>)}
        </ul>
      ) : projects.length === 0 ? (
        <EmptyState illustration={ILLUSTRATIONS['empty-kanban']} title={t('projects.emptyTitle')} body={t('projects.emptyBody')} action={create} />
      ) : (
        <ul className={styles.grid}>
          {projects.map(project => (
            <Card key={project.id} as="li" interactive={onOpen !== undefined} className={styles.card}>
              <span className={styles.icon} aria-hidden="true"><BrandIcon name="projetos" size={22} /></span>
              <h2 className={styles.name}>
                {onOpen !== undefined
                  ? <button type="button" className={styles.cardLink} onClick={() => { onOpen(project.id) }}>{project.name}</button>
                  : project.name}
              </h2>
              <div className={styles.meta}>
                <Chip size="s" tone="neutral">{project.kind === 'personal' ? t('projects.kind.personal') : project.kind}</Chip>
                {onOpen !== undefined && (
                  <span className={styles.open} aria-hidden="true">
                    {t('projects.open')}
                    <UiIcon name="arrowRight" size={16} strokeWidth={2.2} />
                  </span>
                )}
              </div>
            </Card>
          ))}
          {onCreate !== undefined && (
            <li className={styles.newTile}>
              <button type="button" className={styles.newButton} onClick={onCreate}>
                <span className={styles.newIcon} aria-hidden="true"><UiIcon name="plus" size={22} strokeWidth={2.4} /></span>
                {t('projects.new')}
              </button>
            </li>
          )}
        </ul>
      )}
    </Screen>
  )
}
