/** Customizable persona editor preview (mock draft). */

import { useState, type ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaButton } from '../primitives/index.ts'
import {
  MOCK_PERSONA_DRAFT,
  type AttentionBudgetTier,
  type AutonomyLevel,
  type AvatarSource,
  type PersonaDraft,
  type ToolAccessLevel,
} from './persona-draft.ts'
import styles from './PersonaEditor.module.css'

export interface PersonaEditorProps {
  readonly dict: LocaleDict
  readonly initial?: PersonaDraft
  /** Persists draft (Connected path: autonomy tier via host `setAutonomy`). */
  readonly onSave?: (draft: PersonaDraft) => void | Promise<void>
  readonly onCancel?: () => void
}

const LEVELS: readonly ToolAccessLevel[] = ['none', 'read', 'write']
const AVATARS: readonly AvatarSource[] = ['gallery', 'upload', 'silhouette']
const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ['on-request', 'propose', 'act-within-limits']
const ATTENTION_TIERS: readonly AttentionBudgetTier[] = ['quiet', 'balanced', 'active']

const AUTONOMY_LABEL: Readonly<Record<AutonomyLevel, string>> = {
  'on-request': 'field.autonomy.onRequest',
  propose: 'field.autonomy.propose',
  'act-within-limits': 'field.autonomy.actWithinLimits',
}

const ATTENTION_LABEL: Readonly<Record<AttentionBudgetTier, string>> = {
  quiet: 'field.attention.quiet',
  balanced: 'field.attention.balanced',
  active: 'field.attention.active',
}

/** Persona editor with gallery/upload/silhouette and system role toggles. */
export function PersonaEditor({
  dict,
  initial = MOCK_PERSONA_DRAFT,
  onSave,
  onCancel,
}: PersonaEditorProps): ReactNode {
  const [draft, setDraft] = useState(initial)
  const t = (key: string) => bindLocale(dict, key)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0 })

  const patch = (partial: Partial<PersonaDraft>): void => {
    setDraft(current => ({ ...current, ...partial }))
  }

  return (
    <div className={styles.editor} ref={motion.ref} style={motion.style}>
      <h1 className={styles.title}>{t('title.edit')}</h1>
      <section className={styles.section} aria-labelledby="persona-identity">
        <h2 id="persona-identity" className={styles.sectionTitle}>{t('section.identity')}</h2>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.name')}</span>
          <input className={styles.input} value={draft.name} onChange={(e) => { patch({ name: e.target.value }) }} />
        </label>
        <div className={styles.avatarChoices} role="group" aria-label={t('field.avatarGallery')}>
          {AVATARS.map(source => (
            <button
              key={source}
              type="button"
              className={styles.chip}
              aria-pressed={draft.avatarSource === source}
              onClick={() => { patch({ avatarSource: source }) }}
            >
              {t(source === 'gallery' ? 'field.avatarGallery' : source === 'upload' ? 'field.avatarUpload' : 'field.avatarSilhouette')}
            </button>
          ))}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="persona-role">
        <h2 id="persona-role" className={styles.sectionTitle}>{t('section.role')}</h2>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.jobTitle')}</span>
          <input className={styles.input} value={draft.jobTitle} onChange={(e) => { patch({ jobTitle: e.target.value }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.jobDescription')}</span>
          <textarea
            className={styles.textarea}
            value={draft.jobDescription}
            onChange={(e) => { patch({ jobDescription: e.target.value }) }}
          />
        </label>
      </section>
      <section className={styles.section} aria-labelledby="persona-behavior">
        <h2 id="persona-behavior" className={styles.sectionTitle}>{t('section.behavior')}</h2>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.personality')}</span>
          <textarea className={styles.textarea} value={draft.personality} onChange={(e) => { patch({ personality: e.target.value }) }} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.instructions')}</span>
          <textarea className={styles.textarea} value={draft.instructions} onChange={(e) => { patch({ instructions: e.target.value }) }} />
        </label>
      </section>
      <section className={styles.section} aria-labelledby="persona-exec">
        <h2 id="persona-exec" className={styles.sectionTitle}>{t('section.execution')}</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>{t('field.harness')}</span>
            <input className={styles.input} value={draft.harness} onChange={(e) => { patch({ harness: e.target.value }) }} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('field.model')}</span>
            <input className={styles.input} value={draft.model} onChange={(e) => { patch({ model: e.target.value }) }} />
          </label>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="persona-tools">
        <h2 id="persona-tools" className={styles.sectionTitle}>{t('section.tools')}</h2>
        {(['filesystem', 'shell', 'web'] as const).map(tool => (
          <label key={tool} className={styles.field}>
            <span className={styles.label}>{tool}</span>
            <select
              className={styles.select}
              value={draft[tool]}
              onChange={(e) => { patch({ [tool]: e.target.value as ToolAccessLevel }) }}
            >
              {LEVELS.map(level => (
                <option key={level} value={level}>
                  {t(level === 'none' ? 'field.toolLevel.none' : level === 'read' ? 'field.toolLevel.read' : 'field.toolLevel.write')}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>
      <section className={styles.section} aria-labelledby="persona-skills">
        <h2 id="persona-skills" className={styles.sectionTitle}>{t('section.skills')}</h2>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.skills')}</span>
          <input className={styles.input} value={draft.skills} onChange={(e) => { patch({ skills: e.target.value }) }} />
        </label>
      </section>
      <section className={styles.section} aria-labelledby="persona-proactivity">
        <h2 id="persona-proactivity" className={styles.sectionTitle}>{t('section.proactivity')}</h2>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.autonomyLevel')}</span>
          <select
            className={styles.select}
            value={draft.autonomyLevel}
            onChange={(e) => { patch({ autonomyLevel: e.target.value as AutonomyLevel }) }}
          >
            {AUTONOMY_LEVELS.map(level => (
              <option key={level} value={level}>
                {t(AUTONOMY_LABEL[level])}
              </option>
            ))}
          </select>
          <span className={styles.hint}>{t('field.autonomyHint')}</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('field.attentionBudget')}</span>
          <select
            className={styles.select}
            value={draft.attentionBudget}
            onChange={(e) => { patch({ attentionBudget: e.target.value as AttentionBudgetTier }) }}
          >
            {ATTENTION_TIERS.map(tier => (
              <option key={tier} value={tier}>
                {t(ATTENTION_LABEL[tier])}
              </option>
            ))}
          </select>
          <span className={styles.hint}>{t('field.attentionBudgetHint')}</span>
        </label>
      </section>
      <section className={styles.section} aria-labelledby="persona-limits">
        <h2 id="persona-limits" className={styles.sectionTitle}>{t('section.limits')}</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>{t('field.tokenLimit')}</span>
            <input className={styles.input} value={draft.tokenLimit} onChange={(e) => { patch({ tokenLimit: e.target.value }) }} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('field.responseLimit')}</span>
            <input className={styles.input} value={draft.responseLimit} onChange={(e) => { patch({ responseLimit: e.target.value }) }} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('field.concurrency')}</span>
            <input className={styles.input} value={draft.concurrency} onChange={(e) => { patch({ concurrency: e.target.value }) }} />
          </label>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="persona-system">
        <h2 id="persona-system" className={styles.sectionTitle}>{t('section.systemRoles')}</h2>
        <div className={styles.toggleRow}>
          <span>{t('field.coordination')}</span>
          <input
            type="checkbox"
            checked={draft.coordination}
            onChange={(e) => { patch({ coordination: e.target.checked }) }}
            aria-label={t('field.coordination')}
          />
        </div>
        <div className={styles.toggleRow}>
          <span>{t('field.watchdog')}</span>
          <input
            type="checkbox"
            checked={draft.watchdog}
            onChange={(e) => { patch({ watchdog: e.target.checked }) }}
            aria-label={t('field.watchdog')}
          />
        </div>
      </section>
      <div className={styles.previewCard} aria-label={t('preview.label')}>
        <div className={styles.previewName}>{draft.name}</div>
        <div className={styles.previewRole}>{draft.jobTitle}</div>
      </div>
      <div className={styles.actions}>
        <PersonaButton
          type="button"
          onClick={() => { void onSave?.(draft) }}
        >
          {t('action.save')}
        </PersonaButton>
        <PersonaButton type="button" variant="secondary" onClick={() => { onCancel?.() }}>
          {t('action.cancel')}
        </PersonaButton>
      </div>
    </div>
  )
}
