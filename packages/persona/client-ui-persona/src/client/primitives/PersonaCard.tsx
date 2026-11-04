/**
 * Persona card (Muse, PERSONA-CARD-SPEC.md): the popover that opens from any persona avatar (rail, messages, banner,
 * board, org chart) and the same facts block on the profile. Presentation only — callers pass translated labels and
 * already-shaped data; a missing quota is shown as "indisponível", never 0%.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AVATAR_96, ILLUSTRATIONS, OVERLAY_ICONS } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId, type PersonaPoseState } from '../assets/asset-url.ts'
import { Avatar } from './Avatar.tsx'
import { IconButton } from './Button.tsx'
import { MenuButton } from './MenuButton.tsx'
import { BrandIcon, UiIcon, type UiIconName } from './icons.tsx'
import styles from './PersonaCard.module.css'
import { humanizeEngineLabel } from '../team/engine-label.ts'

/** What the persona is doing right now (drives the icon and tint of the "agora" line). */
export type PersonaNowKind =
  | 'working'
  | 'reviewing'
  | 'waiting-approval'
  | 'waiting-reply'
  | 'quota'
  | 'resting'
  | 'stuck'
  | 'offline'
  | 'idle'

const NOW_ICON: Readonly<Record<PersonaNowKind, keyof typeof OVERLAY_ICONS | UiIconName>> = {
  working: 'typing-dots',
  reviewing: 'review-loupe',
  'waiting-approval': 'approval-badge',
  'waiting-reply': 'thinking-bubble',
  quota: 'clock',
  resting: 'zzz',
  stuck: 'error-badge',
  offline: 'clock',
  idle: 'sparkle',
}

/** Live pose per "agora" kind (UX-GUIDE §3: the pose follows the real state). */
export const NOW_POSE: Readonly<Record<PersonaNowKind, PersonaPoseState>> = {
  working: 'trabalhando',
  reviewing: 'revisando',
  'waiting-approval': 'aguardando-aprovacao',
  'waiting-reply': 'aguardando-resposta',
  quota: 'descansando',
  resting: 'descansando',
  stuck: 'erro',
  offline: 'offline',
  idle: 'disponivel',
}

export type PersonaPresence = 'online' | 'away' | 'offline'

export interface PersonaCardNow {
  readonly kind: PersonaNowKind
  /** Human sentence: "Revisando cláusulas do contrato". */
  readonly text: string
}

export interface PersonaCardTalk {
  /** "Todos do workspace" or "Ana, Time de vendas". */
  readonly value: string
  readonly everyone: boolean
  readonly onEdit?: (() => void) | undefined
}

export interface PersonaCardQuota {
  /** 0–100+, undefined when the vendor does not report it. */
  readonly fiveHourPct?: number | undefined
  readonly weekPct?: number | undefined
  /** Already formatted: "No limite até 18:30". Shown in danger tone. */
  readonly limitText?: string | undefined
}

export interface PersonaCardEngine {
  /** "Plano do Claude · Sonnet". */
  readonly value: string
  /** WAVE2 — connected seat label, e.g. "Claude · Trabalho". */
  readonly activeAccountLabel?: string | undefined
  /** WAVE2 — the swap policy in one plain line ("Troca para Pessoal no limite"). */
  readonly accountPolicyText?: string | undefined
  /** Official quota; undefined = unavailable (rendered as text, never as 0%). */
  readonly quota?: PersonaCardQuota | undefined
}

export interface PersonaCardFact {
  readonly id: string
  readonly label: string
  readonly value: ReactNode
  /** Visually flags a gap (e.g. "Sem substituto"). */
  readonly tone?: 'danger' | undefined
}

export interface PersonaCardLabels {
  readonly nowCaption: string
  readonly talkTitle: string
  readonly talkEdit: string
  readonly engine: string
  readonly activeAccount: string
  readonly quotaFiveHour: string
  readonly quotaWeek: string
  readonly quotaUnavailable: string
  readonly menu: string
  readonly send: string
  /** "Mensagem para Nina". */
  readonly messagePlaceholder: string
  /** Presence word for the seal tooltip ("Online"). */
  readonly presence: Readonly<Record<PersonaPresence, string>>
}

export interface PersonaCardMenuItem {
  readonly id: string
  readonly label: string
  readonly onSelect: () => void
  readonly tone?: 'danger' | undefined
}

export interface PersonaCardFactsProps {
  readonly labels: PersonaCardLabels
  readonly now: PersonaCardNow
  readonly talk?: PersonaCardTalk | undefined
  /** Presence, responsible human, substitute, current project — in this order. */
  readonly facts: readonly PersonaCardFact[]
  readonly engine?: PersonaCardEngine | undefined
  /** "wide" lays facts in two columns (profile). */
  readonly layout?: 'card' | 'wide'
}

function NowIcon({ kind }: { readonly kind: PersonaNowKind }): ReactNode {
  const icon = NOW_ICON[kind]
  const overlay = (OVERLAY_ICONS as Readonly<Record<string, string>>)[icon]
  if (overlay !== undefined) return <img src={overlay} alt="" />
  return <UiIcon name={icon as UiIconName} size={18} strokeWidth={2.4} />
}

function quotaTone(pct: number | undefined): 'ok' | 'high' | 'full' {
  if (pct === undefined) return 'ok'
  if (pct >= 100) return 'full'
  if (pct >= 80) return 'high'
  return 'ok'
}

/** Official quota meter (5h / week): label + %, tone by level, role=meter. Shared by the card and Conexões. */
export function QuotaMeter({ label, pct }: { readonly label: string; readonly pct: number }): ReactNode {
  const shown = Math.max(0, Math.round(pct))
  return (
    <div className={styles.meter} data-tone={quotaTone(pct)}>
      <span className={styles.meterLabel} aria-hidden="true">{label} · {shown}%</span>
      <span
        className={styles.meterTrack}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, shown)}
        aria-valuetext={`${shown}%`}
      >
        <span className={styles.meterFill} style={{ '--pct': `${Math.min(100, shown)}%` } as CSSProperties} />
      </span>
    </div>
  )
}

/** The shared data block: "agora", who can talk, presence/owner/substitute/project and the engine with its quota. */
export function PersonaCardFacts({ labels, now, talk, facts, engine, layout = 'card' }: PersonaCardFactsProps): ReactNode {
  const quota = engine?.quota
  const hasMeters = quota !== undefined && (quota.fiveHourPct !== undefined || quota.weekPct !== undefined)
  return (
    <div className={styles.facts} data-layout={layout}>
      <p className={styles.now} data-kind={now.kind}>
        <span className={styles.nowIcon} aria-hidden="true"><NowIcon kind={now.kind} /></span>
        <span className={styles.nowText}>
          <span className={styles.nowValue}>{now.text}</span>
          <span className={styles.nowCaption}>{labels.nowCaption}</span>
        </span>
      </p>

      {talk !== undefined && (
        <section className={styles.talk} aria-label={labels.talkTitle}>
          <div className={styles.talkHead}>
            <span className={styles.factLabel}>{labels.talkTitle}</span>
            {talk.onEdit !== undefined && (
              <button type="button" className={styles.linkButton} onClick={talk.onEdit}>{labels.talkEdit}</button>
            )}
          </div>
          <p className={styles.talkValue}>
            <span className={styles.talkIcon} aria-hidden="true">
              {talk.everyone ? <BrandIcon name="equipe" size={16} /> : <BrandIcon name="convidar" size={16} />}
            </span>
            {talk.value}
          </p>
        </section>
      )}

      <dl className={styles.factList}>
        {facts.map(fact => (
          <div key={fact.id} className={styles.fact} data-tone={fact.tone}>
            <dt className={styles.factLabel}>{fact.label}</dt>
            <dd className={styles.factValue}>{fact.value}</dd>
          </div>
        ))}
        {engine !== undefined && (
          <div className={`${styles.fact} ${styles.engineFact}`}>
            <dt className={styles.factLabel}>{labels.engine}</dt>
            <dd className={styles.factValue}>
              <span className={styles.engineValue}>
                <UiIcon name="sparkle" size={16} strokeWidth={2.2} />
                {humanizeEngineLabel(engine.value)}
              </span>
              {engine.activeAccountLabel !== undefined && engine.activeAccountLabel !== '' && (
                <span className={styles.activeAccount}>
                  {labels.activeAccount}: {engine.activeAccountLabel}
                </span>
              )}
              {engine.accountPolicyText !== undefined && engine.accountPolicyText !== '' && (
                <span className={styles.accountPolicy}>
                  <BrandIcon name="trocar-conta" size={14} />
                  {engine.accountPolicyText}
                </span>
              )}
              {hasMeters ? (
                <span className={styles.meters}>
                  {quota.fiveHourPct !== undefined && <QuotaMeter label={labels.quotaFiveHour} pct={quota.fiveHourPct} />}
                  {quota.weekPct !== undefined && <QuotaMeter label={labels.quotaWeek} pct={quota.weekPct} />}
                </span>
              ) : (
                <span className={styles.quotaUnavailable}>{labels.quotaUnavailable}</span>
              )}
              {quota?.limitText !== undefined && <span className={styles.limit} role="status">{quota.limitText}</span>}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

export interface PersonaCardBadge {
  readonly id: string
  readonly label: string
  /** "gestor": amber badge with the baton (GESTOR-SPEC — can hire and organise the team). */
  readonly tone?: 'gestor' | undefined
}

export interface PersonaCardProps extends PersonaCardFactsProps {
  readonly name: string
  /** "@nina" */
  readonly handle?: string | undefined
  readonly role: string
  readonly sector?: string | undefined
  readonly characterId?: string | undefined
  readonly presence: PersonaPresence
  /** "Coordena o time", "Vigia". */
  readonly badges?: readonly PersonaCardBadge[]
  readonly menu?: readonly PersonaCardMenuItem[]
  /** Sends to the persona's DM (and opens it). Omit to hide the field. */
  readonly onSendMessage?: ((text: string) => void) | undefined
  /** id for aria-labelledby of the surrounding dialog. */
  readonly nameId?: string | undefined
  /** Name becomes a link to the profile (1 click, UX-BACKLOG UX-04). */
  readonly onOpenProfile?: (() => void) | undefined
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

function CardMenu({ label, items }: { readonly label: string; readonly items: readonly PersonaCardMenuItem[] }): ReactNode {
  return <MenuButton className={styles.menuWrap} label={label} items={items} />
}

function CardComposer({ placeholder, sendLabel, onSend }: { readonly placeholder: string; readonly sendLabel: string; readonly onSend: (text: string) => void }): ReactNode {
  const [text, setText] = useState('')
  const submit = (): void => {
    const body = text.trim()
    if (body.length === 0) return
    onSend(body)
    setText('')
  }
  return (
    <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); submit() }}>
      <input
        className={styles.composerField}
        value={text}
        placeholder={`${placeholder}…`}
        aria-label={placeholder}
        onChange={(event) => { setText(event.target.value) }}
      />
      <IconButton
        type="submit"
        size="s"
        variant={text.trim().length > 0 ? 'primary' : 'ghost'}
        label={sendLabel}
        icon={<UiIcon name="send" size={18} strokeWidth={2.2} />}
        disabled={text.trim().length === 0}
      />
    </form>
  )
}

/** Full card: live-pose stage on the banner, identity, badges, the facts block and a message field. */
export function PersonaCard({
  name,
  handle,
  role,
  sector,
  characterId,
  presence,
  badges = [],
  menu = [],
  onSendMessage,
  nameId,
  onOpenProfile,
  labels,
  ...facts
}: PersonaCardProps): ReactNode {
  const fallbackId = useId()
  const titleId = nameId ?? fallbackId
  const animal = characterId?.replace(/-default$/u, '')
  const pose = animal !== undefined ? poseUrl(animal as PersonaCharacterId, NOW_POSE[facts.now.kind]) : undefined
  const portrait = animal !== undefined ? PORTRAITS[animal] : undefined
  const subtitle = [handle, role, sector].filter((part): part is string => part !== undefined && part.length > 0).join(' · ')

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.stage} aria-hidden="true">
        {ILLUSTRATIONS['team-banner-light'] !== undefined && <img className={styles.stageLight} src={ILLUSTRATIONS['team-banner-light']} alt="" />}
        {ILLUSTRATIONS['team-banner-dark'] !== undefined && <img className={styles.stageDark} src={ILLUSTRATIONS['team-banner-dark']} alt="" />}
        {pose !== undefined ? (
          <img key={facts.now.kind} className={styles.pose} data-kind={facts.now.kind} src={pose} alt="" />
        ) : (
          <span className={styles.portrait}><Avatar name={name} src={portrait} size={56} shape="portrait" decorative /></span>
        )}
      </div>
      {menu.length > 0 && <CardMenu label={labels.menu} items={menu} />}

      <div className={styles.body}>
        <header className={styles.identity}>
          <h2 id={titleId} className={styles.name}>
            {onOpenProfile === undefined ? name : <button type="button" className={styles.nameLink} onClick={onOpenProfile}>{name}</button>}
            <span className={styles.presence} data-presence={presence} title={labels.presence[presence]}>
              <span className={styles.srOnly}>{labels.presence[presence]}</span>
            </span>
          </h2>
          {subtitle.length > 0 && <p className={styles.subtitle}>{subtitle}</p>}
          {badges.length > 0 && (
            <ul className={styles.badges}>
              {badges.map(badge => (
                <li key={badge.id} className={styles.badge} data-tone={badge.tone}>
                  {badge.tone === 'gestor' ? <UiIcon name="baton" size={14} strokeWidth={2.2} /> : <BrandIcon name="equipe" size={14} />}
                  {badge.label}
                </li>
              ))}
            </ul>
          )}
        </header>
        <PersonaCardFacts labels={labels} {...facts} />
        {onSendMessage !== undefined && <CardComposer placeholder={labels.messagePlaceholder} sendLabel={labels.send} onSend={onSendMessage} />}
      </div>
    </article>
  )
}

export interface PersonaCardPopoverProps {
  readonly open: boolean
  /** The avatar/name the card belongs to. Focus returns here on close. */
  readonly anchor: HTMLElement | null
  readonly onClose: () => void
  /** Accessible name of the dialog (the persona name). */
  readonly label: string
  /** Move focus into the card (click/keyboard). Hover-open leaves focus where it is. */
  readonly focusOnOpen?: boolean
  readonly onPointerEnter?: (() => void) | undefined
  readonly onPointerLeave?: (() => void) | undefined
  readonly children: ReactNode
}

const GAP = 10
const MARGIN = 12

/** Non-modal dialog anchored next to the avatar (portaled to body so rail masks never clip it); Esc / outside click close; focus returns to the anchor. */
export function PersonaCardPopover({ open, anchor, onClose, label, focusOnOpen = false, onPointerEnter, onPointerLeave, children }: PersonaCardPopoverProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; side: 'right' | 'left' } | null>(null)

  useLayoutEffect(() => {
    if (!open || anchor === null) return undefined
    const place = (): void => {
      const panel = panelRef.current
      if (panel === null) return
      const rect = anchor.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const fitsRight = rect.right + GAP + width <= window.innerWidth - MARGIN
      const left = fitsRight ? rect.right + GAP : Math.max(MARGIN, rect.left - GAP - width)
      const top = Math.min(Math.max(MARGIN, rect.top - 24), Math.max(MARGIN, window.innerHeight - MARGIN - height))
      setPosition({ top, left, side: fitsRight ? 'right' : 'left' })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor])

  const placed = position !== null
  useEffect(() => {
    if (open && placed && focusOnOpen) panelRef.current?.focus()
  }, [open, placed, focusOnOpen])

  useEffect(() => {
    if (!open) return undefined
    const onDocumentKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      onClose()
      anchor?.focus()
    }
    document.addEventListener('keydown', onDocumentKey)
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (panelRef.current?.contains(target) === true || anchor?.contains(target) === true) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onDocumentKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, anchor, onClose])

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    event.preventDefault()
    onClose()
    anchor?.focus()
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget as Node | null
    if (next !== null && panelRef.current?.contains(next) !== true && anchor?.contains(next) !== true) onClose()
  }

  return createPortal(
    <div
      ref={panelRef}
      className={styles.popover}
      data-persona-root=""
      data-side={position?.side ?? 'right'}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={position === null ? { top: 0, left: 0, opacity: 0, pointerEvents: 'none' } : { top: position.top, left: position.left }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body,
  )
}

const HOVER_OPEN_MS = 450
const HOVER_CLOSE_MS = 220

export interface PersonaCardTriggerProps {
  readonly onClick: (event: MouseEvent<HTMLElement>) => void
  readonly onPointerEnter: (event: MouseEvent<HTMLElement>) => void
  readonly onPointerLeave: () => void
  readonly 'aria-haspopup': 'dialog'
  readonly 'aria-expanded': boolean
}

export interface PersonaCardController {
  readonly personaId: string | null
  /** Spread on any avatar/name button: click opens (focus moves in), hover opens after a short delay. */
  readonly triggerProps: (personaId: string) => PersonaCardTriggerProps
  readonly popoverProps: Omit<PersonaCardPopoverProps, 'label' | 'children'>
  readonly close: () => void
}

/** One card at a time for a whole surface (Prism mounts one controller globally). */
export function usePersonaCardController(): PersonaCardController {
  const [state, setState] = useState<{ personaId: string; anchor: HTMLElement; focus: boolean } | null>(null)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)

  const clearTimers = (): void => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
  }
  useEffect(() => clearTimers, [])

  const close = useCallback((): void => {
    clearTimers()
    setState(null)
  }, [])

  const scheduleClose = (): void => {
    window.clearTimeout(openTimer.current)
    closeTimer.current = window.setTimeout(() => {
      setState(current => (current?.focus === true ? current : null))
    }, HOVER_CLOSE_MS)
  }

  const triggerProps = (personaId: string): PersonaCardTriggerProps => ({
    'aria-haspopup': 'dialog',
    'aria-expanded': state?.personaId === personaId,
    onClick: (event) => {
      clearTimers()
      const anchor = event.currentTarget
      setState(current => (current?.personaId === personaId && current.focus ? null : { personaId, anchor, focus: true }))
    },
    onPointerEnter: (event) => {
      const anchor = event.currentTarget
      window.clearTimeout(closeTimer.current)
      window.clearTimeout(openTimer.current)
      openTimer.current = window.setTimeout(() => {
        setState(current => (current?.focus === true ? current : { personaId, anchor, focus: false }))
      }, HOVER_OPEN_MS)
    },
    onPointerLeave: scheduleClose,
  })

  return {
    personaId: state?.personaId ?? null,
    triggerProps,
    close,
    popoverProps: {
      open: state !== null,
      anchor: state?.anchor ?? null,
      focusOnOpen: state?.focus ?? false,
      onClose: close,
      onPointerEnter: () => { window.clearTimeout(closeTimer.current) },
      onPointerLeave: scheduleClose,
    },
  }
}
