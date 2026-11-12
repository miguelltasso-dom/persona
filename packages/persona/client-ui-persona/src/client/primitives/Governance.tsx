/**
 * Governance primitives (GOVERNANCE.md / GOVERNANCE-SPEC.md, Muse): "Quem cuida de quem" org chart with an
 * accessible list mode, team-health score and items in plain language, and the "Teste dos 2 dias" timeline.
 * Presentation only — callers pass translated labels and already-grouped data (by person or by sector).
 */

import type { CSSProperties, ReactNode } from 'react'
import { AVATAR_96, ILLUSTRATIONS, OVERLAY_ICONS } from '../assets/generated-imports.ts'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import type { PersonaCardTriggerProps, PersonaFaceTriggers } from './PersonaCard.tsx'
import { PersonaFaceCell } from './PersonaFaceCell.tsx'
import { UiIcon, type UiIconName } from './icons.tsx'
import { OrgMap, type OrgMapLabels } from './OrgMap.tsx'
import { useCountTo } from './use-count-to.ts'
import styles from './Governance.module.css'

export type OrgPersonaState = 'working' | 'reviewing' | 'waiting' | 'resting' | 'stuck' | 'offline'

const STATE_ICON: Readonly<Record<OrgPersonaState, keyof typeof OVERLAY_ICONS | undefined>> = {
  working: 'typing-dots',
  reviewing: 'review-loupe',
  waiting: 'approval-badge',
  resting: 'zzz',
  stuck: 'error-badge',
  offline: undefined,
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

export interface OrgPersona {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly characterId?: string | undefined
  readonly state: OrgPersonaState
  /** Sector name shown after the role ("Pesquisa · Produto"). */
  readonly sector?: string | undefined
  /** Translated state label (always shown to assistive tech; visible on hover). */
  readonly stateLabel: string
  /** Has Gestor de equipe: baton mark + short "Gestor" in the accessible name. */
  readonly gestor?: boolean
  /** Translated short badge (default "Gestor"). */
  readonly gestorLabel?: string | undefined
}

export interface OrgGroup {
  readonly id: string
  /** Person name (by person) or sector name (by sector). */
  readonly title: string
  /** Sector (by person) or "3 personas" (by sector). */
  readonly subtitle?: string | undefined
  readonly kind: 'person' | 'sector'
  /** Sector icon for kind=sector (BrandIcon/SectorIcon node). */
  readonly icon?: ReactNode
  /** Highlight: "fora" (on leave) / "sem responsável" etc. */
  readonly badge?: ReactNode
  readonly members: readonly OrgPersona[]
}

export interface OrgChartProps {
  /** The persona with Coordenação ("seu braço direito"). */
  readonly root?: (OrgPersona & { readonly caption: string }) | undefined
  readonly groups: readonly OrgGroup[]
  readonly mode: 'chart' | 'list'
  readonly label: string
  readonly onSelectPersona?: ((id: string) => void) | undefined
  readonly onSelectGroup?: ((id: string) => void) | undefined
  /** Persona card trigger (usePersonaCardController().triggerProps): click opens the card, hover previews it. */
  readonly cardTrigger?: ((personaId: string) => PersonaCardTriggerProps) | undefined
  /** CV-4: com isto, clicar no rosto abre a DM e o ⋯ ao lado abre o cartão (manda sobre `cardTrigger`). */
  readonly faces?: PersonaFaceTriggers | undefined
  /** Labels for the large-team map (search, zoom, minimap…); pt-BR defaults when omitted. */
  readonly scaleLabels?: OrgMapLabels | undefined
}

/** Above this many personas the chart becomes the zoomable, searchable OrgMap (Miguel: 60–150+). */
export const ORG_MAP_THRESHOLD = 24

function PersonaCard({ persona, onSelect, cardTrigger, faces, compact = false }: {
  readonly persona: OrgPersona
  readonly onSelect?: ((id: string) => void) | undefined
  readonly cardTrigger?: ((personaId: string) => PersonaCardTriggerProps) | undefined
  readonly faces?: PersonaFaceTriggers | undefined
  readonly compact?: boolean
}): ReactNode {
  // Gallery refs arrive as 'atlas-default'; portraits are keyed by the bare animal id.
  const portrait = persona.characterId !== undefined ? PORTRAITS[persona.characterId.replace(/-default$/u, '')] : undefined
  const icon = STATE_ICON[persona.state]
  const button = (
    <button
      type="button"
      className={compact ? `${styles.persona} ${styles.personaCompact}` : styles.persona}
      data-state={persona.state}
      aria-label={`${persona.name}${persona.gestor === true ? ` (${persona.gestorLabel ?? 'Gestor'})` : ''}, ${persona.role} — ${persona.stateLabel}`}
      title={persona.stateLabel}
      {...(faces === undefined ? { onClick: () => { onSelect?.(persona.id) }, ...cardTrigger?.(persona.id) } : faces.face(persona.id))}
    >
      <span className={styles.personaAvatar}>
        <Avatar name={persona.name} src={portrait} shape="portrait" size={40} decorative />
        {persona.gestor === true && <span className={styles.gestorMark} aria-hidden="true"><UiIcon name="baton" size={11} strokeWidth={2.6} /></span>}
        <span className={styles.seal} data-state={persona.state} aria-hidden="true">
          {icon !== undefined && <img src={OVERLAY_ICONS[icon]} alt="" />}
        </span>
      </span>
      <span className={styles.personaText} aria-hidden="true">
        <span className={styles.personaName}>{persona.name}</span>
        <span className={styles.personaRole}>{persona.sector === undefined || persona.sector === persona.role ? persona.role : `${persona.role} · ${persona.sector}`}</span>
      </span>
    </button>
  )
  return (
    <PersonaFaceCell personaId={persona.id} personaName={persona.name} menu={faces?.menu} menuLabel={faces?.menuLabel}>
      {button}
    </PersonaFaceCell>
  )
}

/** "Quem cuida de quem": right hand on top, people/sectors below, personas hanging from each. */
export function OrgChart({ root, groups, mode, label, onSelectPersona, onSelectGroup, cardTrigger, faces, scaleLabels }: OrgChartProps): ReactNode {
  const total = groups.reduce((sum, g) => sum + g.members.length, 0)
  if (total > ORG_MAP_THRESHOLD) {
    return <OrgMap root={root} groups={groups} mode={mode} label={label} onSelectPersona={onSelectPersona} cardTrigger={cardTrigger as never} faces={faces} labels={scaleLabels} />
  }
  if (mode === 'list') {
    return (
      <div className={styles.list} role="region" aria-label={label}>
        {root !== undefined && (
          <p className={styles.listRoot}>
            <PersonaCard persona={root} onSelect={onSelectPersona} cardTrigger={cardTrigger} faces={faces} />
            <span className={styles.listCaption}>{root.caption}</span>
          </p>
        )}
        <ul className={styles.listGroups}>
          {groups.map(group => (
            <li key={group.id}>
              <h3 className={styles.listGroupTitle}>
                {group.title}
                {group.subtitle !== undefined && <span className={styles.listGroupSubtitle}>{group.subtitle}</span>}
                {group.badge}
              </h3>
              <ul className={styles.listMembers}>
                {group.members.map(persona => (
                  <li key={persona.id}><PersonaCard persona={persona} onSelect={onSelectPersona} cardTrigger={cardTrigger} faces={faces} compact /></li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className={styles.chart} role="region" aria-label={label} tabIndex={0}>
      {root !== undefined && (
        <div className={styles.rootRow}>
          <div className={styles.rootCard}>
            <PersonaCard persona={root} onSelect={onSelectPersona} cardTrigger={cardTrigger} faces={faces} />
            <span className={styles.rootCaption}>{root.caption}</span>
          </div>
        </div>
      )}
      <ul className={styles.groups} style={{ '--groups': groups.length } as CSSProperties} data-has-root={root !== undefined ? '' : undefined}>
        {groups.map(group => (
          <li key={group.id} className={styles.group}>
            <button type="button" className={styles.groupCard} data-kind={group.kind} onClick={() => { onSelectGroup?.(group.id) }}>
              {group.kind === 'person' ? (
                <Avatar name={group.title} size={32} shape="person" decorative />
              ) : (
                <span className={styles.sectorIcon} aria-hidden="true">{group.icon ?? <UiIcon name="more" size={18} />}</span>
              )}
              <span className={styles.groupText}>
                <span className={styles.groupTitle}>{group.title}</span>
                {group.subtitle !== undefined && <span className={styles.groupSubtitle}>{group.subtitle}</span>}
              </span>
              {group.badge}
            </button>
            <ul className={styles.members}>
              {group.members.map(persona => (
                <li key={persona.id} className={styles.member}>
                  <PersonaCard persona={persona} onSelect={onSelectPersona} cardTrigger={cardTrigger} faces={faces} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type HealthLevel = 'good' | 'attention' | 'risk'

const HEALTH_ICON: Readonly<Record<HealthLevel, UiIconName>> = { good: 'check', attention: 'clock', risk: 'alert' }

/** Brush art per verdict; the "Teste dos 2 dias" uses `TWO_DAY_ART`. */
const HEALTH_ART: Readonly<Record<HealthLevel, string | undefined>> = {
  good: ILLUSTRATIONS['equipe-saudavel'],
  attention: ILLUSTRATIONS['ponto-unico-falha'],
  risk: ILLUSTRATIONS['ponto-unico-falha'],
}

/** "Você de férias" (Brush) for the two-day test card header. */
export const TWO_DAY_ART: string | undefined = ILLUSTRATIONS['voce-de-ferias']

/** Semicircle meter for the overall score (0–100), stroke-drawn in our line; value in Fredoka. */
function HealthGauge({ score, label }: { readonly score: number; readonly label: string }): ReactNode {
  const value = Math.max(0, Math.min(100, Math.round(score)))
  const arc = Math.PI * 40
  // The arc travels with a CSS transition and the number with the same curve (420 ms) when the host recalculates the grade; the meter's own
  // value is the real one from the first instant.
  const drawn = useCountTo(value)
  return (
    <div className={styles.gauge} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <svg viewBox="0 0 100 58" aria-hidden="true" focusable="false">
        <path className={styles.gaugeTrack} d="M10 50 A40 40 0 0 1 90 50" pathLength={arc} />
        <path className={styles.gaugeFill} d="M10 50 A40 40 0 0 1 90 50" pathLength={arc} style={{ strokeDasharray: `${(arc * value) / 100} ${arc}` }} />
      </svg>
      <span className={styles.gaugeValue} aria-hidden="true">{drawn}</span>
      <span className={styles.gaugeLabel} aria-hidden="true">{label}</span>
    </div>
  )
}

/**
 * Overall team-health verdict in plain language (big, honest, one sentence) with an optional 0–100 meter.
 * `illustration={null}` hides the art; by default the Brush art follows the level, kept small so the
 * two-day test and its one-click fixes stay above the fold.
 */
export function HealthScore({ level, title, body, illustration, score, scoreLabel }: {
  readonly level: HealthLevel
  readonly title: ReactNode
  readonly body?: ReactNode
  readonly illustration?: string | null | undefined
  /** 0–100; omit when the host has no score (never invent one). */
  readonly score?: number | undefined
  /** "Nota da equipe" — accessible name of the meter. */
  readonly scoreLabel?: string | undefined
}): ReactNode {
  const art = illustration === null ? undefined : (illustration ?? HEALTH_ART[level])
  return (
    <section className={styles.score} data-level={level}>
      {score !== undefined && <HealthGauge score={score} label={scoreLabel ?? ''} />}
      <div className={styles.scoreText}>
        <span className={styles.scoreBadge} aria-hidden="true"><UiIcon name={HEALTH_ICON[level]} size={20} strokeWidth={2.6} /></span>
        <h2 className={styles.scoreTitle}>{title}</h2>
        {body !== undefined && <p className={styles.scoreBody}>{body}</p>}
      </div>
      {art !== undefined && <img className={styles.scoreArt} src={art} alt="" aria-hidden="true" />}
    </section>
  )
}

/** One actionable health finding: level icon + plain sentence + why + one-click fix. */
export function HealthItem({ level, title, detail, actionLabel, onAction }: {
  readonly level: HealthLevel
  readonly title: ReactNode
  readonly detail?: ReactNode
  readonly actionLabel?: string | undefined
  readonly onAction?: (() => void) | undefined
}): ReactNode {
  return (
    <li className={styles.item} data-level={level}>
      <span className={styles.itemIcon} aria-hidden="true"><UiIcon name={HEALTH_ICON[level]} size={16} strokeWidth={2.6} /></span>
      <div className={styles.itemText}>
        <p className={styles.itemTitle}>{title}</p>
        {detail !== undefined && <p className={styles.itemDetail}>{detail}</p>}
      </div>
      {actionLabel !== undefined && onAction !== undefined && (
        <Button size="s" variant={level === 'risk' ? 'primary' : 'secondary'} onClick={onAction}>{actionLabel}</Button>
      )}
    </li>
  )
}

export type TwoDayOutcome = 'runs' | 'waits' | 'stops'

export interface TwoDayRow {
  readonly id: string
  /** "Responder clientes (Sol)", or the persona's name when `role` is given. */
  readonly label: string
  /** The persona's role, drawn after the name ("Luna · Vigia"): the name always comes first. */
  readonly role?: string | undefined
  /** The persona's face (32 px) or the team icon for a row that is not a persona's. */
  readonly face?: ReactNode
  /** Outcome per half-day slot (4 slots = 2 days); waits/stops say why. */
  readonly slots: readonly TwoDayOutcome[]
  /** Plain-language reason shown under the row ("espera sua aprovação"). */
  readonly reason?: string | undefined
  readonly fixLabel?: string | undefined
  readonly onFix?: (() => void) | undefined
}

/** "Teste dos 2 dias": what keeps running, waits for approval, or stops while you are offline. */
export function TwoDayTimeline({ rows, slotLabels, legend, label, legendArt }: {
  readonly rows: readonly TwoDayRow[]
  /** e.g. ["Dia 1 · manhã", "Dia 1 · tarde", "Dia 2 · manhã", "Dia 2 · tarde"] */
  readonly slotLabels: readonly string[]
  readonly legend: Readonly<Record<TwoDayOutcome, string>>
  readonly label: string
  /** Small illustration beside the legend (≤120px tall). */
  readonly legendArt?: ReactNode
}): ReactNode {
  return (
    <section className={styles.timeline} aria-label={label}>
      <div className={styles.timelineHead} aria-hidden="true">
        <span />
        {slotLabels.map(slot => <span key={slot} className={styles.slotLabel}>{slot}</span>)}
      </div>
      <ul className={styles.timelineRows}>
        {rows.map((row, rowIndex) => (
          <li
            key={row.id}
            className={styles.timelineRow}
            data-two-day-row=""
            data-row-id={row.id}
            // The bars turn green one row after another (45 ms apart) when a fix lands: the slot's transition reads this index.
            style={{ '--two-day-index': rowIndex } as CSSProperties}
          >
            <div className={styles.rowLabel}>
              {row.face !== undefined && <span className={styles.rowFace}>{row.face}</span>}
              <span className={styles.rowText}>
                <span className={styles.rowName}>
                  {row.label}
                  {row.role !== undefined && <span className={styles.rowRole}> · {row.role}</span>}
                </span>
                {row.reason !== undefined && <span className={styles.rowReason}>{row.reason}</span>}
              </span>
              {row.fixLabel !== undefined && row.onFix !== undefined && (
                <Button size="s" variant="secondary" onClick={row.onFix}>{row.fixLabel}</Button>
              )}
            </div>
            {row.slots.map((outcome, index) => (
              <span
                key={index}
                className={styles.slot}
                data-outcome={outcome}
                role="img"
                aria-label={`${slotLabels[index] ?? ''}: ${legend[outcome]}`}
              >
                <UiIcon name={outcome === 'runs' ? 'check' : outcome === 'waits' ? 'clock' : 'close'} size={14} strokeWidth={2.6} />
              </span>
            ))}
          </li>
        ))}
      </ul>
      <div className={styles.legendRow}>
        <p className={styles.legend}>
          {(['runs', 'waits', 'stops'] as const).map(outcome => (
            <span key={outcome} className={styles.legendItem}>
              <span className={styles.legendSwatch} data-outcome={outcome} aria-hidden="true" />
              {legend[outcome]}
            </span>
          ))}
        </p>
        {legendArt !== undefined && <span className={styles.legendArt}>{legendArt}</span>}
      </div>
    </section>
  )
}
