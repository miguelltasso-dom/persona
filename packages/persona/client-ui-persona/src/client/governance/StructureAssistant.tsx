/**
 * "Monte uma equipe que faça sentido" — four-step structure assistant (GOVERNANCE.md §2, GOV-8).
 * Uses Muse governance primitives for preview; recommendation logic is deterministic until host GOV-5.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, ChoiceCards, Chip, OrgChart, ScreenHeader, Textarea, TwoDayTimeline, UiIcon } from '../primitives/index.ts'
import { DEFAULT_SECTORS } from './default-sectors.ts'
import { applyStructurePlan } from './fetch-apply-structure.ts'
import { resolveStructurePlan } from './fetch-recommend-structure.ts'
import { COMPANY_MODEL_IDS, recommendStructure } from './recommend-structure.ts'
import type { CompanyModelId, RecommendedPersona, StructurePlan } from './structure-types.ts'
import { structurePlanToOrgPreview, structurePlanToTwoDayRows } from './structure-to-preview.ts'
import styles from './StructureAssistant.module.css'

export interface StructureAssistantProps {
  readonly dict: LocaleDict
  /** Human caretaker display name (onboarding) or member id label. */
  readonly humanLabel: string
  readonly compact?: boolean | undefined
  readonly onSkip?: (() => void) | undefined
  readonly onHireOne?: ((role: RecommendedPersona, plan: StructurePlan) => void) | undefined
  readonly onHireAll?: ((plan: StructurePlan) => void | Promise<void>) | undefined
  /** Onboarding: apply roster drafts to store. */
  readonly onApplyRoster?: ((plan: StructurePlan) => void) | undefined
  /** When set, step 4 plan prefers Anvil `recommendStructure` (GOV-5). */
  readonly structureRemote?: {
    readonly client: PersonaRemoteClient
    readonly workspaceId: string
  } | undefined
}

const SLOT_KEYS = ['twoDay.slot1', 'twoDay.slot2', 'twoDay.slot3', 'twoDay.slot4'] as const

export function StructureAssistant({
  dict,
  humanLabel,
  compact = false,
  onSkip,
  onHireOne,
  onHireAll,
  onApplyRoster,
  structureRemote,
}: StructureAssistantProps): ReactNode {
  const t = (key: string, params?: Record<string, string | number>) => bindLocale(dict, key, params)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [applyingRoster, setApplyingRoster] = useState(false)
  const [companyModel, setCompanyModel] = useState<CompanyModelId>('agency')
  const [activeSectorIds, setActiveSectorIds] = useState<readonly string[]>(() =>
    DEFAULT_SECTORS.map(row => row.id),
  )
  const [weeklyWorkNotes, setWeeklyWorkNotes] = useState('')

  const input = useMemo(
    () => ({ companyModel, activeSectorIds, weeklyWorkNotes }),
    [companyModel, activeSectorIds, weeklyWorkNotes],
  )
  const localPlan = useMemo(() => recommendStructure(input), [input])
  const [plan, setPlan] = useState(localPlan)
  useEffect(() => {
    setPlan(localPlan)
    let cancelled = false
    void resolveStructurePlan(
      structureRemote?.client,
      structureRemote?.workspaceId,
      input,
    ).then((next) => {
      if (!cancelled) setPlan(next)
    })
    return () => { cancelled = true }
  }, [input, localPlan, structureRemote?.client, structureRemote?.workspaceId])

  const orgPreview = useMemo(
    () => structurePlanToOrgPreview(plan, dict, humanLabel),
    [plan, dict, humanLabel],
  )
  const twoDayRows = useMemo(() => structurePlanToTwoDayRows(plan, dict), [plan, dict])

  const toggleSector = (id: string): void => {
    setActiveSectorIds(current =>
      current.includes(id) ? current.filter(row => row !== id) : [...current, id],
    )
  }

  const stepChips = (
    <div className={styles.steps} aria-label={t('steps.label')}>
      {([1, 2, 3, 4] as const).map(n => (
        <span key={n} className={styles.stepChip} data-active={step === n ? '' : undefined}>
          {t(`steps.${n}`)}
        </span>
      ))}
    </div>
  )

  const wrapClass = compact ? `${styles.wrap} ${styles.compact}` : styles.wrap

  return (
    <div className={wrapClass} data-step={step}>
      {compact ? (
        <header className={styles.header}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.hint}>{t(`step${step}.hint`)}</p>
          {stepChips}
        </header>
      ) : (
        // Aberto como tela ("Contratar persona"): o mesmo cabeçalho das outras telas (ícone, eyebrow, título, subtítulo).
        <div className={styles.header}>
          <ScreenHeader icon="equipe" eyebrow={t('eyebrow')} title={t('title')} subtitle={t(`step${step}.hint`)} />
          {stepChips}
        </div>
      )}

      {step === 1 && (
        <ChoiceCards<CompanyModelId>
          legend={t('step1.modelsLabel')}
          hideLegend
          name="structure-company-model"
          value={companyModel}
          onChange={setCompanyModel}
          options={COMPANY_MODEL_IDS.map(id => ({ id, title: t(`model.${id}`), body: t(`model.${id}.body`) }))}
        />
      )}

      {step === 2 && (
        <>
          <p className={styles.hint}>{t('step2.sectorsHint')}</p>
          <ul className={styles.sectorList}>
            {DEFAULT_SECTORS.map(row => (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.sectorToggle}
                  aria-pressed={activeSectorIds.includes(row.id)}
                  onClick={() => { toggleSector(row.id) }}
                >
                  <Chip size="m" tone={activeSectorIds.includes(row.id) ? 'brand' : 'plain'}>
                    {t(row.labelKey)}
                  </Chip>
                </button>
              </li>
            ))}
          </ul>
          <Textarea
            label={t('step2.weeklyLabel')}
            value={weeklyWorkNotes}
            rows={4}
            onChange={(event) => { setWeeklyWorkNotes(event.target.value) }}
            placeholder={t('step2.weeklyPlaceholder')}
          />
        </>
      )}

      {step === 3 && (
        <>
          {plan.explanation !== undefined && plan.explanation.length > 0 && (
            <p className={styles.hint}>{plan.explanation}</p>
          )}
          <ul className={styles.rationale}>
            {plan.rationaleKeys.map(key => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <p className={styles.tip}>{t('tip.rcd')}</p>
        </>
      )}

      {step === 4 && (
        <div className={styles.previewBlock}>
          <OrgChart
            root={orgPreview.root}
            groups={orgPreview.groups}
            mode="chart"
            label={t('preview.orgLabel')}
          />
          <TwoDayTimeline
            rows={twoDayRows}
            slotLabels={SLOT_KEYS.map(key => t(key))}
            legend={{
              runs: t('twoDay.legend.runs'),
              waits: t('twoDay.legend.waits'),
              stops: t('twoDay.legend.stops'),
            }}
            label={t('twoDay.label')}
          />
          <p className={styles.tip}>{t('step4.hireHint')}</p>
          {onHireOne !== undefined && (
            <ul className={styles.hireList} aria-label={t('step4.hireListLabel')}>
              {plan.personas.map(row => (
                <li key={row.id} className={styles.hireRow}>
                  <span className={styles.hireWho}>
                    <span className={styles.hireName}>{row.name}</span>
                    <span className={styles.hireRole}>{row.jobTitle}</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="s"
                    aria-label={t('action.hireRowLabel', { name: row.name })}
                    onClick={() => { onHireOne(row, plan) }}
                  >
                    {t('action.hireRow')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className={styles.actions}>
        {onSkip !== undefined && (
          <Button variant="ghost" onClick={onSkip}>{t('action.skip')}</Button>
        )}
        {step > 1 && (
          <Button variant="secondary" onClick={() => { setStep((step - 1) as 1 | 2 | 3 | 4) }}>
            {t('action.back')}
          </Button>
        )}
        {step < 4 && (
          <Button
            variant="primary"
            iconEnd={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />}
            onClick={() => { setStep((step + 1) as 1 | 2 | 3 | 4) }}
          >
            {t('action.continue')}
          </Button>
        )}
        {step === 4 && (
          <>
            {onApplyRoster !== undefined && (
              <Button
                variant="secondary"
                disabled={applyingRoster}
                onClick={() => {
                  void (async () => {
                    if (structureRemote !== undefined) {
                      setApplyingRoster(true)
                      try {
                        await applyStructurePlan(
                          structureRemote.client,
                          structureRemote.workspaceId,
                          input,
                        )
                      } finally {
                        setApplyingRoster(false)
                      }
                    }
                    onApplyRoster(plan)
                  })()
                }}
              >
                {t('action.applyRoster')}
              </Button>
            )}
            {onHireAll !== undefined && (
              <Button
                variant="primary"
                icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
                onClick={() => { void onHireAll(plan) }}
              >
                {t('action.hireAll')}
              </Button>
            )}
          </>
        )}
      </footer>
    </div>
  )
}
