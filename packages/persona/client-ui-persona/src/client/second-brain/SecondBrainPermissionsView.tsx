/** Segundo cérebro › Permissões (SECOND-BRAIN-SPEC §5). */

import { useMemo, useState, type ReactNode } from 'react'
import type { BrainGrantView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PermissionRow, Screen, ScreenHeader, Tabs, type PermissionScope } from '../primitives/index.ts'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

type GrantFilter = 'active' | 'expired' | 'revoked'

export interface SecondBrainPermissionsViewProps {
  readonly dict?: LocaleDict
  readonly grants: readonly BrainGrantView[]
  readonly personaNames: Readonly<Record<string, string>>
  readonly onBack: () => void
  readonly onRevokeGrant?: (grantId: string) => void
}

function grantScope(
  grant: BrainGrantView,
  personaNames: Readonly<Record<string, string>>,
): PermissionScope {
  return {
    persona: personaNames[grant.personaId] ?? grant.personaId,
    action: grant.action,
    target: grant.target,
  }
}

function grantValidityLabel(dict: LocaleDict, grant: BrainGrantView): string {
  if (grant.revokedAt !== undefined) return bindLocale(dict, 'permissions.revoked')
  if (grant.validity === 'once') return bindLocale(dict, 'permissions.validityOnce')
  if (grant.validity === '7d') {
    return grant.expiresAt === undefined
      ? bindLocale(dict, 'permissions.validity7d')
      : bindLocale(dict, 'permissions.validity7dUntil', { date: grant.expiresAt.slice(0, 10) })
  }
  return bindLocale(dict, 'permissions.validityUntilRevoke')
}

function grantExpired(grant: BrainGrantView): boolean {
  if (grant.revokedAt !== undefined || grant.expiresAt === undefined) return false
  return Date.parse(grant.expiresAt) < Date.now()
}

export function SecondBrainPermissionsView({
  dict = defaultDict,
  grants,
  personaNames,
  onBack,
  onRevokeGrant,
}: SecondBrainPermissionsViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [filter, setFilter] = useState<GrantFilter>('active')
  const rows = useMemo(() => {
    return grants.filter((grant) => {
      if (filter === 'revoked') return grant.revokedAt !== undefined
      if (filter === 'expired') return grant.revokedAt === undefined && grantExpired(grant)
      return grant.revokedAt === undefined && !grantExpired(grant)
    })
  }, [filter, grants])

  return (
    <Screen className={styles.shell} data-persona-surface="second-brain-permissions">
      <ScreenHeader
        icon="conhecimento-memoria"
        eyebrow={t('header.eyebrow')}
        title={t('permissions.title')}
        subtitle={t('permissions.subtitle')}
        actions={(
          <button type="button" className={styles.backLink} onClick={onBack}>
            {t('page.backHome')}
          </button>
        )}
      />
      <Tabs
        label={t('permissions.title')}
        idPrefix="brain-grants"
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'active' as const, label: t('permissions.filter.active') },
          { id: 'expired' as const, label: t('permissions.filter.expired') },
          { id: 'revoked' as const, label: t('permissions.filter.revoked') },
        ]}
      />
      <ul className={styles.permissionList}>
        {rows.map(grant => (
          <PermissionRow
            key={grant.id}
            scope={grantScope(grant, personaNames)}
            grantedBy={t('permissions.grantedByYou')}
            validityText={grantValidityLabel(dict, grant)}
            expired={grantExpired(grant)}
            revoked={grant.revokedAt !== undefined}
            usage={grant.useCount > 0 ? t('permissions.usage', { count: grant.useCount }) : undefined}
            labels={{
              revoke: t('permissions.revoke'),
              confirmRevoke: t('permissions.confirmRevoke'),
              cancel: t('permissions.cancel'),
              revoked: t('permissions.revoked'),
            }}
            {...(onRevokeGrant === undefined || grant.revokedAt !== undefined
              ? {}
              : { onRevoke: () => { onRevokeGrant(grant.id) } })}
          />
        ))}
      </ul>
    </Screen>
  )
}
