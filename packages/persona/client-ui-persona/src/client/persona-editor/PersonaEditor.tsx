/**
 * "Monte sua equipe" showcase — persona editor (Muse presentation; draft/RPC owned by Prism).
 * Two columns: form in sticker cards + sticky live preview with the chosen animal's pose.
 */

import { useId, useState, type ReactNode } from 'react'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { personaAvatarUploadHostReady } from '../chat/composer-host-capabilities.ts'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Avatar, BrandIcon, Button, Card, Chip, GestorSettings, Input, Sparkle, Tabs, Textarea, UiIcon, type ChipTone } from '../primitives/index.ts'
import {
  MOCK_PERSONA_DRAFT,
  type AttentionBudgetTier,
  type AutonomyLevel,
  type AvatarSource,
  type PersonaDraft,
  type ToolAccessLevel,
} from './persona-draft.ts'
import { KanbanFilterField } from '../kanban/KanbanFilterField.tsx'
import type { GovernancePickOption } from '../governance/governance-picklists.ts'
import styles from './PersonaEditor.module.css'

export interface PersonaEditorGovernanceUi {
  readonly sectors: readonly GovernancePickOption[]
  readonly members: readonly GovernancePickOption[]
}

/** One runner/harness choice with the hints Rivet measures (speed, "laziness" grade). */
export interface RunnerOptionUi {
  readonly id: string
  readonly label: string
  readonly speed?: 'fast' | 'medium' | 'slow' | undefined
  readonly grade?: 'strong' | 'fair' | 'weak' | undefined
  readonly connected: boolean
  readonly recommended?: boolean | undefined
}

/** Fallback catalogue until Prism wires live connections + laziness hints. */
const DEFAULT_RUNNERS: readonly RunnerOptionUi[] = [
  { id: 'dsh', label: 'Harness DeepSeek', speed: 'fast', connected: true, recommended: true },
  { id: 'oar:claude', label: 'Claude', speed: 'medium', connected: true },
  { id: 'oar:codex', label: 'Codex', speed: 'medium', connected: true },
  { id: 'oar:cursor', label: 'Cursor', speed: 'medium', connected: false },
  { id: 'oar:opencode', label: 'OpenCode', speed: 'slow', connected: false },
]

export interface PersonaEditorProps {
  readonly dict: LocaleDict
  readonly initial?: PersonaDraft
  /** New persona (hire) vs editing an existing one. */
  readonly mode?: 'new' | 'edit'
  /** Persists draft (Connected path: autonomy tier via host `setAutonomy`). */
  readonly onSave?: (draft: PersonaDraft) => void | Promise<void>
  readonly onCancel?: () => void
  /** Conversational builder: description → draft (Prism wires to the coordination/draft driver). */
  readonly onDraftFromDescription?: ((description: string) => Promise<PersonaDraft | null> | PersonaDraft | null) | undefined
  readonly runners?: readonly RunnerOptionUi[] | undefined
  readonly governance?: PersonaEditorGovernanceUi | undefined
  /** Setores + projetos for Gestor "Onde pode agir" chips. */
  readonly gestorAreaOptions?: readonly { readonly id: string; readonly label: string }[] | undefined
}

const GALLERY: readonly string[] = [
  'atlas', 'bento', 'nina', 'sol', 'luna', 'capivara', 'cervo', 'coelho', 'coruja',
  'guaxinim', 'lobo-guara', 'lontra', 'ourico', 'panda', 'raposa', 'tamandua', 'tucano',
]
const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>
/** Widened to boolean: the capability flag flips when the host supports avatar upload. */
const TOOLS = ['filesystem', 'shell', 'web'] as const
const LEVELS: readonly ToolAccessLevel[] = ['none', 'read', 'write']
const AUTONOMY: readonly { level: AutonomyLevel; label: string; desc: string; icon: 'clock' | 'sparkle' | 'arrowRight' }[] = [
  { level: 'on-request', label: 'field.autonomy.onRequest', desc: 'autonomy.onRequest.desc', icon: 'clock' },
  { level: 'propose', label: 'field.autonomy.propose', desc: 'autonomy.propose.desc', icon: 'sparkle' },
  { level: 'act-within-limits', label: 'field.autonomy.actWithinLimits', desc: 'autonomy.act.desc', icon: 'arrowRight' },
]
const ATTENTION: readonly { tier: AttentionBudgetTier; label: string }[] = [
  { tier: 'quiet', label: 'field.attention.quiet' },
  { tier: 'balanced', label: 'field.attention.balanced' },
  { tier: 'active', label: 'field.attention.active' },
]
const LEVEL_LABEL: Readonly<Record<ToolAccessLevel, string>> = {
  none: 'field.toolLevel.none',
  read: 'field.toolLevel.read',
  write: 'field.toolLevel.write',
}
const GRADE_TONE: Readonly<Record<'strong' | 'fair' | 'weak', ChipTone>> = { strong: 'success', fair: 'warning', weak: 'danger' }

/** Persona editor: builder, gallery with live pose, plain-language tools, runner hints, autonomy, system roles. */
export function PersonaEditor({
  dict,
  initial = MOCK_PERSONA_DRAFT,
  mode = 'edit',
  onSave,
  onCancel,
  onDraftFromDescription,
  runners = DEFAULT_RUNNERS,
  governance,
  gestorAreaOptions = [],
}: PersonaEditorProps): ReactNode {
  const uploadReady = personaAvatarUploadHostReady()
  const [draft, setDraft] = useState(initial)
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0 })
  const idBase = useId()

  const patch = (partial: Partial<PersonaDraft>): void => {
    setDraft(current => ({ ...current, ...partial }))
  }

  const animal = draft.avatarSource === 'gallery' ? (draft.avatarRef ?? draft.name.trim().toLowerCase()) : undefined
  const pose = animal !== undefined ? poseUrl(animal as PersonaCharacterId, 'acenando') : undefined
  const portrait = animal !== undefined ? PORTRAITS[animal] : undefined
  const enabledTools = TOOLS.filter(tool => draft[tool] !== 'none')

  const generate = async (): Promise<void> => {
    if (onDraftFromDescription === undefined || description.trim().length === 0) return
    setDrafting(true)
    try {
      const next = await onDraftFromDescription(description.trim())
      if (next !== null) setDraft(next)
    } finally {
      setDrafting(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave?.(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page} data-persona-root="" ref={motion.ref} style={motion.style}>
      <header className={styles.header}>
        <span className={styles.badge} aria-hidden="true"><BrandIcon name="equipe" size={22} /></span>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1 className={styles.title}>{mode === 'new' ? t('title.new') : t('title.edit')}</h1>
          <p className={styles.subtitle}>{mode === 'new' ? t('subtitle.new') : t('subtitle.edit')}</p>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.form}>
          {onDraftFromDescription !== undefined && (
            <Card as="section" tone="accent" titleAs="h2" title={(
              <span className={styles.titleWithIcon}><Sparkle size={18} />{t('builder.title')}</span>
            )}>
              <p className={styles.cardHint}>{t('builder.hint')}</p>
              <div className={styles.builderRow}>
                <Textarea
                  label={t('builder.title')}
                  hideLabel
                  rows={2}
                  value={description}
                  placeholder={t('builder.placeholder')}
                  onChange={(event) => { setDescription(event.target.value) }}
                />
                <Button
                  variant="secondary"
                  icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
                  loading={drafting}
                  disabled={description.trim().length === 0}
                  onClick={() => { void generate() }}
                >
                  {t('builder.action')}
                </Button>
              </div>
            </Card>
          )}

          <Card as="section" titleAs="h2" eyebrow={t('section.identity')} title={t('avatar.label')}>
            <div className={styles.stack}>
              <Input label={t('field.name')} value={draft.name} onChange={(event) => { patch({ name: event.target.value }) }} />
              <Tabs<AvatarSource>
                label={t('avatar.tabs')}
                idPrefix={`${idBase}-avatar`}
                value={draft.avatarSource}
                onChange={(source) => { patch({ avatarSource: source }) }}
                items={[
                  { id: 'gallery', label: t('field.avatarGallery') },
                  { id: 'upload', label: uploadReady ? t('field.avatarUpload') : t('field.avatarUploadSoon'), disabled: !uploadReady },
                  { id: 'silhouette', label: t('field.avatarSilhouette') },
                ]}
              />
              <div role="tabpanel" id={`${idBase}-avatar-panel-${draft.avatarSource}`} aria-labelledby={`${idBase}-avatar-tab-${draft.avatarSource}`}>
                {draft.avatarSource === 'gallery' && (
                  <ul className={styles.gallery} aria-label={t('avatar.pick')}>
                    {GALLERY.map(id => (
                      <li key={id}>
                        <button
                          type="button"
                          className={styles.animal}
                          aria-pressed={animal === id}
                          aria-label={t(`animal.${id}`)}
                          title={t(`animal.${id}`)}
                          onClick={() => { patch({ avatarRef: id }) }}
                        >
                          {PORTRAITS[id] !== undefined && <img src={PORTRAITS[id]} alt="" draggable={false} />}
                          {animal === id && <span className={styles.animalCheck} aria-hidden="true"><UiIcon name="check" size={14} strokeWidth={3} /></span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.avatarSource === 'upload' && (
                  <label className={styles.upload} data-disabled={uploadReady ? undefined : ''}>
                    <span className={styles.uploadIcon} aria-hidden="true"><UiIcon name="image" size={26} /></span>
                    <span className={styles.uploadText}>
                      <strong>{uploadReady ? t('avatar.uploadAction') : t('field.avatarUploadSoon')}</strong>
                      <span>{t('avatar.uploadHint')}</span>
                    </span>
                    <input className="persona-sr-only" type="file" accept="image/png,image/jpeg" disabled={!uploadReady} />
                  </label>
                )}
                {draft.avatarSource === 'silhouette' && (
                  <p className={styles.cardHint}>{t('avatar.silhouetteHint')}</p>
                )}
              </div>
            </div>
          </Card>

          <Card as="section" titleAs="h2" title={t('section.role')}>
            <div className={styles.stack}>
              <Input label={t('field.jobTitle')} value={draft.jobTitle} onChange={(event) => { patch({ jobTitle: event.target.value }) }} />
              <Textarea label={t('field.jobDescription')} rows={3} value={draft.jobDescription} onChange={(event) => { patch({ jobDescription: event.target.value }) }} />
            </div>
          </Card>

          <Card as="section" titleAs="h2" title={t('section.behavior')}>
            <div className={styles.stack}>
              <Textarea label={t('field.personality')} rows={2} value={draft.personality} onChange={(event) => { patch({ personality: event.target.value }) }} />
              <Textarea label={t('field.instructions')} rows={3} value={draft.instructions} onChange={(event) => { patch({ instructions: event.target.value }) }} />
            </div>
          </Card>

          <Card as="section" titleAs="h2" title={t('section.tools')}>
            <ul className={styles.tools}>
              {TOOLS.map(tool => (
                <li key={tool} className={styles.toolRow}>
                  <div className={styles.toolText}>
                    <span className={styles.toolName} id={`${idBase}-${tool}`}>{t(`tool.${tool}`)}</span>
                    <span className={styles.toolDesc}>{t(`tool.${tool}.${draft[tool]}`)}</span>
                  </div>
                  <div className={styles.segmented} role="radiogroup" aria-labelledby={`${idBase}-${tool}`}>
                    {LEVELS.map(level => (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={draft[tool] === level}
                        className={styles.segment}
                        data-level={level}
                        onClick={() => { patch({ [tool]: level }) }}
                      >
                        {t(LEVEL_LABEL[level])}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section" titleAs="h2" eyebrow={t('section.execution')} title={t('runner.label')}>
            <p className={styles.cardHint}>{t('runner.hint')}</p>
            <div className={styles.runners} role="radiogroup" aria-label={t('runner.label')}>
              {runners.map(runner => (
                <button
                  key={runner.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.harness === runner.id}
                  className={styles.runner}
                  data-disconnected={runner.connected ? undefined : ''}
                  onClick={() => { patch({ harness: runner.id }) }}
                >
                  <span className={styles.runnerName}>
                    {runner.label}
                    {runner.recommended === true && <Chip size="s" tone="accent">{t('runner.recommended')}</Chip>}
                  </span>
                  <span className={styles.runnerChips}>
                    {runner.speed !== undefined && <Chip size="s" tone="plain" icon={<UiIcon name="clock" size={12} strokeWidth={2.4} />}>{t(`runner.speed.${runner.speed}`)}</Chip>}
                    <Chip size="s" tone={runner.grade !== undefined ? GRADE_TONE[runner.grade] : 'neutral'}>
                      {t(`runner.grade.${runner.grade ?? 'unknown'}`)}
                    </Chip>
                    {!runner.connected && <Chip size="s" tone="neutral">{t('runner.disconnected')}</Chip>}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.modelRow}>
              <Input label={t('field.model')} value={draft.model} onChange={(event) => { patch({ model: event.target.value }) }} />
            </div>
          </Card>

          <Card as="section" titleAs="h2" title={t('section.proactivity')}>
            <p className={styles.cardHint}>{t('field.autonomyHint')}</p>
            <div className={styles.options} role="radiogroup" aria-label={t('field.autonomyLevel')}>
              {AUTONOMY.map(option => (
                <button
                  key={option.level}
                  type="button"
                  role="radio"
                  aria-checked={draft.autonomyLevel === option.level}
                  className={styles.option}
                  onClick={() => { patch({ autonomyLevel: option.level }) }}
                >
                  <span className={styles.optionIcon} aria-hidden="true"><UiIcon name={option.icon} size={18} strokeWidth={2.2} /></span>
                  <span className={styles.optionLabel}>{t(option.label)}</span>
                  <span className={styles.optionDesc}>{t(option.desc)}</span>
                </button>
              ))}
            </div>
            <p className={styles.subLabel} id={`${idBase}-attention`}>{t('field.attentionBudget')}</p>
            <div className={styles.segmentedWide} role="radiogroup" aria-labelledby={`${idBase}-attention`}>
              {ATTENTION.map(option => (
                <button
                  key={option.tier}
                  type="button"
                  role="radio"
                  aria-checked={draft.attentionBudget === option.tier}
                  className={styles.segment}
                  onClick={() => { patch({ attentionBudget: option.tier }) }}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
            <p className={styles.cardHint}>{t('field.attentionBudgetHint')}</p>
          </Card>

          {governance !== undefined && (
            <Card as="section" titleAs="h2" title={t('section.governance')}>
              <p className={styles.cardHint}>{t('section.governanceHint')}</p>
              <div className={styles.grid3}>
                <KanbanFilterField
                  id={`${idBase}-sector`}
                  label={t('field.sector')}
                  value={draft.sectorId}
                  onChange={(event) => { patch({ sectorId: event.target.value }) }}
                >
                  {governance.sectors.map(row => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </KanbanFilterField>
                <KanbanFilterField
                  id={`${idBase}-responsible`}
                  label={t('field.responsible')}
                  value={draft.responsibleMemberId}
                  onChange={(event) => { patch({ responsibleMemberId: event.target.value }) }}
                >
                  {governance.members.map(row => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </KanbanFilterField>
                <KanbanFilterField
                  id={`${idBase}-substitute`}
                  label={t('field.substitute')}
                  value={draft.substituteMemberId}
                  onChange={(event) => { patch({ substituteMemberId: event.target.value }) }}
                >
                  <option value="">{t('field.substituteNone')}</option>
                  {governance.members.map(row => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </KanbanFilterField>
              </div>
            </Card>
          )}

          <Card as="section" titleAs="h2" title={t('section.systemRoles')}>
            <ul className={styles.roles}>
              {(['coordination', 'watchdog'] as const).map(role => (
                <li key={role} className={styles.roleRow}>
                  <div className={styles.toolText}>
                    <span className={styles.toolName}>{t(`field.${role}`)}</span>
                    <span className={styles.toolDesc}>{t(`role.${role}.desc`)}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft[role]}
                    aria-label={t(`field.${role}`)}
                    className={styles.switch}
                    onClick={() => { patch({ [role]: !draft[role] }) }}
                  >
                    <span className={styles.switchKnob} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <GestorSettings
            personaName={draft.name.trim().length > 0 ? draft.name.trim() : t('gestor.unnamed')}
            enabled={draft.teamManager}
            onEnabledChange={(teamManager) => { patch({ teamManager }) }}
            value={draft.gestorLimits}
            onChange={(gestorLimits) => { patch({ gestorLimits }) }}
            budgetOptions={[
              { id: 'pouco', label: t('gestor.budget.pouco'), hint: t('gestor.budget.poucoHint') },
              { id: 'normal', label: t('gestor.budget.normal'), hint: t('gestor.budget.normalHint') },
              { id: 'bastante', label: t('gestor.budget.bastante'), hint: t('gestor.budget.bastanteHint') },
            ]}
            areaOptions={gestorAreaOptions}
            labels={{
              title: t('gestor.title'),
              explain: name => t('gestor.explain', { name }),
              approvalLegend: t('gestor.approvalLegend'),
              approval: {
                ask: { title: t('gestor.approval.ask.title'), body: t('gestor.approval.ask.body') },
                'auto-within': { title: t('gestor.approval.autoWithin.title'), body: t('gestor.approval.autoWithin.body') },
                'auto-notify': { title: t('gestor.approval.autoNotify.title'), body: t('gestor.approval.autoNotify.body') },
              },
              recommended: t('gestor.recommended'),
              maxPersonas: t('gestor.maxPersonas'),
              maxPersonasValue: n => t('gestor.maxPersonasValue', { n: String(n) }),
              fewer: t('gestor.fewer'),
              more: t('gestor.more'),
              budget: t('gestor.budgetLegend'),
              areas: t('gestor.areas'),
              areasAll: t('gestor.areasAll'),
              canGrant: t('gestor.canGrant'),
              canGrantHint: t('gestor.canGrantHint'),
              ceiling: name => t('gestor.ceiling', { name }),
            }}
          />

          <Card as="section" titleAs="h2" title={t('section.limits')}>
            <div className={styles.grid3}>
              <Input label={t('field.tokenLimit')} inputMode="numeric" value={draft.tokenLimit} onChange={(event) => { patch({ tokenLimit: event.target.value }) }} />
              <Input label={t('field.responseLimit')} inputMode="numeric" value={draft.responseLimit} onChange={(event) => { patch({ responseLimit: event.target.value }) }} />
              <Input label={t('field.concurrency')} inputMode="numeric" value={draft.concurrency} onChange={(event) => { patch({ concurrency: event.target.value }) }} />
            </div>
          </Card>
        </div>

        <aside className={styles.previewCol} aria-label={t('preview.label')}>
          <div className={styles.preview}>
            <p className={styles.previewEyebrow}>{t('preview.eyebrow')}</p>
            <div className={styles.previewStage}>
              {ILLUSTRATIONS['team-banner-light'] !== undefined && <img className={styles.stageLight} src={ILLUSTRATIONS['team-banner-light']} alt="" aria-hidden="true" />}
              {ILLUSTRATIONS['team-banner-dark'] !== undefined && <img className={styles.stageDark} src={ILLUSTRATIONS['team-banner-dark']} alt="" aria-hidden="true" />}
              {pose !== undefined ? (
                <img key={animal} className={styles.previewPose} src={pose} alt="" aria-hidden="true" />
              ) : (
                <span className={styles.previewSilhouette} aria-hidden="true" />
              )}
            </div>
            <div className={styles.previewIdentity}>
              <Avatar name={draft.name.length > 0 ? draft.name : '?'} src={portrait} shape={portrait !== undefined ? 'portrait' : 'person'} size={48} decorative />
              <div>
                <p className={styles.previewName}>{draft.name}</p>
                <p className={styles.previewRole}>{draft.jobTitle}</p>
              </div>
            </div>
            <div className={styles.previewChips}>
              {draft.coordination && <Chip size="s" tone="brand">{t('field.coordination')}</Chip>}
              {draft.watchdog && <Chip size="s" tone="brand">{t('field.watchdog')}</Chip>}
              {draft.teamManager && <Chip size="s" tone="plain">{t('gestor.badge')}</Chip>}
              <Chip size="s" tone="plain">{t(AUTONOMY.find(option => option.level === draft.autonomyLevel)?.label ?? 'field.autonomy.propose')}</Chip>
            </div>
            <p className={styles.previewLabel}>{t('preview.tools')}</p>
            <p className={styles.previewTools}>
              {enabledTools.length === 0 ? t('preview.noTools') : enabledTools.map(tool => `${t(`tool.${tool}`)} · ${t(LEVEL_LABEL[draft[tool]])}`).join('  ·  ')}
            </p>
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={() => { onCancel?.() }}>{t('action.cancel')}</Button>
        <Button variant="primary" size="l" loading={saving} disabled={draft.name.trim().length === 0} onClick={() => { void save() }}>
          {t('action.save')}
        </Button>
      </footer>
    </div>
  )
}
