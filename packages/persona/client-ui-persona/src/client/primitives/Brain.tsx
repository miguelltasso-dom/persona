/**
 * Segundo cérebro (BRIEFING 19, SECOND-BRAIN.md; spec design/SECOND-BRAIN-SPEC.md — Muse).
 * RememberPermission: "Lembrar esta permissão" inside an approval — scope spelled out, validity as an explicit choice.
 * PermissionRow: an active remembered permission with scope, validity, recent use and 1-click Revoke (with confirm).
 * ChangeFeed: "O que mudou hoje". ContradictionCard: two statements side by side, the person decides.
 * PageMeta: typed properties, backlinks and version history (who edited: person or persona).
 */

import { useId, useState, type ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { Chip } from './Chip.tsx'
import { UiIcon } from './icons.tsx'
import styles from './Brain.module.css'

/* ───────────── Permissions ───────────── */

export type PermissionValidity = 'once' | 'week' | 'until-revoked'
export const PERMISSION_VALIDITIES: readonly PermissionValidity[] = ['once', 'week', 'until-revoked']

export interface PermissionScope {
  /** "Sol" */
  readonly persona: string
  readonly personaAvatar?: string | undefined
  /** "responder clientes no WhatsApp" */
  readonly action: string
  /** "só com modelos de resposta aprovados" */
  readonly target?: string | undefined
  /** "até 20 por dia" */
  readonly limits?: string | undefined
}

export interface RememberPermissionProps {
  readonly scope: PermissionScope
  readonly remember: boolean
  readonly onRememberChange: (remember: boolean) => void
  readonly validity: PermissionValidity
  readonly onValidityChange: (validity: PermissionValidity) => void
  readonly labels: {
    /** "Lembrar esta permissão" */
    readonly remember: string
    /** "Da próxima vez, Sol não pergunta para:" */
    readonly scopeLead: (persona: string) => string
    readonly validity: string
    readonly validities: Readonly<Record<PermissionValidity, string>>
    /** "Vale só para isto. Qualquer coisa maior, outro alvo ou outra persona: ela pergunta de novo." */
    readonly guard: string
  }
}

/** Opt-in, never pre-checked; the scope is a sentence, not a form. */
export function RememberPermission({ scope, remember, onRememberChange, validity, onValidityChange, labels }: RememberPermissionProps): ReactNode {
  const id = useId()
  return (
    <div className={styles.remember} data-on={remember ? '' : undefined}>
      <label className={styles.rememberToggle}>
        <input type="checkbox" checked={remember} aria-controls={`${id}-scope`} aria-expanded={remember} onChange={(event) => { onRememberChange(event.target.checked) }} />
        <UiIcon name="check" size={14} strokeWidth={2.6} className={styles.tick} />
        <span>{labels.remember}</span>
      </label>
      {remember && (
        <div id={`${id}-scope`} className={styles.scope}>
          <p className={styles.scopeLead}>{labels.scopeLead(scope.persona)}</p>
          <ScopeSentence scope={scope} />
          <fieldset className={styles.validity}>
            <legend className={styles.validityLegend}>{labels.validity}</legend>
            <div className={styles.segmented}>
              {PERMISSION_VALIDITIES.map(v => (
                <label key={v} data-checked={validity === v ? '' : undefined}>
                  <input type="radio" name={`${id}-validity`} value={v} checked={validity === v} onChange={() => { onValidityChange(v) }} />
                  {labels.validities[v]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className={styles.guard}><UiIcon name="alert" size={14} strokeWidth={2.2} />{labels.guard}</p>
        </div>
      )}
    </div>
  )
}

function ScopeSentence({ scope }: { readonly scope: PermissionScope }): ReactNode {
  return (
    <ul className={styles.scopeList}>
      <li><b>{scope.action}</b></li>
      {scope.target !== undefined && <li>{scope.target}</li>}
      {scope.limits !== undefined && <li>{scope.limits}</li>}
    </ul>
  )
}

export interface PermissionRowProps {
  readonly scope: PermissionScope
  /** "Concedida por você em 03/11" */
  readonly grantedBy: string
  /** "Até você revogar" | "Vence em 5 dias" | "Venceu" */
  readonly validityText: string
  readonly expired?: boolean
  /** "Usada 4 vezes · última hoje 14:20" */
  readonly usage?: string | undefined
  readonly onRevoke?: (() => void) | undefined
  readonly labels: { readonly revoke: string; readonly confirmRevoke: string; readonly cancel: string; readonly revoked: string }
  readonly revoked?: boolean
}

/** One remembered permission; Revoke asks once inline and takes effect immediately. */
export function PermissionRow({ scope, grantedBy, validityText, expired = false, usage, onRevoke, labels, revoked = false }: PermissionRowProps): ReactNode {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className={styles.permission} data-state={revoked ? 'revoked' : expired ? 'expired' : 'active'}>
      <Avatar name={scope.persona} src={scope.personaAvatar} size={40} shape="portrait" decorative />
      <div className={styles.permissionMain}>
        <p className={styles.permissionTitle}><b>{scope.persona}</b> · {scope.action}</p>
        {(scope.target !== undefined || scope.limits !== undefined) && (
          <p className={styles.permissionScope}>{[scope.target, scope.limits].filter(Boolean).join(' · ')}</p>
        )}
        <p className={styles.permissionMeta}>
          <Chip size="s" tone={revoked || expired ? 'neutral' : 'success'}>{revoked ? labels.revoked : validityText}</Chip>
          <span>{grantedBy}</span>
          {usage !== undefined && <span>{usage}</span>}
        </p>
      </div>
      {!revoked && onRevoke !== undefined && (
        confirming ? (
          <span className={styles.confirm} role="group" aria-label={labels.confirmRevoke}>
            <Button size="s" variant="danger" onClick={() => { setConfirming(false); onRevoke() }}>{labels.confirmRevoke}</Button>
            <Button size="s" variant="ghost" onClick={() => { setConfirming(false) }}>{labels.cancel}</Button>
          </span>
        ) : (
          <Button size="s" variant="secondary" onClick={() => { setConfirming(true) }}>{labels.revoke}</Button>
        )
      )}
    </li>
  )
}

/* ───────────── Home: what changed, contradictions ───────────── */

export interface ChangeItem {
  readonly id: string
  /** "Atlas" | "Você" */
  readonly who: string
  readonly whoAvatar?: string | undefined
  /** "atualizou", "criou", "ligou" */
  readonly verb: string
  readonly pageTitle: string
  readonly pageType: string
  /** "a partir da tarefa 'Proposta Padaria Lua'" */
  readonly source?: string | undefined
  readonly time: string
  readonly onOpen?: (() => void) | undefined
}

export function ChangeFeed({ items, label, empty }: { readonly items: readonly ChangeItem[]; readonly label: string; readonly empty: string }): ReactNode {
  if (items.length === 0) return <p className={styles.feedEmpty}>{empty}</p>
  return (
    <ol className={styles.feed} aria-label={label}>
      {items.map(item => (
        <li key={item.id} className={styles.feedItem}>
          <Avatar name={item.who} src={item.whoAvatar} size={32} shape={item.whoAvatar === undefined ? 'person' : 'portrait'} decorative />
          <div className={styles.feedBody}>
            <div className={styles.feedText}>
              <p>
                <b>{item.who}</b> {item.verb}{' '}
                {item.onOpen !== undefined
                  ? <button type="button" className={styles.pageLink} onClick={item.onOpen}>{item.pageTitle}</button>
                  : <span className={styles.pageName}>{item.pageTitle}</span>}
                <Chip size="s" tone="neutral" className={styles.typeChip}>{item.pageType}</Chip>
              </p>
              {item.source !== undefined && <p className={styles.feedSource}>{item.source}</p>}
            </div>
            <time className={styles.feedTime} dateTime={item.time}>{item.time}</time>
          </div>
        </li>
      ))}
    </ol>
  )
}

export interface ContradictionCardProps {
  readonly pageTitle: string
  readonly current: { readonly text: string; readonly source: string }
  readonly incoming: { readonly text: string; readonly source: string }
  readonly onKeepCurrent: () => void
  readonly onUseIncoming: () => void
  readonly onEdit?: (() => void) | undefined
  readonly labels: { readonly title: (page: string) => string; readonly current: string; readonly incoming: string; readonly keep: string; readonly use: string; readonly edit: string }
}

/** Nothing is overwritten silently: the person picks (or edits a merge). */
export function ContradictionCard({ pageTitle, current, incoming, onKeepCurrent, onUseIncoming, onEdit, labels }: ContradictionCardProps): ReactNode {
  const titleId = useId()
  return (
    <section className={styles.contradiction} aria-labelledby={titleId}>
      <h4 id={titleId} className={styles.contradictionTitle}><UiIcon name="alert" size={16} strokeWidth={2.2} />{labels.title(pageTitle)}</h4>
      <div className={styles.versus}>
        <div className={styles.side}>
          <p className={styles.sideLabel}>{labels.current}</p>
          <p className={styles.sideText}>{current.text}</p>
          <p className={styles.sideSource}>{current.source}</p>
        </div>
        <div className={styles.side} data-incoming="">
          <p className={styles.sideLabel}>{labels.incoming}</p>
          <p className={styles.sideText}>{incoming.text}</p>
          <p className={styles.sideSource}>{incoming.source}</p>
        </div>
      </div>
      <div className={styles.contradictionActions}>
        <Button size="s" variant="secondary" onClick={onKeepCurrent}>{labels.keep}</Button>
        <Button size="s" variant="secondary" onClick={onUseIncoming}>{labels.use}</Button>
        {onEdit !== undefined && <Button size="s" variant="ghost" onClick={onEdit}>{labels.edit}</Button>}
      </div>
    </section>
  )
}

/* ───────────── Page: properties, backlinks, history ───────────── */

export interface PageProperty { readonly label: string; readonly value: ReactNode }
export interface PageLink { readonly id: string; readonly title: string; readonly type: string; readonly onOpen?: (() => void) | undefined }
export interface PageVersion {
  readonly id: string
  readonly who: string
  readonly whoAvatar?: string | undefined
  /** "editou à mão", "atualizou a partir da tarefa X" */
  readonly what: string
  readonly time: string
  readonly onView?: (() => void) | undefined
}

export interface PageMetaProps {
  readonly properties: readonly PageProperty[]
  readonly backlinks: readonly PageLink[]
  readonly history: readonly PageVersion[]
  /** "Confirmada há 12 dias" or "Não confirmada há 90 dias — confirmar?" */
  readonly confirmation?: { readonly text: string; readonly stale: boolean; readonly onConfirm?: (() => void) | undefined } | undefined
  readonly labels: { readonly properties: string; readonly backlinks: string; readonly noBacklinks: string; readonly history: string; readonly confirm: string; readonly view: string }
}

export function PageMeta({ properties, backlinks, history, confirmation, labels }: PageMetaProps): ReactNode {
  return (
    <aside className={styles.meta}>
      {confirmation !== undefined && (
        <p className={styles.confirmation} data-stale={confirmation.stale ? '' : undefined}>
          <UiIcon name={confirmation.stale ? 'clock' : 'check'} size={14} strokeWidth={2.4} />
          {confirmation.text}
          {confirmation.stale && confirmation.onConfirm !== undefined && (
            <button type="button" className={styles.pageLink} onClick={confirmation.onConfirm}>{labels.confirm}</button>
          )}
        </p>
      )}
      <section aria-label={labels.properties}>
        <h4 className={styles.metaTitle}>{labels.properties}</h4>
        <dl className={styles.props}>
          {properties.map(prop => (
            <div key={prop.label} className={styles.prop}>
              <dt>{prop.label}</dt>
              <dd>{prop.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label={labels.backlinks}>
        <h4 className={styles.metaTitle}>{labels.backlinks} <span className={styles.count}>{backlinks.length}</span></h4>
        {backlinks.length === 0 ? <p className={styles.feedEmpty}>{labels.noBacklinks}</p> : (
          <ul className={styles.links}>
            {backlinks.map(link => (
              <li key={link.id}>
                {link.onOpen !== undefined
                  ? <button type="button" className={styles.pageLink} onClick={link.onOpen}>{link.title}</button>
                  : <span>{link.title}</span>}
                <span className={styles.linkType}>{link.type}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={labels.history}>
        <h4 className={styles.metaTitle}>{labels.history}</h4>
        <ol className={styles.history}>
          {history.map(version => (
            <li key={version.id}>
              <Avatar name={version.who} src={version.whoAvatar} size={24} shape={version.whoAvatar === undefined ? 'person' : 'portrait'} decorative />
              <span className={styles.historyText}><b>{version.who}</b> {version.what}</span>
              <time className={styles.feedTime}>{version.time}</time>
              {version.onView !== undefined && <button type="button" className={styles.pageLink} onClick={version.onView}>{labels.view}</button>}
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}
