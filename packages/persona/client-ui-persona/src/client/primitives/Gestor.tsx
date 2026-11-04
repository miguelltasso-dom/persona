/**
 * Função Gestor de equipe (BRIEFING 20, persona-spec/design/GESTOR-SPEC.md).
 * GestorSettings: switch + limits in plain language (persona editor).
 * GestorPlanCard: plan card in chat ("Vou contratar 3 personas e criar o quadro Site")
 * with Aprovar / Ajustar / Recusar; after approval, the stamp and outcome.
 */

import { useId, type ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { ApprovedStamp } from './Celebration.tsx'
import { ChoiceCards } from './ChoiceCards.tsx'
import { FlowIcon, UiIcon, type FlowModelId } from './icons.tsx'
import styles from './Gestor.module.css'

/* ───────────── Editor: switch + limits ───────────── */

export type GestorApproval = 'ask' | 'auto-within' | 'auto-notify'

export interface GestorLimitsValue {
  readonly approval: GestorApproval
  readonly maxPersonas: number
  /** Budget preset id from `budgetOptions`. */
  readonly budget: string
  /** Sector / project ids where this Gestor may act (empty = everywhere). */
  readonly areas: readonly string[]
  readonly canGrantGestor: boolean
}

export interface GestorSettingsProps {
  readonly personaName: string
  readonly enabled: boolean
  readonly onEnabledChange: (enabled: boolean) => void
  readonly value: GestorLimitsValue
  readonly onChange: (value: GestorLimitsValue) => void
  readonly budgetOptions: readonly { readonly id: string; readonly label: string; readonly hint: string }[]
  readonly areaOptions: readonly { readonly id: string; readonly label: string }[]
  readonly labels: {
    readonly title: string
    /** "Nina pode contratar personas, dar nome a elas e organizar onde cada uma trabalha." */
    readonly explain: (name: string) => string
    readonly approvalLegend: string
    readonly approval: Readonly<Record<GestorApproval, { readonly title: string; readonly body: string }>>
    readonly recommended: string
    readonly maxPersonas: string
    /** "Até {n} personas na equipe" */
    readonly maxPersonasValue: (n: number) => string
    readonly fewer: string
    readonly more: string
    readonly budget: string
    readonly areas: string
    readonly areasAll: string
    readonly canGrant: string
    readonly canGrantHint: string
    readonly ceiling: (name: string) => string
  }
}

export function GestorSettings({ personaName, enabled, onEnabledChange, value, onChange, budgetOptions, areaOptions, labels }: GestorSettingsProps): ReactNode {
  const id = useId()
  const set = (patch: Partial<GestorLimitsValue>): void => { onChange({ ...value, ...patch }) }
  return (
    <section className={styles.settings} aria-labelledby={`${id}-title`} data-on={enabled ? '' : undefined}>
      <div className={styles.switchRow}>
        <span className={styles.badgeIcon} aria-hidden="true"><UiIcon name="baton" size={20} strokeWidth={2.2} /></span>
        <div className={styles.switchText}>
          <h3 id={`${id}-title`} className={styles.title}>{labels.title}</h3>
          <p className={styles.explain}>{labels.explain(personaName)}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={`${id}-title`}
          className={styles.switch}
          onClick={() => { onEnabledChange(!enabled) }}
        >
          <span className={styles.knob} />
        </button>
      </div>
      {enabled && (
        <div className={styles.limits}>
          <ChoiceCards
            legend={labels.approvalLegend}
            name={`${id}-approval`}
            value={value.approval}
            onChange={(approval) => { set({ approval }) }}
            options={(['ask', 'auto-within', 'auto-notify'] as const).map(a => ({
              id: a,
              title: labels.approval[a].title,
              body: labels.approval[a].body,
              ...(a === 'ask' ? { badge: labels.recommended } : {}),
            }))}
          />
          <div className={styles.row}>
            <span className={styles.rowLabel} id={`${id}-max`}>{labels.maxPersonas}</span>
            <span className={styles.stepper} role="group" aria-labelledby={`${id}-max`}>
              <Button size="s" variant="secondary" aria-label={labels.fewer} disabled={value.maxPersonas <= 1} onClick={() => { set({ maxPersonas: value.maxPersonas - 1 }) }}>−</Button>
              <output className={styles.stepValue} aria-live="polite">{labels.maxPersonasValue(value.maxPersonas)}</output>
              <Button size="s" variant="secondary" aria-label={labels.more} disabled={value.maxPersonas >= 30} onClick={() => { set({ maxPersonas: value.maxPersonas + 1 }) }}>+</Button>
            </span>
          </div>
          <fieldset className={styles.fieldset}>
            <legend className={styles.rowLabel}>{labels.budget}</legend>
            <div className={styles.segmented}>
              {budgetOptions.map(option => (
                <label key={option.id} data-checked={value.budget === option.id ? '' : undefined} title={option.hint}>
                  <input type="radio" name={`${id}-budget`} checked={value.budget === option.id} onChange={() => { set({ budget: option.id }) }} />
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend className={styles.rowLabel}>{labels.areas}</legend>
            <div className={styles.chips}>
              <label data-checked={value.areas.length === 0 ? '' : undefined}>
                <input type="checkbox" checked={value.areas.length === 0} onChange={() => { set({ areas: [] }) }} />
                {labels.areasAll}
              </label>
              {areaOptions.map((area) => {
                const on = value.areas.includes(area.id)
                return (
                  <label key={area.id} data-checked={on ? '' : undefined}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => { set({ areas: on ? value.areas.filter(a => a !== area.id) : [...value.areas, area.id] }) }}
                    />
                    {area.label}
                  </label>
                )
              })}
            </div>
          </fieldset>
          <label className={styles.grant}>
            <input type="checkbox" checked={value.canGrantGestor} onChange={(event) => { set({ canGrantGestor: event.target.checked }) }} />
            <span>
              <b>{labels.canGrant}</b>
              <small>{labels.canGrantHint}</small>
            </span>
          </label>
          <p className={styles.ceiling}><UiIcon name="alert" size={14} strokeWidth={2.2} />{labels.ceiling(personaName)}</p>
        </div>
      )}
    </section>
  )
}

/* ───────────── Chat: plan card ───────────── */

export type GestorStepKind = 'hire' | 'board' | 'allocate' | 'sprint' | 'move' | 'pause'

export interface GestorPlanStep {
  readonly id: string
  readonly kind: GestorStepKind
  /** "Pipoca · Designer" */
  readonly title: string
  /** "gato · Claude · Sonnet · ferramentas: Figma, arquivos" */
  readonly detail?: string | undefined
  /** New persona portrait (hire). */
  readonly avatarSrc?: string | undefined
  /** Board model (board). */
  readonly flowModel?: FlowModelId | undefined
}

export interface GestorPlanCardProps {
  readonly gestor: { readonly name: string; readonly avatarSrc?: string | undefined }
  /** "Vou contratar 3 personas e criar o quadro Site." */
  readonly summary: string
  /** "Porque você pediu um time para o Site, e hoje ninguém cobre design." */
  readonly reason?: string | undefined
  readonly steps: readonly GestorPlanStep[]
  /** "≈ 40 tarefas médias por mês a mais" */
  readonly cost?: string | undefined
  readonly state: 'pending' | 'approved' | 'declined' | 'adjusting'
  readonly onApprove?: (() => void) | undefined
  readonly onAdjust?: (() => void) | undefined
  readonly onDecline?: (() => void) | undefined
  readonly labels: {
    /** "Plano do Atlas" */
    readonly title: (gestor: string) => string
    readonly kinds: Readonly<Record<GestorStepKind, string>>
    readonly approve: string
    readonly adjust: string
    readonly decline: string
    readonly approvedText: string
    readonly declinedText: string
    readonly adjustingText: string
    readonly stamp: string
  }
}

const STEP_ICON: Readonly<Record<GestorStepKind, ReactNode>> = {
  hire: <UiIcon name="sparkle" size={16} strokeWidth={2.2} />,
  board: <UiIcon name="check" size={16} strokeWidth={2.2} />,
  allocate: <UiIcon name="arrowRight" size={16} strokeWidth={2.2} />,
  sprint: <UiIcon name="clock" size={16} strokeWidth={2.2} />,
  move: <UiIcon name="arrowRight" size={16} strokeWidth={2.2} />,
  pause: <UiIcon name="close" size={16} strokeWidth={2.2} />,
}

export function GestorPlanCard({ gestor, summary, reason, steps, cost, state, onApprove, onAdjust, onDecline, labels }: GestorPlanCardProps): ReactNode {
  const titleId = useId()
  return (
    <article className={styles.plan} data-state={state} aria-labelledby={titleId}>
      <header className={styles.planHead}>
        <Avatar name={gestor.name} src={gestor.avatarSrc} size={32} shape="portrait" decorative />
        <span className={styles.planEyebrow} id={titleId}>
          <UiIcon name="baton" size={14} strokeWidth={2.4} />
          {labels.title(gestor.name)}
        </span>
      </header>
      <p className={styles.summary}>{summary}</p>
      {reason !== undefined && <p className={styles.reason}>{reason}</p>}
      <ol className={styles.steps}>
        {steps.map(step => (
          <li key={step.id} className={styles.step} data-kind={step.kind}>
            <span className={styles.stepVisual} aria-hidden="true">
              {step.kind === 'hire' && step.avatarSrc !== undefined
                ? <img src={step.avatarSrc} alt="" draggable={false} />
                : step.kind === 'board' && step.flowModel !== undefined
                  ? <FlowIcon model={step.flowModel} size={28} />
                  : STEP_ICON[step.kind]}
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepKind}>{labels.kinds[step.kind]}</span>
              <span className={styles.stepTitle}>{step.title}</span>
              {step.detail !== undefined && <span className={styles.stepDetail}>{step.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {cost !== undefined && <p className={styles.cost}>{cost}</p>}
      {state === 'pending' && (
        <div className={styles.planActions}>
          {onApprove !== undefined && <Button variant="primary" onClick={onApprove}>{labels.approve}</Button>}
          {onAdjust !== undefined && <Button variant="secondary" onClick={onAdjust}>{labels.adjust}</Button>}
          {onDecline !== undefined && <Button variant="ghost" onClick={onDecline}>{labels.decline}</Button>}
        </div>
      )}
      {state === 'approved' && (
        <div className={styles.outcome} role="status">
          <ApprovedStamp label={labels.stamp} />
          <span>{labels.approvedText}</span>
        </div>
      )}
      {state === 'declined' && <p className={styles.outcome} role="status">{labels.declinedText}</p>}
      {state === 'adjusting' && <p className={styles.outcome} role="status">{labels.adjustingText}</p>}
    </article>
  )
}
