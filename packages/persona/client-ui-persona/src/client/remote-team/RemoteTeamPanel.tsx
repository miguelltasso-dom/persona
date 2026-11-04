import { useEffect, useId, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react'
import type { RemoteTeamAvailability, RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Card, ChoiceCards, Chip, Input, Modal, Notice, Skeleton, UiIcon, formatUntil, formatWhen } from '../primitives/index.ts'
import {
  STATUS_ICON,
  STATUS_KEY,
  STATUS_TONE,
  behindLine,
  canRevokeInvite,
  canRevokeMember,
  checkEdgeUrl,
  deriveRemoteTeamStatus,
  inviteShareText,
  invitesWithoutMembers,
  parseSyncedAt,
  remoteTeamCapabilities,
  splitInviteText,
  toggleChannel,
  type InviteRow,
  type MemberRow,
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
  /** People of the remote project (host `listRemoteMembers`); `undefined` = the host does not list them (the invite list stays as it was). */
  readonly members?: readonly MemberRow[] | undefined
  readonly issued: IssuedInviteView | null
  readonly busy: RemoteTeamBusy
  /** Motivo da última falha do host (apresentado em português; o código fica fora da tela). */
  readonly error: RemoteTeamErrorKind | null
  /** Última troca vista por ESTA sessão: só vale quando o host não manda `syncedAt` (host antigo). Sem ela, só a linha genérica. */
  readonly lastExchangeAt?: number | null | undefined
  /** "Abrir Ajuda" no estado de Cofre indisponível; sem ele o botão não aparece. */
  readonly onOpenHelp?: (() => void) | undefined
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

/** Equipe remota (E13): conectar, convidar, entrar por convite, encerrar acesso e ver o estado sem jargão (QUILL-SCREENS-SPEC). */
export function RemoteTeamPanel({
  t,
  loading = false,
  vault,
  state,
  channels,
  invites,
  members,
  issued,
  busy,
  error,
  lastExchangeAt,
  onOpenHelp,
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
  const [channelsTouched, setChannelsTouched] = useState(false)
  const [acceptUrl, setAcceptUrl] = useState('')
  const [acceptToken, setAcceptToken] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'guest'>('member')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [copied, setCopied] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  // #geral comes checked: the common case is one tap. Once the person touches the list, it is theirs.
  useEffect(() => {
    if (channelsTouched || channels.length === 0) return
    const general = channels.filter(channel => channel.name.trim().toLowerCase() === 'geral').map(channel => channel.id)
    setSelected(current => (current.length === 0 && general.length > 0 ? general : current))
  }, [channels, channelsTouched])

  const status = deriveRemoteTeamStatus(state, vault)
  const can = remoteTeamCapabilities(status, state?.role)
  const statusKey = STATUS_KEY[status]
  const statusIcon = STATUS_ICON[status]

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

  /** A pasted invite is read from the clipboard BEFORE the field flattens its line breaks. */
  const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const parts = splitInviteText(event.clipboardData.getData('text'))
    if (parts.address === undefined || parts.token === undefined) return
    event.preventDefault()
    setAcceptUrl(parts.address)
    setAcceptToken(parts.token)
    setFieldErrors({})
  }

  /** The whole invite typed/pasted into either field fills both (fallback when the paste arrives already flattened). */
  const pasteInto = (field: 'address' | 'token', value: string): void => {
    const parts = splitInviteText(value)
    if (parts.address !== undefined && parts.token !== undefined) {
      setAcceptUrl(parts.address)
      setAcceptToken(parts.token)
      setFieldErrors({})
      return
    }
    if (field === 'address') setAcceptUrl(value)
    else setAcceptToken(value)
  }

  const copyInvite = (): void => {
    if (issued === null) return
    const text = inviteShareText(
      { address: t('remote.invite.address'), code: t('remote.invite.code') },
      issued.edgeUrl,
      issued.token,
    )
    // `navigator.clipboard` does not exist outside secure contexts (plain-HTTP pages), whatever the DOM typings say.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    void navigator.clipboard?.writeText(text).then(
      () => { setCopied(true) },
      () => { setCopied(false) },
    )
  }

  const hostError = error === null ? null : t(`remote.error.${error}`)
  // Dates are said the product way (primitives/when): "há 3 min", "hoje 14:20", "até amanhã 09:00".
  // The host's own clock (`syncedAt`, persisted) wins; this session's last exchange only stands in for an older host.
  const exchangeAt = parseSyncedAt(state?.syncedAt) ?? lastExchangeAt ?? null
  const exchange = exchangeAt === null ? null : formatWhen(exchangeAt)
  // Offline the time is an age, not a fresh look at the server: it is said as "Última troca", never as "em dia".
  const helpLine = status === 'connected' && exchange !== null
    ? t('remote.body.connectedAt', { when: exchange })
    : status === 'offline' && exchange !== null
      ? t('remote.body.offlineAt', { when: exchange })
      : t(`remote.body.${statusKey}`)
  const behind = behindLine(status, state?.behindBy)
  const openInvites = invitesWithoutMembers(invites, members)
  const revoking = confirmRevoke === null ? undefined : members?.find(member => member.inviteId === confirmRevoke)

  return (
    <Card as="section" padding="m" title={t('remote.title')} data-persona-surface="remote-team" titleAs="h2">
      <p className={styles.subtitle}>{t('remote.subtitle')}</p>

      <div className={styles.status} role="status" aria-live="polite" data-status={status}>
        <Chip tone={STATUS_TONE[status]} size="s" icon={statusIcon === null ? undefined : <UiIcon name={statusIcon} size={14} strokeWidth={2.4} />}>
          {t(`remote.status.${statusKey}`)}
        </Chip>
        {state !== null && <Chip tone="neutral" size="s">{t(`remote.role.${state.role}`)}</Chip>}
        <p className={styles.statusBody}>{helpLine}</p>
        {behind !== null && (
          <p className={styles.statusBody} data-persona-remote-behind={behind.key}>
            {t(`remote.behind.${behind.key}`, { count: behind.count })}
          </p>
        )}
        {status === 'connected' && can.canSync && (
          <Button variant="ghost" size="s" disabled={busy === 'sync'} onClick={onSync}>
            {busy === 'sync' ? t('remote.sync.syncing') : t('remote.sync.now')}
          </Button>
        )}
        {status === 'offline' && can.canSync && (
          <Button variant="secondary" size="s" disabled={busy === 'sync'} onClick={onSync}>
            {busy === 'sync' ? t('remote.sync.syncing') : t('remote.sync.retry')}
          </Button>
        )}
        {status === 'vault_unavailable' && onOpenHelp !== undefined && (
          <Button variant="secondary" size="s" onClick={onOpenHelp}>{t('remote.help.open')}</Button>
        )}
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
        </div>
      )}

      {members !== undefined && members.length > 0 && status !== 'revoked' && (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>{t('remote.members.title')}</h3>
          <ul className={styles.memberList}>
            {members.map(member => (
              <li key={member.actorId} className={styles.member}>
                <span className={styles.memberName}>
                  {member.name}
                  {member.actorId === state?.actorId && <span className={styles.muted}>{` · ${t('remote.members.you')}`}</span>}
                </span>
                <Chip tone="neutral" size="s">{t(`remote.role.${member.role}`)}</Chip>
                {member.status === 'revoked'
                  ? <Chip tone="neutral" size="s">{t('remote.invites.status.revoked')}</Chip>
                  : <span className={styles.muted}>{t('remote.members.joined', { when: formatWhen(member.joinedAt) })}</span>}
                {can.canInvite && canRevokeMember(member, state?.actorId) && (
                  <Button
                    variant="ghost"
                    size="s"
                    disabled={busy === 'revoke'}
                    aria-label={t('remote.members.revokeNamed', { name: member.name })}
                    onClick={() => { setConfirmRevoke(member.inviteId) }}
                  >
                    {t('remote.invites.revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
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
                  onChange={() => { setChannelsTouched(true); setSelected(current => toggleChannel(current, channel.id)) }}
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
            hint={t('remote.accept.addressHint')}
            value={acceptUrl}
            inputMode="url"
            autoComplete="off"
            onChange={(event) => { pasteInto('address', event.target.value) }}
            onPaste={onPaste}
            {...(fieldErrors.address === undefined || can.canConnect ? {} : { error: fieldErrors.address })}
          />
          <Input
            label={t('remote.accept.token')}
            value={acceptToken}
            type="password"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => { pasteInto('token', event.target.value) }}
            onPaste={onPaste}
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
            <Card tone="accent" padding="m" className={styles.issued} role="group" aria-label={t('remote.invite.created')}>
              <h3 className={styles.blockTitle}>{t('remote.invite.created')}</h3>
              <Notice tone="warning">{t('remote.invite.once')}</Notice>
              <dl className={styles.issuedFacts}>
                <div>
                  <dt>{t('remote.invite.address')}</dt>
                  <dd className={styles.mono}>{issued.edgeUrl}</dd>
                </div>
                <div>
                  <dt>{t('remote.invite.code')}</dt>
                  <dd><code className={styles.token}>{issued.token}</code></dd>
                </div>
              </dl>
              <div className={styles.row}>
                <Button variant="primary" size="s" onClick={copyInvite}>
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
            </Card>
          )}
        </div>
      )}

      {can.canInvite && (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>{t('remote.invites.title')}</h3>
          {openInvites.length === 0 ? (
            <>
              <p className={styles.muted}>{t(members !== undefined && members.length > 0 ? 'remote.invites.emptyOpen' : 'remote.invites.empty')}</p>
              <Button variant="ghost" size="s" disabled={busy === 'invite'} onClick={() => { onIssueInvite(inviteRole) }}>
                {t('remote.invite.action')}
              </Button>
            </>
          ) : (
            <ul className={styles.inviteList}>
              {openInvites.map(row => (
                <li key={row.id} className={styles.invite}>
                  <Chip tone={row.status === 'used' ? 'success' : row.status === 'open' ? 'brand' : 'neutral'} size="s">
                    {t(`remote.invites.status.${row.status}`)}
                  </Chip>
                  {(row.status === 'open' || row.status === 'expired') && (
                    <span className={styles.muted}>
                      {row.status === 'open'
                        ? t('remote.invites.validUntil', { until: formatUntil(row.expiresAt) })
                        : t('remote.invites.expiredOn', { when: formatWhen(row.expiresAt) })}
                    </span>
                  )}
                  {canRevokeInvite(row) && (
                    <Button
                      variant="ghost"
                      size="s"
                      disabled={busy === 'revoke'}
                      onClick={() => { setConfirmRevoke(row.id) }}
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

      {confirmRevoke !== null && (
        <Modal
          open
          size="m"
          title={revoking === undefined ? t('remote.revoke.title') : t('remote.revoke.titleNamed', { name: revoking.name })}
          closeLabel={t('remote.revoke.close')}
          onClose={() => { setConfirmRevoke(null) }}
          footer={(
            <>
              <Button variant="ghost" onClick={() => { setConfirmRevoke(null) }}>{t('remote.revoke.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const id = confirmRevoke
                  setConfirmRevoke(null)
                  onRevoke(id)
                }}
              >
                {t('remote.invites.revoke')}
              </Button>
            </>
          )}
        >
          <p>{t('remote.revoke.body')}</p>
        </Modal>
      )}
    </Card>
  )
}
