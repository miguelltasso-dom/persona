import { useId, useState, type FormEvent, type ReactNode } from 'react'
import type { RemoteTeamAvailability, RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Card, ChoiceCards, Chip, Input, Notice, Skeleton, UiIcon } from '../primitives/index.ts'
import {
  STATUS_KEY,
  STATUS_TONE,
  canRevokeInvite,
  checkEdgeUrl,
  deriveRemoteTeamStatus,
  inviteShareText,
  remoteTeamCapabilities,
  toggleChannel,
  type InviteRow,
  type RemoteTeamErrorKind,
  type SharableChannel,
} from './remote-team-model.ts'
import styles from './RemoteTeamPanel.module.css'

type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

export type RemoteTeamBusy = 'connect' | 'accept' | 'invite' | 'sync' | 'revoke' | null

/** Convite recém-criado: o código só existe aqui, nesta resposta transitória (o host guarda o resto no Cofre). */
export interface IssuedInviteView {
  readonly inviteId: string
  readonly token: string
  readonly edgeUrl: string
}

export interface RemoteTeamPanelProps {
  readonly t: Translate
  readonly loading?: boolean
  readonly vault: RemoteTeamAvailability['vault'] | undefined
  readonly state: RemoteTeamState | null
  readonly channels: readonly SharableChannel[]
  readonly invites: readonly InviteRow[]
  readonly issued: IssuedInviteView | null
  readonly busy: RemoteTeamBusy
  /** Motivo da última falha do host (apresentado em português; o código fica fora da tela). */
  readonly error: RemoteTeamErrorKind | null
  readonly onConnect: (edgeUrl: string, channelIds: readonly string[]) => void
  readonly onAccept: (edgeUrl: string, token: string) => void
  readonly onIssueInvite: (role: 'member' | 'guest') => void
  readonly onDismissIssued: () => void
  readonly onRevoke: (inviteId: string) => void
  readonly onSync: () => void
}

type FieldErrors = { address?: string; channels?: string; token?: string }

function channelName(channels: readonly SharableChannel[], id: string): string {
  return channels.find(row => row.id === id)?.name ?? id
}

/** Equipe remota (E13): conectar, convidar, entrar por convite, revogar e ver o estado de sincronização sem jargão. */
export function RemoteTeamPanel({
  t,
  loading = false,
  vault,
  state,
  channels,
  invites,
  issued,
  busy,
  error,
  onConnect,
  onAccept,
  onIssueInvite,
  onDismissIssued,
  onRevoke,
  onSync,
}: RemoteTeamPanelProps): ReactNode {
  const connectId = useId()
  const acceptId = useId()
  const [connectUrl, setConnectUrl] = useState('')
  const [selected, setSelected] = useState<readonly string[]>([])
  const [acceptUrl, setAcceptUrl] = useState('')
  const [acceptToken, setAcceptToken] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'guest'>('member')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [copied, setCopied] = useState(false)

  const status = deriveRemoteTeamStatus(state, vault)
  const can = remoteTeamCapabilities(status, state?.role)
  const statusKey = STATUS_KEY[status]

  if (loading) {
    return (
      <Card as="section" padding="m" title={t('remote.title')} data-persona-surface="remote-team" aria-busy="true">
        <Skeleton height={64} />
      </Card>
    )
  }

  const submitConnect = (event: FormEvent): void => {
    event.preventDefault()
    const check = checkEdgeUrl(connectUrl)
    const next: FieldErrors = {}
    if (!check.ok) next.address = t('remote.error.address')
    if (selected.length === 0) next.channels = t('remote.error.channels')
    setFieldErrors(next)
    if (check.ok && selected.length > 0) onConnect(check.url, selected)
  }

  const submitAccept = (event: FormEvent): void => {
    event.preventDefault()
    const check = checkEdgeUrl(acceptUrl)
    const next: FieldErrors = {}
    if (!check.ok) next.address = t('remote.error.address')
    if (acceptToken.trim().length === 0) next.token = t('remote.error.token')
    setFieldErrors(next)
    if (check.ok && acceptToken.trim().length > 0) onAccept(check.url, acceptToken.trim())
  }

  const copyInvite = (): void => {
    if (issued === null) return
    const text = inviteShareText(
      { address: t('remote.invite.address'), code: t('remote.invite.code') },
      issued.edgeUrl,
      issued.token,
    )
    void navigator.clipboard?.writeText(text).then(
      () => { setCopied(true) },
      () => { setCopied(false) },
    )
  }

  const hostError = error === null ? null : t(`remote.error.${error}`)

  return (
    <Card as="section" padding="m" title={t('remote.title')} data-persona-surface="remote-team" titleAs="h2">
      <p className={styles.subtitle}>{t('remote.subtitle')}</p>

      <div className={styles.status} role="status" aria-live="polite" data-status={status}>
        <Chip tone={STATUS_TONE[status]} size="s">{t(`remote.status.${statusKey}`)}</Chip>
        {state !== null && <Chip tone="neutral" size="s">{t(`remote.role.${state.role}`)}</Chip>}
        <p className={styles.statusBody}>{t(`remote.body.${statusKey}`)}</p>
      </div>

      {hostError !== null && (
        <div className={styles.alert} role="alert">
          <Notice tone="warning">{hostError}</Notice>
        </div>
      )}

      {state !== null && status !== 'revoked' && (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>{t('remote.channels.shared')}</h3>
          {state.channelIds.length === 0 ? (
            <p className={styles.muted}>{t('remote.channels.none')}</p>
          ) : (
            <ul className={styles.chipList}>
              {state.channelIds.map(id => (
                <li key={id}><Chip tone="brand" size="s">{`#${channelName(channels, id)}`}</Chip></li>
              ))}
            </ul>
          )}
          {can.canSync && (
            <Button variant="secondary" size="s" disabled={busy === 'sync'} onClick={onSync}>
              {busy === 'sync' ? t('remote.sync.syncing') : t('remote.sync.now')}
            </Button>
          )}
        </div>
      )}

      {can.canConnect && (
        <form className={styles.block} onSubmit={submitConnect} noValidate aria-labelledby={`${connectId}-title`}>
          <h3 id={`${connectId}-title`} className={styles.blockTitle}>{t('remote.connect.title')}</h3>
          <p className={styles.muted}>{t('remote.connect.hint')}</p>
          <Input
            label={t('remote.connect.address')}
            hint={t('remote.connect.addressHint')}
            value={connectUrl}
            inputMode="url"
            autoComplete="off"
            onChange={(event) => { setConnectUrl(event.target.value) }}
            {...(fieldErrors.address === undefined ? {} : { error: fieldErrors.address })}
          />
          <fieldset className={styles.channels} aria-describedby={`${connectId}-channels-hint`}>
            <legend className={styles.blockTitle}>{t('remote.connect.channels')}</legend>
            <p id={`${connectId}-channels-hint`} className={styles.muted}>{t('remote.connect.channelsHint')}</p>
            {channels.map(channel => (
              <label key={channel.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={selected.includes(channel.id)}
                  onChange={() => { setSelected(current => toggleChannel(current, channel.id)) }}
                />
                <span>{`#${channel.name}`}</span>
              </label>
            ))}
            {fieldErrors.channels !== undefined && (
              <p className={styles.fieldError} role="alert">
                <UiIcon name="alert" size={16} />
                {fieldErrors.channels}
              </p>
            )}
          </fieldset>
          <Button type="submit" variant="primary" disabled={busy === 'connect' || vault === 'unavailable'}>
            {busy === 'connect' ? t('remote.connect.connecting') : t('remote.connect.action')}
          </Button>
        </form>
      )}

      {can.canAccept && (
        <form className={styles.block} onSubmit={submitAccept} noValidate aria-labelledby={`${acceptId}-title`}>
          <h3 id={`${acceptId}-title`} className={styles.blockTitle}>{t('remote.accept.title')}</h3>
          <p className={styles.muted}>{t('remote.accept.hint')}</p>
          <Input
            label={t('remote.connect.address')}
            value={acceptUrl}
            inputMode="url"
            autoComplete="off"
            onChange={(event) => { setAcceptUrl(event.target.value) }}
            {...(fieldErrors.address === undefined || can.canConnect ? {} : { error: fieldErrors.address })}
          />
          <Input
            label={t('remote.accept.token')}
            value={acceptToken}
            type="password"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => { setAcceptToken(event.target.value) }}
            {...(fieldErrors.token === undefined ? {} : { error: fieldErrors.token })}
          />
          <Button type="submit" variant="secondary" disabled={busy === 'accept' || vault === 'unavailable'}>
            {busy === 'accept' ? t('remote.accept.joining') : t('remote.accept.action')}
          </Button>
        </form>
      )}

      {can.canInvite && (
        <div className={styles.block}>
          <ChoiceCards
            legend={t('remote.invite.role')}
            name="remote-invite-role"
            value={inviteRole}
            onChange={setInviteRole}
            options={[
              { id: 'member', title: t('remote.role.member'), body: t('remote.invite.role.member') },
              { id: 'guest', title: t('remote.role.guest'), body: t('remote.invite.role.guest') },
            ]}
          />
          <Button
            variant="primary"
            disabled={busy === 'invite'}
            onClick={() => { onIssueInvite(inviteRole) }}
          >
            {t('remote.invite.action')}
          </Button>

          {issued !== null && (
            <div className={styles.issued} role="group" aria-label={t('remote.invite.created')}>
              <h3 className={styles.blockTitle}>{t('remote.invite.created')}</h3>
              <Notice tone="warning">{t('remote.invite.once')}</Notice>
              <dl className={styles.issuedFacts}>
                <div>
                  <dt>{t('remote.invite.address')}</dt>
                  <dd>{issued.edgeUrl}</dd>
                </div>
                <div>
                  <dt>{t('remote.invite.code')}</dt>
                  <dd><code className={styles.token}>{issued.token}</code></dd>
                </div>
              </dl>
              <div className={styles.row}>
                <Button variant="secondary" size="s" onClick={copyInvite}>
                  {copied ? t('remote.invite.copied') : t('remote.invite.copy')}
                </Button>
                <Button
                  variant="ghost"
                  size="s"
                  onClick={() => { setCopied(false); onDismissIssued() }}
                >
                  {t('remote.invite.done')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {can.canInvite && (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>{t('remote.invites.title')}</h3>
          {invites.length === 0 ? (
            <p className={styles.muted}>{t('remote.invites.empty')}</p>
          ) : (
            <ul className={styles.inviteList}>
              {invites.map(row => (
                <li key={row.id} className={styles.invite}>
                  <Chip tone={row.status === 'used' ? 'success' : row.status === 'open' ? 'brand' : 'neutral'} size="s">
                    {t(`remote.invites.status.${row.status}`)}
                  </Chip>
                  {canRevokeInvite(row) && (
                    <Button
                      variant="ghost"
                      size="s"
                      disabled={busy === 'revoke'}
                      onClick={() => { onRevoke(row.id) }}
                    >
                      {t('remote.invites.revoke')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
