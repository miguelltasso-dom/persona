import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, Chip, Modal, Tooltip, UiIcon } from '../primitives/index.ts'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { ComposerLimitsPanel } from './ComposerLimitsPanel.tsx'
import { ENGINE_LIMITS_UNAVAILABLE, type EngineLimitsUi } from '../remote/engine-limits.ts'
import { ComposerSlashMenu } from './ComposerSlashMenu.tsx'
import { ComposerToolButton } from './ComposerToolButton.tsx'
import {
  COMPOSER_LARGE_PASTE_BYTES,
  clearComposerPocket,
  formatPocketTime,
  pastedThousands,
  pushSentHistory,
  readComposerPocket,
  readSentHistory,
  saveComposerPocket,
} from './composer-memory.ts'
import {
  activeSlashToken,
  availableSlashIds,
  filterSlashCommands,
  type ComposerSlashActions,
  type ComposerSlashCommand,
} from './composer-slash-commands.ts'
import type { MessageQuote } from './MessageQuoteToolbar.tsx'
import {
  PERSONA_COMPOSER_EMOJI_READY,
  PERSONA_COMPOSER_MENTION_READY,
  personaMessageAttachmentsHostReady,
} from './composer-host-capabilities.ts'
import {
  composerCanSend,
  readyAttachmentIds,
  type ComposerPendingAttachment,
} from './composer-pending-attachment.ts'
import { defaultChannelResponderId } from './default-channel-responder.ts'
import type { SubjectColorIndex } from './conversation-subjects.ts'
import { SubjectDot } from './SubjectBar.tsx'
import styles from './ChannelComposer.module.css'

export interface ChannelComposerProps extends PropsLocale<'persona.chat'> {
  /** Channel roster; coordination persona is the default responder when present. */
  readonly members?: readonly ChannelPersonaMember[]
  readonly onSend?: ((body: string, attachmentIds?: readonly string[]) => void) | undefined
  /** Host `attachFile` (Anvil); omit when attachments gate is off. */
  readonly uploadAttachment?: ((file: File) => Promise<{ readonly id: string; readonly name: string }>) | undefined
  /** Overrides the #geral placeholder (DMs: "Mensagem para Nina…"). */
  readonly placeholder?: string | undefined
  /** WAVE2: bolinha do assunto ativo antes do campo. */
  readonly activeSubjectColorIndex?: SubjectColorIndex | undefined
  /** Session key for sent-history / draft pocket (T3-UX-HARVEST §3). */
  readonly conversationKey?: string | undefined
  readonly pendingQuote?: MessageQuote | null
  readonly onClearQuote?: (() => void) | undefined
  readonly responderAutonomy?: AutonomyLevel | undefined
  /** O que cada comando "/" faz (P0-27). Sem handler o comando não aparece no menu; `/limites` é sempre do composer. */
  readonly slashActions?: ComposerSlashActions | undefined
  /** IV-4: limites REAIS do motor para o `/limites`; sem fonte, "—" e "Cota oficial indisponível" (nunca número de exemplo). */
  readonly engineLimits?: EngineLimitsUi | undefined
  /** Chamado quando o `/limites` abre: quem monta a tela lê as cotas agora. */
  readonly onOpenLimits?: (() => void) | undefined
  readonly quotaBlocked?: boolean | undefined
  readonly quotaResumeLabel?: string | undefined
  readonly onResumeQuota?: (() => void) | undefined
  /** T3-UX-HARVEST §12 — Onda 2 account swap when engine is at limit. */
  readonly onSwapAccount?: (() => void) | undefined
  readonly onOpenPersonaCard?: ((personaId: string) => void) | undefined
  /**
   * O cartão do plano do Gestor tem prioridade sobre a dica "Quem responde" (Muse): enquanto houver um plano esperando
   * a decisão, a dica não aparece (nem cobre Aprovar/Ajustar). Não conta como "visto": volta quando o plano for decidido.
   */
  readonly suppressHint?: boolean | undefined
  /**
   * Steer (UX-PHASE §6): com o responder trabalhando, "na fila" NÃO envia — entrega o texto a quem guarda a fila
   * (balão tracejado). Sem este callback, enviar na fila é enviar (comportamento anterior).
   */
  readonly onQueueMessage?: ((text: string, responder: { readonly id: string; readonly name: string }) => void) | undefined
  /** Texto de uma mensagem da fila que voltou para edição; some quando `undefined`. */
  readonly editingQueuedText?: string | undefined
  readonly onCancelEditQueued?: (() => void) | undefined
}

const MAX_ROWS_PX = 8 * 24

/** Respiro mínimo entre o balão da dica de 1ª vez e a borda da janela. */
const HINT_EDGE_MARGIN = 12

/** Dica de 1ª vez do seletor "Quem responde" (UX-PHASE §5): uma vez por instalação. */
export const WHO_RESPONDS_HINT_KEY = 'persona.hint.whoResponds'

function whoRespondsHintSeen(): boolean {
  try { return localStorage.getItem(WHO_RESPONDS_HINT_KEY) === '1' } catch { return true /* storage bloqueado: nunca insiste */ }
}

/** Composer card (dirD): auto-growing field, tool row, "Responde" persona chip, amber send. */
export function ChannelComposer({
  t,
  members = [],
  onSend,
  uploadAttachment,
  placeholder,
  activeSubjectColorIndex,
  conversationKey = 'default',
  pendingQuote = null,
  onClearQuote,
  responderAutonomy = 'propose',
  slashActions,
  engineLimits,
  onOpenLimits,
  quotaBlocked = false,
  quotaResumeLabel,
  onResumeQuota,
  onSwapAccount,
  onOpenPersonaCard,
  suppressHint = false,
  onQueueMessage,
  editingQueuedText,
  onCancelEditQueued,
}: ChannelComposerProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<readonly ComposerPendingAttachment[]>([])
  const [responderId, setResponderId] = useState<string>(() => defaultChannelResponderId(members))
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [pocketLabel, setPocketLabel] = useState<string | null>(() => {
    const pocket = readComposerPocket(conversationKey)
    return pocket === null ? null : formatPocketTime(pocket.savedAt)
  })
  // P0-17: colagem grande vira o cartão "Texto colado · N mil caracteres · Abrir"; o texto fica só na memória desta tela.
  const [pastedTexts, setPastedTexts] = useState<Readonly<Record<string, string>>>({})
  const [openPastedKey, setOpenPastedKey] = useState<string | null>(null)
  const [showLimits, setShowLimits] = useState(false)
  const [showWhoRespondsHint, setShowWhoRespondsHint] = useState(false)
  const responderBoxRef = useRef<HTMLDivElement>(null)
  const [hintArrowLeft, setHintArrowLeft] = useState(20)
  // O balão nunca passa da borda da janela (zoom 200%, janela estreita): desloca para a esquerda e a seta continua no seletor.
  const [hintShift, setHintShift] = useState(0)
  const dismissWhoRespondsHint = useCallback(() => {
    setShowWhoRespondsHint(false)
    try { localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1') } catch { /* sem storage: some só nesta sessão */ }
  }, [])
  const [slashIndex, setSlashIndex] = useState(0)
  const [sendMode, setSendMode] = useState<'queue' | 'steer'>('queue')
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  const hintId = useId()
  const whoRespondsBalloonRef = useRef<HTMLDivElement>(null)
  const hintShiftRef = useRef(0)
  const responder =members.find(member => member.id === responderId) ?? members[0]
  const attachmentsReady = personaMessageAttachmentsHostReady() && uploadAttachment !== undefined
  const canSend = composerCanSend(draft, pending) && !quotaBlocked
  const comingSoon = t('composer.comingSoon')
  const responderWorking = responder?.state === 'working'
  const slashToken = activeSlashToken(draft, fieldRef.current?.selectionStart ?? draft.length)
  const slashItems = slashToken === null ? [] : filterSlashCommands(slashToken.query, availableSlashIds(slashActions))
  const showSlashMenu = slashItems.length > 0 && slashToken !== null

  useEffect(() => { setSlashIndex(0) }, [draft, slashToken?.query])

  useLayoutEffect(() => {
    const node = fieldRef.current
    if (node === null) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_ROWS_PX)}px`
  }, [draft])

  // A seta da dica aponta para o CENTRO do seletor "Quem responde" (e não para o campo de mensagem), e o balão fica
  // dentro da janela: se passaria da borda direita, desloca para a esquerda e a seta acompanha o seletor.
  useLayoutEffect(() => {
    if (!showWhoRespondsHint) return undefined
    const place = (): void => {
      const box = responderBoxRef.current
      const balloon = whoRespondsBalloonRef.current
      const boxWidth = box?.offsetWidth ?? 0
      if (boxWidth === 0) return
      let shift = 0
      if (balloon !== null) {
        const rect = balloon.getBoundingClientRect()
        const naturalLeft = rect.left - hintShiftRef.current
        const overflowRight = naturalLeft + rect.width - (window.innerWidth - HINT_EDGE_MARGIN)
        shift = overflowRight > 0 ? -overflowRight : 0
        if (naturalLeft + shift < HINT_EDGE_MARGIN) shift = HINT_EDGE_MARGIN - naturalLeft
        const maxArrow = Math.max(12, rect.width - 28)
        setHintArrowLeft(Math.min(maxArrow, Math.max(12, Math.round(boxWidth / 2 - 8 - shift))))
      } else {
        setHintArrowLeft(Math.max(12, Math.round(boxWidth / 2 - 8)))
      }
      hintShiftRef.current = shift
      setHintShift(shift)
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [showWhoRespondsHint])

  // Dica de 1ª vez: só faz sentido com mais de uma persona para escolher; não rouba o foco; Esc fecha.
  const canPickResponder = members.length > 1
  useEffect(() => {
    if (suppressHint) setShowWhoRespondsHint(false)
    else if (canPickResponder && !whoRespondsHintSeen()) setShowWhoRespondsHint(true)
  }, [canPickResponder, suppressHint])
  useEffect(() => {
    if (!showWhoRespondsHint) return undefined
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') dismissWhoRespondsHint()
    }
    // Clicar em qualquer outra coisa (ex.: "Ajustar" no cartão do plano, que o balão cobre) também conta como visto.
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target !== null && whoRespondsBalloonRef.current?.contains(target) === true) return
      dismissWhoRespondsHint()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [showWhoRespondsHint, dismissWhoRespondsHint])

  // "Editar" no balão da fila: o texto volta para o campo; ao cancelar, o campo esvazia (só se ainda for aquele texto).
  const editingTextRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const previous = editingTextRef.current
    editingTextRef.current = editingQueuedText
    if (editingQueuedText !== undefined) {
      setDraft(editingQueuedText)
      fieldRef.current?.focus()
    } else if (previous !== undefined) {
      setDraft(current => (current === previous ? '' : current))
    }
  }, [editingQueuedText])

  useLayoutEffect(() => {
    if (members.length === 0) return
    if (members.some(member => member.id === responderId)) return
    setResponderId(defaultChannelResponderId(members))
  }, [members, responderId])

  const queueFile = (file: File, pastedText?: string): void => {
    if (uploadAttachment === undefined) return
    const key = `att-${Date.now()}-${file.name}`
    if (pastedText !== undefined) setPastedTexts(current => ({ ...current, [key]: pastedText }))
    setPending(current => [...current, { key, name: file.name, status: 'uploading' }])
    void uploadAttachment(file).then(
      (row) => {
        setPending(current => current.map(item => item.key === key
          ? { key, name: row.name, status: 'ready', id: row.id }
          : item))
      },
      () => {
        setPending(current => current.map(item => item.key === key
          ? { key, name: file.name, status: 'error', message: t('composer.attachFailed') }
          : item))
      },
    )
  }

  const onFilesPicked = (event: ChangeEvent<HTMLInputElement>): void => {
    const list = event.target.files
    if (list === null) return
    for (const file of list) queueFile(file)
    event.target.value = ''
  }

  const removePending = (key: string): void => {
    setPending(current => current.filter(item => item.key !== key))
    setPastedTexts((current) => {
      if (!(key in current)) return current
      const { [key]: _removed, ...rest } = current
      return rest
    })
    setOpenPastedKey(current => (current === key ? null : current))
  }

  const buildOutbound = (): string => {
    const base = draft.trim()
    if (pendingQuote === null || pendingQuote.excerpt.length === 0) return base
    const quote = `> ${pendingQuote.excerpt.replace(/\n/gu, '\n> ')}\n\n`
    return `${quote}${base}`.trim()
  }

  const send = (modeOverride?: 'queue' | 'steer'): void => {
    if (!canSend && modeOverride === undefined) return
    const text = buildOutbound()
    if (text.length === 0 && readyAttachmentIds(pending).length === 0) return
    const ids = readyAttachmentIds(pending)
    pushSentHistory(conversationKey, text)
    const shouldQueue = (modeOverride ?? 'queue') === 'queue' && responderWorking && responder !== undefined
      && onQueueMessage !== undefined && ids.length === 0
    if (shouldQueue) onQueueMessage(text, { id: responder.id, name: responder.name })
    else onSend?.(text, ids)
    setDraft('')
    setPending([])
    setPastedTexts({})
    setOpenPastedKey(null)
    setHistoryIndex(null)
    setShowLimits(false)
    onClearQuote?.()
    fieldRef.current?.focus()
  }

  const applySlash = (command: ComposerSlashCommand): void => {
    if (command.id === 'limites') {
      onOpenLimits?.()
      setShowLimits(true)
      setDraft('')
      return
    }
    const action = slashActions?.[command.id]
    if (action === undefined) return
    const start = slashToken?.start ?? 0
    const arg = draft.slice(start + command.prefix.length).trim()
    if (command.needsArg === true && arg.length === 0) {
      // "/assunto" sem nome: deixa o comando no campo e espera o nome (Enter de novo executa).
      setDraft(`${draft.slice(0, start)}${command.prefix} `)
      return
    }
    action(arg)
    setDraft('')
  }

  /**
   * Ctrl+S (T3 "prompt stash"): guarda o que foi digitado e esvazia o campo, e o chip "Rascunho guardado" aparece. Só o texto
   * digitado vai para o bolso (nunca o conteúdo de anexos). Se não deu para guardar, o campo fica como está: nada some.
   */
  const savePocket = (): void => {
    if (draft.trim().length === 0) return
    const savedAt = new Date().toISOString()
    const stored = saveComposerPocket(conversationKey, {
      text: draft,
      savedAt,
      attachmentNames: pending.map(row => row.name),
    })
    if (!stored) return
    setPocketLabel(formatPocketTime(savedAt))
    setDraft('')
    setHistoryIndex(null)
  }

  const restorePocket = (): void => {
    const pocket = readComposerPocket(conversationKey)
    if (pocket === null) return
    setDraft(pocket.text)
    clearComposerPocket(conversationKey)
    setPocketLabel(null)
    fieldRef.current?.focus()
  }

  const openFilePicker = (): void => { fileInputRef.current?.click() }
  const openImagePicker = (): void => { imageInputRef.current?.click() }

  return (
    <form
      data-persona-area="composer"
      className={styles.composer}
      aria-label={t('composer.placeholder')}
      onSubmit={(event) => {
        event.preventDefault()
        if (responderWorking && sendMode === 'steer') send('steer')
        else send('queue')
      }}
    >
      {showLimits && <ComposerLimitsPanel t={t} limits={engineLimits ?? ENGINE_LIMITS_UNAVAILABLE} onClose={() => { setShowLimits(false) }} />}
      {pocketLabel !== null && draft.length === 0 && (
        <button type="button" className={styles.pocketChip} onClick={restorePocket} aria-keyshortcuts="Control+S">
          <Chip size="s" tone="plain" icon={<UiIcon name="attach" size={12} strokeWidth={2.2} />}>
            <span role="status">{t('composer.pocketChip', { time: pocketLabel })}</span>
          </Chip>
        </button>
      )}
      {pendingQuote !== null && (
        <div className={styles.quoteChip}>
          <Chip size="s" tone="plain" icon={<UiIcon name="copy" size={12} strokeWidth={2.2} />}>
            {t('composer.quoteChip', { excerpt: pendingQuote.excerpt.slice(0, 48) })}
          </Chip>
          {onClearQuote !== undefined && (
            <button type="button" className={styles.attachRemove} aria-label={t('composer.quoteClear')} onClick={onClearQuote}>
              <UiIcon name="close" size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}
      {editingQueuedText !== undefined && (
        <div className={styles.editingQueuedRow} role="status">
          <span className={styles.editingQueuedText}>{t('composer.steer.editingLabel')}</span>
          <button
            type="button"
            className={styles.cancelEditQueuedButton}
            onClick={() => { onCancelEditQueued?.() }}
          >
            {t('composer.steer.cancelEdit')}
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="persona-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFilesPicked}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="persona-sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFilesPicked}
      />
      {pending.length > 0 && (
        <ul className={styles.attachments} aria-label={t('composer.attachmentsLabel')}>
          {pending.map(row => (
            <li key={row.key}>
              {row.status === 'ready' && pastedTexts[row.key] !== undefined ? (
                <>
                  <Chip size="s" tone="plain" icon={<UiIcon name="fileText" size={12} strokeWidth={2.2} />}>
                    {t('composer.pastedCard', { thousands: String(pastedThousands(pastedTexts[row.key]?.length ?? 0)) })}
                  </Chip>
                  <Button size="s" variant="ghost" onClick={() => { setOpenPastedKey(row.key) }}>
                    {t('composer.pastedOpen')}
                  </Button>
                </>
              ) : (
                <Chip
                  size="s"
                  tone={row.status === 'error' ? 'danger' : row.status === 'uploading' ? 'neutral' : 'plain'}
                  icon={<UiIcon name="attach" size={12} strokeWidth={2.2} />}
                >
                  {row.status === 'uploading' ? t('composer.attachUploading', { name: row.name }) : row.name}
                </Chip>
              )}
              <button
                type="button"
                className={styles.attachRemove}
                aria-label={t('composer.attachRemove', { name: row.name })}
                onClick={() => { removePending(row.key) }}
              >
                <UiIcon name="close" size={14} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {openPastedKey !== null && pastedTexts[openPastedKey] !== undefined && (
        <Modal open title={t('composer.pastedTitle')} closeLabel={t('composer.pastedClose')} onClose={() => { setOpenPastedKey(null) }} size="l">
          <pre className={styles.pastedPreview}>{pastedTexts[openPastedKey]}</pre>
        </Modal>
      )}
      <label htmlFor={fieldId} className="persona-sr-only">{placeholder ?? t('composer.placeholderChannel')}</label>
      {showSlashMenu && (
        <ComposerSlashMenu
          t={t}
          items={slashItems}
          activeIndex={slashIndex}
          onPick={(command) => { applySlash(command) }}
        />
      )}
      <div className={styles.fieldRow}>
        {activeSubjectColorIndex !== undefined && (
          <span className={styles.subjectDotWrap} aria-hidden="true">
            <SubjectDot colorIndex={activeSubjectColorIndex} />
          </span>
        )}
        <textarea
          ref={fieldRef}
          id={fieldId}
          className={styles.field}
          rows={1}
          value={draft}
          placeholder={quotaBlocked
            ? (quotaResumeLabel ?? t('composer.quotaBlocked'))
            : (placeholder ?? t('composer.placeholderChannel'))}
          aria-describedby={hintId}
          onChange={(event) => {
            setDraft(event.target.value)
            if (historyIndex !== null) setHistoryIndex(null)
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text/plain')
            if (text.length < COMPOSER_LARGE_PASTE_BYTES || uploadAttachment === undefined) return
            event.preventDefault()
            queueFile(new File([text], t('composer.pasteFileName'), { type: 'text/plain' }), text)
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault()
              // Com o campo vazio o mesmo atalho devolve o rascunho guardado; com texto, guarda e esvazia.
              if (draft.trim().length === 0) restorePocket()
              else savePocket()
              return
            }
            if (showSlashMenu) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSlashIndex(index => (index + 1) % slashItems.length)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSlashIndex(index => (index - 1 + slashItems.length) % slashItems.length)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                const pick = slashItems[slashIndex]
                if (pick !== undefined) applySlash(pick)
                return
              }
            }
            // ↑ traz o último pedido com o campo vazio e, enquanto o texto for um pedido recuperado sem edição (historyIndex
            // é zerado ao digitar), continua indo mais para trás (T3 composer.md §Recall).
            if (event.key === 'ArrowUp' && (draft.length === 0 || historyIndex !== null) && !event.altKey && !event.ctrlKey && !event.metaKey) {
              const history = readSentHistory(conversationKey)
              if (history.length === 0) return
              event.preventDefault()
              const nextIndex = historyIndex === null ? 0 : Math.min(history.length - 1, historyIndex + 1)
              setHistoryIndex(nextIndex)
              setDraft(history[nextIndex] ?? '')
              return
            }
            if (event.key === 'ArrowDown' && historyIndex !== null && !event.altKey && !event.ctrlKey && !event.metaKey) {
              event.preventDefault()
              const history = readSentHistory(conversationKey)
              const nextIndex = historyIndex - 1
              if (nextIndex < 0) {
                setHistoryIndex(null)
                setDraft('')
              } else {
                setHistoryIndex(nextIndex)
                setDraft(history[nextIndex] ?? '')
              }
              return
            }
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            const steerNow = event.ctrlKey && responderWorking
            if (!steerNow && event.shiftKey) return
            if (steerNow || !event.shiftKey) {
              event.preventDefault()
              if (responderWorking && (steerNow || sendMode === 'steer')) send('steer')
              else send('queue')
            }
          }}
        />
      </div>
      <div className={styles.toolbar}>
        <div className={styles.tools}>
          <ComposerToolButton
            enabled={attachmentsReady}
            label={t('composer.add')}
            comingSoonLabel={comingSoon}
            icon={<UiIcon name="plus" size={20} strokeWidth={2} />}
            className={styles.plus}
            onActivate={openFilePicker}
          />
          <ComposerToolButton
            enabled={attachmentsReady}
            label={t('composer.image')}
            comingSoonLabel={comingSoon}
            icon={<UiIcon name="image" size={20} />}
            onActivate={openImagePicker}
          />
          <ComposerToolButton
            enabled={attachmentsReady}
            label={t('composer.attach')}
            comingSoonLabel={comingSoon}
            icon={<UiIcon name="attach" size={20} />}
            onActivate={openFilePicker}
          />
          <ComposerToolButton
            enabled={PERSONA_COMPOSER_EMOJI_READY}
            label={t('composer.emoji')}
            comingSoonLabel={comingSoon}
            icon={<UiIcon name="smile" size={20} />}
          />
          <ComposerToolButton
            enabled={PERSONA_COMPOSER_MENTION_READY}
            label={t('composer.mention')}
            comingSoonLabel={comingSoon}
            icon={<UiIcon name="at" size={20} />}
          />
          {responder !== undefined && (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <div ref={responderBoxRef} className={styles.responderContainer}>
                <label className={styles.responder}>
                  <span className={styles.responderLabel}>{t('composer.respondsLabel')}</span>
                  <Avatar name={responder.name} src={AVATAR_96[responder.id]} size={24} decorative />
                  <span className={styles.responderName} aria-hidden="true">{responder.name}</span>
                  <UiIcon name="chevronDown" size={14} strokeWidth={2.4} />
                  <select
                    className={styles.responderSelect}
                    aria-label={t('composer.modelLabel')}
                    value={responder.id}
                    onChange={(event) => {
                      dismissWhoRespondsHint()
                      setResponderId(event.target.value)
                    }}
                  >
                    {members.map(member => (
                      <option key={member.id} value={member.id}>{member.name + ' — ' + member.role}</option>
                    ))}
                  </select>
                </label>
                {showWhoRespondsHint && (
                  <div ref={whoRespondsBalloonRef} className={styles.whoRespondsBalloon} role="dialog" aria-label={t('composer.whoRespondsHintTitle')} style={{ '--who-responds-arrow-left': `${String(hintArrowLeft)}px`, '--who-responds-shift': `${String(hintShift)}px` } as CSSProperties}>
                    <span className={styles.whoRespondsArrow} aria-hidden="true" />
                    <p className={styles.whoRespondsTitle}>{t('composer.whoRespondsHintTitle')}</p>
                    <p className={styles.whoRespondsBody}>{t('composer.whoRespondsHintBody')}</p>
                    <Button size="s" variant="secondary" onClick={dismissWhoRespondsHint}>
                      {t('composer.whoRespondsGotIt')}
                    </Button>
                  </div>
                )}
              </div>
              {responderAutonomy !== 'propose' && (
                <Tooltip
                  content={
                    responderAutonomy === 'on-request'
                      ? (responder.name + ' sempre pergunta antes de qualquer ação.')
                      : (responder.name + ' decide o rotineiro dentro dos limites.')
                  }
                >
                  <button
                    type="button"
                    className={styles.autonomyButton}
                    onClick={() => { onOpenPersonaCard?.(responder.id) }}
                    aria-label={t(`composer.autonomy.${responderAutonomy}` as const)}
                  >
                    <Chip
                      size="s"
                      tone={responderAutonomy === 'on-request' ? 'info' : 'accent'}
                    >
                      <span className={styles.autonomyChipContent}>
                        <UiIcon name={responderAutonomy === 'on-request' ? 'lock' : 'sparkle'} size={13} strokeWidth={2.2} />
                        {t(`composer.autonomy.${responderAutonomy}` as const)}
                      </span>
                    </Chip>
                  </button>
                </Tooltip>
              )}
            </>
          )}
        </div>
        <p id={hintId} className={styles.hint}>
          {responderWorking
            ? (sendMode === 'queue' ? t('composer.hintQueue') : t('composer.hintSteer'))
            : t('composer.hint')}
        </p>
        {quotaBlocked && draft.length === 0 && (onResumeQuota !== undefined || onSwapAccount !== undefined) && (
          <div className={styles.quotaActions}>
            {onResumeQuota !== undefined && (
              <Button type="button" variant="secondary" size="s" onClick={onResumeQuota}>
                {t('composer.resumeQuota')}
              </Button>
            )}
            {onSwapAccount !== undefined && (
              <button type="button" className={styles.swapAccountLink} onClick={onSwapAccount}>
                {t('composer.swapAccount')}
              </button>
            )}
          </div>
        )}
        {responderWorking && (
          <button
            type="button"
            className={styles.attachRemove}
            aria-label={sendMode === 'queue' ? t('composer.modeSteer') : t('composer.modeQueue')}
            onClick={() => { setSendMode(mode => mode === 'queue' ? 'steer' : 'queue') }}
          >
            <UiIcon name={sendMode === 'queue' ? 'clock' : 'arrowRight'} size={18} strokeWidth={2.2} />
          </button>
        )}
        {responderAutonomy !== 'propose' && (
          <Chip size="s" tone="plain" className={styles.autonomyChip}>
            {t(`composer.autonomy.${responderAutonomy}`)}
          </Chip>
        )}
        <button
          type="submit"
          className={styles.send}
          data-mode={responderWorking && sendMode === 'queue' ? 'queue' : undefined}
          disabled={!canSend}
          aria-label={responderWorking && sendMode === 'queue' ? t('composer.sendQueue') : t('composer.send')}
        >
          <UiIcon name={responderWorking && sendMode === 'queue' ? 'clock' : 'send'} size={20} strokeWidth={2} />
        </button>
      </div>
    </form>
  )
}
