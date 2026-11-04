/**
 * Várias contas por provedor (WAVE2 §3, WAVE2-SPEC (c)) — Muse primitives for Lumen.
 * AccountRow: one connected account (label, one-state-one-action chip, official meters or honest "no estimate",
 * who uses it, ⋯). AccountPolicyPicker: the swap policy as 4 plain-language radio cards. Notice: info/warning box.
 */

import type { ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { ChoiceCards } from './ChoiceCards.tsx'
import { BrandIcon, UiIcon } from './icons.tsx'
import { MenuButton, type MenuItem } from './MenuButton.tsx'
import { QuotaMeter } from './PersonaCard.tsx'
import styles from './Accounts.module.css'

export type AccountState = 'ready' | 'login' | 'limit' | 'checking'

export interface AccountUser {
  readonly name: string
  readonly src?: string | undefined
}

export interface AccountRowProps {
  /** "Pessoal", "Trabalho". */
  readonly label: string
  /** "Claude" — used in accessible names ("Claude · Pessoal"). */
  readonly providerName: string
  readonly state: AccountState
  /** "Pronta", "Precisa entrar", "No limite até 18:30". */
  readonly stateText: string
  /** The one next step for this state ("Entrar"). Omit when nothing is needed. */
  readonly action?: { readonly label: string; readonly onClick: () => void } | undefined
  /** Official quota; undefined → `quotaUnavailable` text, never an invented 0%. */
  readonly quota?: { readonly fiveHourPct?: number | undefined; readonly weekPct?: number | undefined } | undefined
  readonly labels: {
    readonly fiveHour: string
    readonly week: string
    readonly quotaUnavailable: string
    /** "Em uso por" */
    readonly usedBy: string
    /** "Mais ações para Claude · Pessoal" */
    readonly menu: string
    /** "Em uso agora" */
    readonly inUse?: string | undefined
  }
  readonly usedBy?: readonly AccountUser[] | undefined
  /** This account is the one running right now. */
  readonly inUse?: boolean
  readonly menu?: readonly MenuItem[] | undefined
}

const STATE_ICON: Readonly<Record<AccountState, ReactNode>> = {
  ready: <UiIcon name="check" size={14} strokeWidth={2.6} />,
  login: <UiIcon name="arrowRight" size={14} strokeWidth={2.4} />,
  limit: <UiIcon name="clock" size={14} strokeWidth={2.4} />,
  checking: <UiIcon name="sparkle" size={14} strokeWidth={2.2} />,
}

export function AccountRow({ label, providerName, state, stateText, action, quota, labels, usedBy = [], inUse = false, menu = [] }: AccountRowProps): ReactNode {
  const hasMeters = quota !== undefined && (quota.fiveHourPct !== undefined || quota.weekPct !== undefined)
  const shown = usedBy.slice(0, 3)
  return (
    <li className={styles.row} data-state={state} data-in-use={inUse ? '' : undefined}>
      <div className={styles.identity}>
        <span className={styles.label}>{label}</span>
        <span className={styles.state} data-state={state}>
          {STATE_ICON[state]}
          {stateText}
        </span>
        {inUse && labels.inUse !== undefined && <span className={styles.inUse}>{labels.inUse}</span>}
      </div>
      <div className={styles.quota}>
        {hasMeters ? (
          <div className={styles.meters}>
            {quota.fiveHourPct !== undefined && <QuotaMeter label={labels.fiveHour} pct={quota.fiveHourPct} />}
            {quota.weekPct !== undefined && <QuotaMeter label={labels.week} pct={quota.weekPct} />}
          </div>
        ) : (
          <span className={styles.unavailable}>{labels.quotaUnavailable}</span>
        )}
      </div>
      <div className={styles.trailing}>
        {shown.length > 0 && (
          <span className={styles.users} aria-label={`${labels.usedBy}: ${usedBy.map(user => user.name).join(', ')}`} role="img">
            {shown.map(user => (
              <Avatar key={user.name} name={user.name} src={user.src} size={24} shape="portrait" decorative className={styles.user} />
            ))}
            {usedBy.length > shown.length && <span className={styles.more} aria-hidden="true">+{usedBy.length - shown.length}</span>}
          </span>
        )}
        {action !== undefined && (
          <Button size="s" variant={state === 'login' ? 'primary' : 'secondary'} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {menu.length > 0 && <MenuButton label={labels.menu || `${providerName} · ${label}`} items={menu} variant="ghost" />}
      </div>
    </li>
  )
}

/** List wrapper for AccountRow (keeps the rows a real list). */
export function AccountList({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return <ul className={styles.list} aria-label={label}>{children}</ul>
}

export type AccountPolicy = 'fixed' | 'next_on_limit' | 'split_balance' | 'ask'

export const ACCOUNT_POLICIES: readonly AccountPolicy[] = ['fixed', 'next_on_limit', 'split_balance', 'ask']

export interface AccountPolicyPickerProps {
  /** Fieldset legend: "Quando uma conta chega ao limite". */
  readonly legend: string
  readonly value: AccountPolicy | undefined
  readonly onChange: (policy: AccountPolicy) => void
  readonly copy: Readonly<Record<AccountPolicy, { readonly title: string; readonly body: string }>>
  readonly recommended?: AccountPolicy | undefined
  /** "Recomendado" */
  readonly recommendedLabel?: string | undefined
  /** Radio group name (unique per scope). */
  readonly name: string
  readonly disabled?: boolean
}

const POLICY_ICON: Readonly<Record<AccountPolicy, ReactNode>> = {
  fixed: <UiIcon name="clock" size={22} strokeWidth={2} />,
  next_on_limit: <BrandIcon name="trocar-conta" size={22} />,
  split_balance: <UiIcon name="sparkle" size={22} strokeWidth={2} />,
  ask: <UiIcon name="help" size={22} strokeWidth={2} />,
}

/** The swap policy as 4 radio cards — an explicit choice, never silent (WAVE2 §3). */
export function AccountPolicyPicker({ legend, value, onChange, copy, recommended = 'next_on_limit', recommendedLabel, name, disabled = false }: AccountPolicyPickerProps): ReactNode {
  return (
    <ChoiceCards
      legend={legend}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={ACCOUNT_POLICIES.map(policy => ({
        id: policy,
        title: copy[policy].title,
        body: copy[policy].body,
        icon: POLICY_ICON[policy],
        badge: recommended === policy ? recommendedLabel : undefined,
      }))}
    />
  )
}

export interface NoticeProps {
  readonly tone?: 'info' | 'warning'
  readonly title?: string | undefined
  readonly children: ReactNode
}

/** Honest note / caution box (info-tint or warning-tint), always with an icon and text. */
export function Notice({ tone = 'info', title, children }: NoticeProps): ReactNode {
  return (
    <div className={styles.notice} data-tone={tone} role="note">
      <span className={styles.noticeIcon} aria-hidden="true">
        <UiIcon name={tone === 'warning' ? 'alert' : 'help'} size={18} strokeWidth={2.2} />
      </span>
      <div>
        {title !== undefined && <p className={styles.noticeTitle}>{title}</p>}
        <div className={styles.noticeBody}>{children}</div>
      </div>
    </div>
  )
}
