/**
 * "Traga o que suas IAs já sabem" (BRIEFING 18, BRING-YOUR-CONTEXT.md; spec design/BRING-CONTEXT-SPEC.md — Muse).
 * CopyPrompt: one ready prompt + "where to paste" tabs + copy with spoken feedback.
 * PasteBox: big paste field; each paste becomes a source chip ("ChatGPT · 1.240 caracteres").
 * FolderDrop: drag a vault folder or choose it (Electron picker), with reading/summary/ignored states.
 * ProposalReview: accept / edit / discard / private per item, (incerto) highlighted, sensitive data blocked by default.
 */

import { useId, useState, type DragEvent, type ReactNode } from 'react'
import { BrandIcon, UiIcon } from './icons.tsx'
import { Button, IconButton } from './Button.tsx'
import { Chip, type ChipTone } from './Chip.tsx'
import { Textarea } from './Field.tsx'
import { Tabs } from './Tabs.tsx'
import styles from './BringContext.module.css'

/* ───────────── Copy the prompt ───────────── */

export type AiSource = 'chatgpt' | 'claude' | 'gemini' | 'other'
export const AI_SOURCES: readonly AiSource[] = ['chatgpt', 'claude', 'gemini', 'other']

export interface CopyPromptProps {
  readonly prompt: string
  readonly source: AiSource
  readonly onSourceChange: (source: AiSource) => void
  readonly labels: {
    readonly title: string
    readonly lead: string
    readonly sources: Readonly<Record<AiSource, string>>
    /** Where-to-paste hint per source ("No ChatGPT: abra uma conversa nova, cole e envie…"). */
    readonly hints: Readonly<Record<AiSource, string>>
    readonly copy: string
    readonly copied: string
    readonly showAll: string
    readonly showLess: string
    readonly tabsLabel: string
  }
  /** Clipboard writer (Electron clipboard in the app; navigator.clipboard elsewhere). */
  readonly writeClipboard?: ((text: string) => Promise<void>) | undefined
}

export function CopyPrompt({ prompt, source, onSourceChange, labels, writeClipboard }: CopyPromptProps): ReactNode {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const previewId = useId()
  const copy = async (): Promise<void> => {
    const write = writeClipboard ?? (async (text: string) => { await navigator.clipboard.writeText(text) })
    try {
      await write(prompt)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 2400)
    } catch {
      setExpanded(true)
    }
  }
  return (
    <section className={styles.block} aria-labelledby={`${previewId}-title`}>
      <div className={styles.blockHead}>
        <span className={styles.step} aria-hidden="true">1</span>
        <div>
          <h3 id={`${previewId}-title`} className={styles.blockTitle}>{labels.title}</h3>
          <p className={styles.lead}>{labels.lead}</p>
        </div>
      </div>
      <Tabs
        label={labels.tabsLabel}
        idPrefix={`${previewId}-src`}
        value={source}
        onChange={onSourceChange}
        items={AI_SOURCES.map(id => ({ id, label: labels.sources[id] }))}
      />
      <p className={styles.hint} id={`${previewId}-src-panel-${source}`} role="tabpanel" aria-labelledby={`${previewId}-src-tab-${source}`}>
        {labels.hints[source]}
      </p>
      <div className={styles.prompt} data-expanded={expanded ? '' : undefined}>
        <pre id={previewId} className={styles.promptText} tabIndex={0}>{prompt}</pre>
        <div className={styles.promptActions}>
          <Button
            variant={copied ? 'secondary' : 'primary'}
            icon={<UiIcon name={copied ? 'check' : 'copy'} size={18} strokeWidth={2.2} />}
            onClick={() => { void copy() }}
          >
            {copied ? labels.copied : labels.copy}
          </Button>
          <button type="button" className={styles.linkButton} aria-expanded={expanded} aria-controls={previewId} onClick={() => { setExpanded(value => !value) }}>
            {expanded ? labels.showLess : labels.showAll}
          </button>
          <span className="persona-sr-only" role="status" aria-live="polite">{copied ? labels.copied : ''}</span>
        </div>
      </div>
    </section>
  )
}

/* ───────────── Paste the answers ───────────── */

export interface PastedSource {
  readonly id: string
  readonly source: AiSource
  readonly chars: number
}

export interface PasteBoxProps {
  readonly value: string
  readonly onChange: (text: string) => void
  /** Adds the current text as one source and clears the field (one paste per AI). */
  readonly onAdd: () => void
  readonly pasted: readonly PastedSource[]
  readonly onRemove: (id: string) => void
  readonly labels: {
    readonly title: string
    readonly field: string
    readonly placeholder: string
    readonly add: string
    readonly sources: Readonly<Record<AiSource, string>>
    /** "{chars} caracteres" formatter. */
    readonly chars: (n: number) => string
    readonly remove: (source: string) => string
    readonly listLabel: string
  }
}

export function PasteBox({ value, onChange, onAdd, pasted, onRemove, labels }: PasteBoxProps): ReactNode {
  const titleId = useId()
  return (
    <section className={styles.block} aria-labelledby={titleId}>
      <div className={styles.blockHead}>
        <span className={styles.step} aria-hidden="true">2</span>
        <h3 id={titleId} className={styles.blockTitle}>{labels.title}</h3>
      </div>
      <Textarea label={labels.field} hideLabel rows={6} value={value} placeholder={labels.placeholder} onChange={(event) => { onChange(event.target.value) }} />
      <div className={styles.pasteRow}>
        {pasted.length > 0 && (
          <ul className={styles.sourceList} aria-label={labels.listLabel}>
            {pasted.map(item => (
              <li key={item.id} className={styles.sourceChip}>
                <UiIcon name="check" size={14} strokeWidth={2.6} />
                <span>{labels.sources[item.source]} · {labels.chars(item.chars)}</span>
                <IconButton size="s" variant="ghost" label={labels.remove(labels.sources[item.source])} icon={<UiIcon name="close" size={14} />} onClick={() => { onRemove(item.id) }} />
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" disabled={value.trim().length === 0} onClick={onAdd}>{labels.add}</Button>
      </div>
    </section>
  )
}

/* ───────────── Vault folder ───────────── */

export type FolderDropState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading'; readonly done: number; readonly total?: number | undefined }
  | { readonly kind: 'ready'; readonly folderName: string; readonly notes: number; readonly ignored: readonly string[] }
  | { readonly kind: 'error'; readonly message: string }

export interface FolderDropProps {
  readonly state: FolderDropState
  /** Electron native picker (Prism/Lumen). Omit → button hidden (no dead control). */
  readonly onChoose?: (() => void) | undefined
  /** Dropped folder path (Electron gives File.path for directories). */
  readonly onDropPath?: ((path: string) => void) | undefined
  readonly onClear?: (() => void) | undefined
  readonly labels: {
    readonly title: string
    readonly drop: string
    readonly dropHint: string
    readonly choose: string
    readonly reading: (done: number, total?: number) => string
    readonly ready: (folder: string, notes: number) => string
    readonly ignored: (n: number) => string
    readonly clear: string
  }
}

export function FolderDrop({ state, onChoose, onDropPath, onClear, labels }: FolderDropProps): ReactNode {
  const [over, setOver] = useState(false)
  const titleId = useId()
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setOver(false)
    const file: (File & { readonly path?: string }) | undefined = event.dataTransfer.files[0]
    if (file?.path !== undefined && file.path !== '') onDropPath?.(file.path)
  }
  return (
    <section className={styles.block} aria-labelledby={titleId}>
      <div className={styles.blockHead}>
        <span className={styles.step} aria-hidden="true">
          <BrandIcon name="arquivos" size={16} />
        </span>
        <h3 id={titleId} className={styles.blockTitle}>{labels.title}</h3>
      </div>
      <div
        className={styles.drop}
        data-over={over ? '' : undefined}
        data-state={state.kind}
        onDragOver={(event) => { event.preventDefault(); setOver(true) }}
        onDragLeave={() => { setOver(false) }}
        onDrop={onDrop}
      >
        {state.kind === 'ready' ? (
          <>
            <span className={styles.dropIcon} aria-hidden="true"><UiIcon name="check" size={22} strokeWidth={2.6} /></span>
            <p className={styles.dropTitle} role="status">{labels.ready(state.folderName, state.notes)}</p>
            {state.ignored.length > 0 && (
              <details className={styles.ignored}>
                <summary>{labels.ignored(state.ignored.length)}</summary>
                <ul>{state.ignored.slice(0, 50).map(path => <li key={path}>{path}</li>)}</ul>
              </details>
            )}
            {onClear !== undefined && <button type="button" className={styles.linkButton} onClick={onClear}>{labels.clear}</button>}
          </>
        ) : state.kind === 'reading' ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.dropTitle} role="status">{labels.reading(state.done, state.total)}</p>
          </>
        ) : (
          <>
            <span className={styles.dropIcon} aria-hidden="true"><BrandIcon name="arquivos" size={26} /></span>
            <p className={styles.dropTitle}>{labels.drop}</p>
            <p className={styles.dropHint}>{state.kind === 'error' ? state.message : labels.dropHint}</p>
            {onChoose !== undefined && <Button variant="secondary" onClick={onChoose}>{labels.choose}</Button>}
          </>
        )}
      </div>
    </section>
  )
}

/* ───────────── Review before saving ───────────── */

export type ProposalKind = 'brief' | 'constraint' | 'decision' | 'memory'
/** `pending`: the person has not chosen yet (rules arrive this way: nothing binds the team without an explicit accept). */
export type ProposalDecision = 'accept' | 'discard' | 'pending'

export interface ContextProposal {
  readonly id: string
  readonly kind: ProposalKind
  readonly text: string
  /** "colado do ChatGPT em 03/11", "vault: notas/clientes.md" */
  readonly provenance: string
  readonly uncertain?: boolean
  /** Detected sensitive data ("parece um CPF") → blocked until the person unblocks. */
  readonly sensitive?: string | undefined
  /** Duplicate of / conflicts with something already in the Cofre. */
  readonly conflict?: string | undefined
  /** `duplicate`: the chip reads "Já existe: {conflict}". `question`: `conflict` already is the sentence to answer (a pinned decision). */
  readonly conflictKind?: 'duplicate' | 'question' | undefined
}

export interface ProposalChoice {
  readonly decision: ProposalDecision
  readonly private: boolean
  readonly text: string
  readonly unblocked?: boolean
}

/** Rules and decisions the person is about to make binding (accepted `constraint` rows): the count the notice states. */
export function acceptedConstraintCount(
  proposals: readonly ContextProposal[],
  choiceOf: (proposal: ContextProposal) => ProposalChoice,
): number {
  return proposals.filter(p => p.kind === 'constraint' && choiceOf(p).decision === 'accept' && (p.sensitive === undefined || choiceOf(p).unblocked === true)).length
}

export interface ProposalReviewProps {
  readonly proposals: readonly ContextProposal[]
  readonly choices: Readonly<Record<string, ProposalChoice>>
  readonly onChoice: (id: string, choice: ProposalChoice) => void
  readonly onSave: () => void
  readonly saving?: boolean
  readonly labels: {
    readonly kinds: Readonly<Record<ProposalKind, string>>
    readonly accept: string
    readonly discard: string
    readonly edit: string
    readonly done: string
    readonly private: string
    readonly uncertain: string
    readonly sensitiveBlocked: (why: string) => string
    readonly unblock: string
    readonly conflict: (what: string) => string
    readonly acceptClean: string
    /** "Gravar {n} no Cofre" */
    readonly save: (n: number) => string
    /** "{accepted} aceitos · {flagged} pedem atenção · {discarded} descartados" */
    readonly summary: (accepted: number, flagged: number, discarded: number) => string
    /** "2 regras serão obrigatórias para a equipe ao gravar" — what the accepted rules make binding. */
    readonly constraintNotice?: ((count: number) => string) | undefined
    /** Group header button: "Aceitar todas as regras (3)". */
    readonly acceptAllRules?: ((count: number) => string) | undefined
    /** Save bar while rules wait: "Faltam 3 regras para você escolher". */
    readonly pendingRules?: ((count: number) => string) | undefined
    /** Under a rule nobody chose yet: "Regras sem escolha não entram". */
    readonly pendingRuleNote?: string | undefined
  }
}

const KIND_TONE: Readonly<Record<ProposalKind, ChipTone>> = { brief: 'neutral', constraint: 'accent', decision: 'brand', memory: 'info' }
const KIND_ORDER: readonly ProposalKind[] = ['brief', 'constraint', 'decision', 'memory']

/** Default: clean items accepted; uncertain/conflicting items wait for a look; sensitive ones discarded+blocked. */
export function defaultChoice(proposal: ContextProposal): ProposalChoice {
  const flagged = proposal.sensitive !== undefined
  // A rule makes something mandatory for the whole team: it waits for an explicit accept (saving is not one).
  if (!flagged && proposal.kind === 'constraint') return { decision: 'pending', private: false, text: proposal.text }
  return { decision: flagged ? 'discard' : 'accept', private: false, text: proposal.text }
}

export function ProposalReview({ proposals, choices, onChoice, onSave, saving = false, labels }: ProposalReviewProps): ReactNode {
  const [editing, setEditing] = useState<string | null>(null)
  const choiceOf = (proposal: ContextProposal): ProposalChoice => choices[proposal.id] ?? defaultChoice(proposal)
  const accepted = proposals.filter(p => choiceOf(p).decision === 'accept' && (p.sensitive === undefined || choiceOf(p).unblocked === true)).length
  const pendingIds = new Set(proposals.filter(p => choiceOf(p).decision === 'pending').map(p => p.id))
  // A rule waiting for its choice asks for attention too.
  const flagged = proposals.filter(p => p.uncertain === true || p.sensitive !== undefined || p.conflict !== undefined || pendingIds.has(p.id)).length
  const discarded = proposals.length - accepted - pendingIds.size
  const pendingRules = proposals.filter(p => p.kind === 'constraint' && pendingIds.has(p.id))

  return (
    <div className={styles.review}>
      <div className={styles.reviewBar}>
        <p className={styles.summary} role="status" aria-live="polite">{labels.summary(accepted, flagged, discarded)}</p>
        <Button
          variant="ghost"
          onClick={() => {
            for (const p of proposals) {
              if (p.kind !== 'constraint' && p.uncertain !== true && p.sensitive === undefined && p.conflict === undefined) onChoice(p.id, { ...choiceOf(p), decision: 'accept' })
            }
          }}
        >
          {labels.acceptClean}
        </Button>
      </div>
      {KIND_ORDER.map((kind) => {
        const group = proposals.filter(p => p.kind === kind)
        if (group.length === 0) return null
        return (
          <section key={kind} className={styles.group} aria-label={labels.kinds[kind]}>
            <div className={styles.groupHead}>
              <h4 className={styles.groupTitle}>{labels.kinds[kind]} <span className={styles.count}>{group.length}</span></h4>
              {kind === 'constraint' && pendingRules.length > 0 && labels.acceptAllRules !== undefined && (
                <Button
                  variant="secondary"
                  size="s"
                  onClick={() => { for (const rule of pendingRules) onChoice(rule.id, { ...choiceOf(rule), decision: 'accept' }) }}
                >
                  {labels.acceptAllRules(pendingRules.length)}
                </Button>
              )}
            </div>
            <ul className={styles.items}>
              {group.map((p) => {
                const choice = choiceOf(p)
                const blocked = p.sensitive !== undefined && choice.unblocked !== true
                const isAccepted = choice.decision === 'accept' && !blocked
                return (
                  <li key={p.id} className={styles.item} data-decision={blocked ? 'blocked' : choice.decision} data-uncertain={p.uncertain === true ? '' : undefined}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemFlags}>
                        <Chip tone={KIND_TONE[p.kind]} size="s">{labels.kinds[p.kind]}</Chip>
                        {p.uncertain === true && <Chip tone="warning" size="s" icon={<UiIcon name="help" size={14} />}>{labels.uncertain}</Chip>}
                        {p.sensitive !== undefined && <Chip tone="danger" size="s" icon={<UiIcon name="alert" size={14} />}>{labels.sensitiveBlocked(p.sensitive)}</Chip>}
                        {p.conflict !== undefined && <Chip tone="info" size="s">{p.conflictKind === 'question' ? p.conflict : labels.conflict(p.conflict)}</Chip>}
                      </div>
                      {editing === p.id ? (
                        <Textarea
                          label={labels.edit}
                          hideLabel
                          rows={3}
                          value={choice.text}
                          onChange={(event) => { onChoice(p.id, { ...choice, text: event.target.value }) }}
                        />
                      ) : (
                        <p className={styles.itemText} data-blurred={blocked ? '' : undefined}>{choice.text}</p>
                      )}
                      <p className={styles.provenance}>{p.provenance}</p>
                      {choice.decision === 'pending' && labels.pendingRuleNote !== undefined && (
                        <p className={styles.pendingNote}>{labels.pendingRuleNote}</p>
                      )}
                    </div>
                    <div className={styles.itemActions}>
                      {blocked ? (
                        <Button size="s" variant="ghost" onClick={() => { onChoice(p.id, { ...choice, unblocked: true, decision: 'accept' }) }}>{labels.unblock}</Button>
                      ) : (
                        <div className={styles.segmented} role="group" aria-label={choice.text.slice(0, 60)}>
                          <button type="button" aria-pressed={isAccepted} onClick={() => { onChoice(p.id, { ...choice, decision: 'accept' }) }}>
                            <UiIcon name="check" size={14} strokeWidth={2.6} />{labels.accept}
                          </button>
                          <button type="button" aria-pressed={choice.decision === 'discard'} onClick={() => { onChoice(p.id, { ...choice, decision: 'discard' }) }}>
                            <UiIcon name="close" size={14} strokeWidth={2.4} />{labels.discard}
                          </button>
                        </div>
                      )}
                      {!blocked && (
                        <button type="button" className={styles.linkButton} onClick={() => { setEditing(editing === p.id ? null : p.id) }}>
                          {editing === p.id ? labels.done : labels.edit}
                        </button>
                      )}
                      {!blocked && isAccepted && (
                        <label className={styles.private}>
                          <input type="checkbox" checked={choice.private} onChange={(event) => { onChoice(p.id, { ...choice, private: event.target.checked }) }} />
                          {labels.private}
                        </label>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <div className={styles.saveBar}>
        {labels.pendingRules !== undefined && pendingRules.length > 0 && (
          <p className={styles.constraintNotice} role="status">{labels.pendingRules(pendingRules.length)}</p>
        )}
        {labels.constraintNotice !== undefined && acceptedConstraintCount(proposals, choiceOf) > 0 && (
          <p className={styles.constraintNotice} role="status">{labels.constraintNotice(acceptedConstraintCount(proposals, choiceOf))}</p>
        )}
        <Button variant="primary" disabled={accepted === 0 || saving} loading={saving} onClick={onSave}>{labels.save(accepted)}</Button>
      </div>
    </div>
  )
}
