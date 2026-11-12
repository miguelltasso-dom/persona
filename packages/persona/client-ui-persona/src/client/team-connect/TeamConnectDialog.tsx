import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import { Avatar, Button, Modal, UiIcon } from '../primitives/index.ts'
import type { StartUi, TeamAccountUi, TeamAiUi, TeamConnectUi, TeamPersonUi, TeamRowUi } from './team-connect-wire.ts'
import styles from './TeamConnect.module.css'

export interface TeamConnectDialogProps extends PropsLocale<'persona.shell'> {
  readonly open: boolean
  readonly ai: TeamAiUi
  readonly connect: TeamConnectUi
  readonly accountId: string | undefined
  readonly starting: boolean
  readonly refused: Extract<StartUi, { ok: false }>['code'] | null
  readonly onChooseAccount: (id: string) => void
  readonly onStart: () => void
  readonly onRetryOne: (personaId: string) => void
  readonly onClose: () => void
  /** Carbon P1-09: with no account to wake them with, the way to Configurações › Conexões. Absent = no guided state (the old, disabled button). */
  readonly onOpenConnections?: (() => void) | undefined
}

type T = TeamConnectDialogProps['t']

const ENGINE_KEY = { claude: 'teamAi.engine.claude', codex: 'teamAi.engine.codex', cursor: 'teamAi.engine.cursor', opencode: 'teamAi.engine.opencode' } as const

/** `Claude · sobra bastante` / `Claude · quase no limite`; sem janela publicada fica só o nome. NUNCA dinheiro (D-092). */
export function accountLine(t: T, account: TeamAccountUi): string {
  const name = account.label === account.provider || account.label === '' ? t(ENGINE_KEY[account.provider]) : account.label
  if (account.room === 'desconhecida') return name
  return t('teamAi.account.line', { name, room: account.room === 'sobra' ? t('teamAi.account.room.sobra') : t('teamAi.account.room.quase') })
}

function Face({ person }: { readonly person: { readonly personaId: string; readonly name: string } }): ReactNode {
  return <Avatar name={person.name} src={resolvePersonaFace({ id: person.personaId, name: person.name })} size={32} shape="portrait" decorative />
}

function statusText(t: T, status: TeamRowUi['status']): string {
  if (status === 'conectada') return t('teamAi.row.connected')
  if (status === 'conectando') return t('teamAi.row.connecting')
  if (status === 'nao_conectou') return t('teamAi.row.failed')
  return t('teamAi.row.noEngine')
}

/**
 * COLHEITA-MUSE §13.2-3: o modal "Ligar a IA para a equipe toda". Antes de ligar: a arte, a lista de quem está sem IA (anel tracejado "Sem motor") e a escolha da conta
 * (as que já existem, por folga; a 1ª já marcada, sem selo). Ligando: uma persona por vez, na ordem em que cada uma conecta (o host manda; nada é encenado); o anel
 * tracejado vira o anel lavanda de `Disponível` com o check. Uma que falha fica "Não conectou · Tentar de novo" e as outras seguem. Fim: "Pronto: a equipe toda tem IA."
 */
export function TeamConnectDialog({ t, open, ai, connect, accountId, starting, refused, onChooseAccount, onStart, onRetryOne, onClose, onOpenConnections }: TeamConnectDialogProps): ReactNode {
  const live = connect.state !== 'idle'
  const rows: readonly (TeamRowUi | (TeamPersonUi & { readonly status: 'esperando' }))[] = live
    ? connect.rows
    : ai.without.map(person => ({ ...person, status: 'esperando' as const }))
  const named = (row: TeamRowUi | TeamPersonUi): { personaId: string; name: string } => ({ personaId: row.personaId, name: row.name })
  const total = ai.without.length
  const running = connect.state === 'running' || starting
  const ended = connect.state === 'done' || connect.state === 'partial'
  // Carbon P1-09: somebody is without AI but there is no account signed in to wake them with: the modal says so and takes the person to Conexões instead of a blank list and a dead button.
  const guided = !live && total >= 1 && ai.choices.length === 0 && onOpenConnections !== undefined

  let footer: ReactNode
  if (ended) {
    footer = <Button variant="primary" size="l" onClick={onClose}>{t('teamAi.close')}</Button>
  } else if (running) {
    // Sem os pontinhos animados do `loading`: o progresso é a lista andando (informação), não um enfeite que gira sem parar (Muse §rule 5; pré-aceite `gpu`).
    footer = <Button variant="primary" size="l" disabled>{t('teamAi.starting')}</Button>
  } else if (guided) {
    footer = <Button variant="primary" size="l" onClick={onOpenConnections}>{t('teamAi.dialog.noAccount.action')}</Button>
  } else {
    footer = (
      <Button variant="primary" size="l" disabled={total < 1 || accountId === undefined} onClick={onStart}>
        {total === 1 ? t('teamAi.dialog.action.one') : t('teamAi.dialog.action.many', { count: total })}
      </Button>
    )
  }

  return (
    <Modal open={open} title={t('teamAi.dialog.title')} closeLabel={t('teamAi.close')} onClose={onClose} size="m" footer={footer}>
      <div className={styles.dialogBody} data-persona-team-ai-dialog="">
        <img className={styles.art} src={ILLUSTRATIONS['ligar-ia-equipe']} alt="" width={240} height={140} />
        {connect.state === 'done' && (
          <p className={styles.done} role="status">
            <span className={styles.doneSeal} aria-hidden="true"><UiIcon name="check" size={16} strokeWidth={2.6} /></span>
            {t('teamAi.done')}
          </p>
        )}
        <ul className={styles.rows} aria-label={t('teamAi.dialog.listLabel')}>
          {rows.map(row => (
            <li key={row.personaId} className={styles.row} data-status={row.status}>
              <span className={styles.ring} data-status={row.status}>
                <Face person={named(row)} />
                {row.status === 'conectada' && <span className={styles.check} aria-hidden="true"><UiIcon name="check" size={12} strokeWidth={3} /></span>}
              </span>
              <span className={styles.name}>{row.name}</span>
              <span className={styles.status} {...(row.status === 'conectando' ? { 'aria-live': 'polite' as const } : {})}>{statusText(t, row.status)}</span>
              {row.status === 'nao_conectou' && (
                <Button variant="ghost" size="s" onClick={() => { onRetryOne(row.personaId) }}>{t('teamAi.row.retry')}</Button>
              )}
            </li>
          ))}
        </ul>
        {guided && <p className={styles.guide} role="status">{t('teamAi.dialog.noAccount.text')}</p>}
        {!live && ai.choices.length > 0 && (
          <fieldset className={styles.accounts}>
            <legend className={styles.legend}>{t('teamAi.account.legend')}</legend>
            {ai.choices.map(choice => (
              <label key={choice.id} className={styles.account}>
                <input type="radio" name="persona-team-ai-account" value={choice.id} checked={choice.id === accountId} onChange={() => { onChooseAccount(choice.id) }} />
                <span>{accountLine(t, choice)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {!live && refused !== null && <p className={styles.refused} role="alert">{t(refused === 'no_account' ? 'teamAi.refused.noAccount' : refused === 'no_one' ? 'teamAi.refused.noOne' : 'teamAi.refused.failed')}</p>}
      </div>
    </Modal>
  )
}
