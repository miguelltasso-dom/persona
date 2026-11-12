import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, Chip, Modal, Tooltip, UiIcon } from '../primitives/index.ts'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import type { ResponderEngine } from './responder-engine.ts'
import { ComposerLimitsPanel } from './ComposerLimitsPanel.tsx'
import { ENGINE_LIMITS_UNAVAILABLE, type EngineLimitsUi } from '../remote/engine-limits.ts'
import { ComposerSlashMenu } from './ComposerSlashMenu.tsx'
import { FanoutChip } from './fanout/FanoutChip.tsx'
import { fanoutText, needsFanoutConfirm, type FanoutChoice, type FanoutEstimateUi } from './fanout/fanout-rules.ts'
import { ResponderMenu, optionId } from './ResponderMenu.tsx'
import { activeMentionToken, buildResponderItems, insertMention, moveResponderActive, type ResponderItem } from './responder-menu.ts'
import { isPlacesNavEnabled } from '../shell/nav-flag.ts'
import { LimitBanner } from './LimitBanner.tsx'
import { ComposerToolButton } from './ComposerToolButton.tsx'
import { clipboardImageFiles } from './clipboard-images.ts'
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

/** CV-8: o que sai junto com a mensagem; `fanout` só existe quando a pessoa escolheu "Toda a equipe" ou "Quem tiver algo a dizer" para ESTA mensagem. */
export interface ComposerSendOptions {
  readonly fanout?: FanoutChoice
  /** TEAM-8c: esta mensagem é a opinião da PESSOA sobre um pedido de opinião da equipe (`requestId`). */
  readonly opinionFor?: string
}

/** FL-11 / IV-5: há uma resposta (ou Tarefa) que a pessoa pode parar; o botão de enviar vira "Parar" enquanto o campo está vazio. */
export interface ComposerStop {
  readonly onStop: () => void
  /** Quem está respondendo (vai no nome acessível: "Parar a resposta de {persona}"). */
  readonly personaName: string
}

export interface ChannelComposerProps extends PropsLocale<'persona.chat'> {
  /** Channel roster; coordination persona is the default responder when present. */
  readonly members?: readonly ChannelPersonaMember[]
  readonly onSend?: ((body: string, attachmentIds?: readonly string[], options?: ComposerSendOptions) => void) | undefined
  /** COLHEITA-S1 P1-05: o microfone do composer (aparece com o texto vazio). O pai monta; a caixa só reserva o lugar. */
  readonly voiceSlot?: ((empty: boolean) => ReactNode) | undefined
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
  /** DESIGN-01 #03: a pílula "Modelo · Esforço" da persona que responde (só com persona definida: na DM sempre; no #geral não quando a Coordenação distribui). Sem isto não há pílula. */
  readonly responderEngine?: ResponderEngine | undefined
  /** O que cada comando "/" faz (P0-27). Sem handler o comando não aparece no menu; `/limites` é sempre do composer. */
  readonly slashActions?: ComposerSlashActions | undefined
  /** IV-4: limites REAIS do motor para o `/limites`; sem fonte, "—" e "Este motor não informa a cota." (nunca número de exemplo). */
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
  readonly onQueueMessage?: ((
    text: string,
    responder: { readonly id: string; readonly name: string },
    options?: { readonly heldForQuota?: boolean; readonly attachments?: readonly { readonly id: string; readonly name: string }[] },
  ) => void) | undefined
  /** FL-11 / IV-5 (atrás de `persona.flag.workingControl`): "Direcionar agora" chama o host; sem isto, direcionar é enviar (comportamento anterior). */
  readonly onSteer?: ((text: string, responder: { readonly id: string; readonly name: string }) => void) | undefined
  /** FL-11 / IV-5: o Parar. Sem isto, o botão de enviar é sempre o de enviar. */
  readonly stop?: ComposerStop | undefined
  /**
   * Alguém está DE FATO respondendo a esta conversa (resposta crescendo ou "está escrevendo…"). Com o controle de trabalho ligado, só isto liga a dica "Enter na fila…",
   * o relógio de modo e o Enviar em modo fila (Muse 03:26: persona trabalhando numa Tarefa não é resposta). Ausente = o estado `working` da persona (como antes).
   */
  readonly responding?: boolean | undefined
  /** DM: o único "responder" é a persona da conversa; a lógica de fila/direcionar/parar vale, mas o seletor "Quem responde" e o `@nome` não existem. */
  readonly responderHidden?: boolean | undefined
  /** TEAM-8c (atrás de `persona.flag.teamwork`): a pessoa está dando a opinião dela sobre um pedido da equipe; mostra o chip "Opinando sobre: {pergunta} · ✕". */
  readonly opinionContext?: { readonly requestId: string; readonly question: string } | undefined
  readonly onClearOpinionContext?: (() => void) | undefined
  /**
   * IV-10 (Ember): "Responder" a uma pergunta da persona. O chip (`label` já composto por quem chama, ex. "Respondendo a Nina: …") aparece acima da caixa; ✕ chama
   * `onClear` SEM apagar o texto. Com `onSendReply`, o Enviar chama a resposta (answerAttention) em vez do postMessage / fila / direcionar / fan-out.
   */
  readonly replyTarget?: { readonly id: string; readonly label: string; readonly onClear: () => void } | undefined
  readonly onSendReply?: ((text: string, attachmentIds: readonly string[]) => Promise<void>) | undefined
  /** CV-8: o canal oferece "Toda a equipe ({n})" e "Quem tiver algo a dizer" (`Config.fanout` ligada e 2+ personas). Sem isto, só a equipe. */
  readonly fanoutChoices?: { readonly teamCount: number } | undefined
  /** CV-8: avisa quando a escolha do fan-out muda (e `undefined` depois de enviar); quem calcula a estimativa é o chamador. */
  readonly onFanoutChoiceChange?: ((choice: FanoutChoice | undefined) => void) | undefined
  /** CV-8: os números MEDIDOS do host para o chip "Toda a equipe · n respostas · ≈ c chamadas". */
  readonly fanoutEstimate?: FanoutEstimateUi | undefined
  /** CV-3: "Ctrl+Enter abre a conversa com {nome}" no popover; sem isto, o atalho não existe. */
  readonly onOpenPersonaDm?: ((personaId: string) => void) | undefined
  /** P0-19: "Ver uso e limites" da faixa "No limite até {hora}". */
  readonly onSeeUsage?: (() => void) | undefined
  /** P0-19: outro motor conectado → "Usar {motor} enquanto isso" na faixa do limite (sem handler, o botão não existe). */
  readonly otherEngine?: { readonly name: string; readonly onUse: () => void } | undefined
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
  voiceSlot,
  uploadAttachment,
  placeholder,
  activeSubjectColorIndex,
  conversationKey = 'default',
  pendingQuote = null,
  onClearQuote,
  responderAutonomy = 'propose',
  responderEngine,
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
  onSteer,
  stop,
  responding,
  responderHidden = false,
  opinionContext,
  onClearOpinionContext,
  replyTarget,
  onSendReply,
  fanoutChoices,
  onFanoutChoiceChange,
  fanoutEstimate,
  onOpenPersonaDm,
  onSeeUsage,
  otherEngine,
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
  // CV-3 / CV-8: o "Quem responde" com a equipe inteira (popover) e o `@nome`. Só no modo CV-3 (flag navPlaces ou o canal oferece o fan-out);
  // fora dele o seletor é o `<select>` de sempre. A escolha vale SÓ para a próxima mensagem.
  const [placesNav] = useState(isPlacesNavEnabled)
  const menuMode = (placesNav || fanoutChoices !== undefined) && !responderHidden
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuQuery, setMenuQuery] = useState('')
  const [menuActive, setMenuActive] = useState(0)
  const [fanoutChoice, setFanoutChoice] = useState<FanoutChoice | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [caret, setCaret] = useState(0)
  const [mentionActive, setMentionActive] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState<number | null>(null)
  const menuInputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const menuListId = useId()
  const mentionListId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const attachSeq = useRef(0)
  const fieldId = useId()
  const hintId = useId()
  const whoRespondsBalloonRef = useRef<HTMLDivElement>(null)
  const hintShiftRef = useRef(0)
  const responder =members.find(member => member.id === responderId) ?? members[0]
  const attachmentsReady = personaMessageAttachmentsHostReady() && uploadAttachment !== undefined
  // P0-19 (ACCOUNT-SWAP-SPEC §3): o composer NUNCA desabilita no limite; a mensagem entra na fila e sai quando a cota voltar.
  const canSend = composerCanSend(draft, pending)
  const comingSoon = t('composer.comingSoon')
  const responderWorking = responding ?? responder?.state === 'working'
  const defaultId = defaultChannelResponderId(members)
  // #03: só com uma persona DEFINIDA respondendo: na DM (seletor oculto) sempre; no #geral, não quando a Coordenação distribui (o padrão) nem com "Toda a equipe".
  const engineLabel = responderEngine !== undefined && responder !== undefined && fanoutChoice === undefined && (responderHidden || responder.id !== defaultId)
    ? responderEngine.label(responder.id)
    : undefined
  const teamFaces = members.map(member => ({ id: member.id, name: member.name }))
  const menuItems = menuMode && menuOpen
    ? buildResponderItems({ members, defaultId, query: menuQuery, fanoutTeamCount: fanoutChoices?.teamCount })
    : []
  const mention = menuMode && !menuOpen ? activeMentionToken(draft, caret) : null
  const mentionItems: readonly ResponderItem[] = mention === null || mention.start === mentionDismissed
    ? []
    : buildResponderItems({ members, defaultId, query: mention.query }).map(item => (item.kind === 'default' ? { kind: 'persona' as const, member: item.member } : item))
  const mentionIndex = Math.min(mentionActive, Math.max(mentionItems.length - 1, 0))
  const responderLabel = fanoutChoice === 'everyone'
    ? fanoutText(t, 'composer.fanout.everyone', 'Toda a equipe ({count})', { count: fanoutChoices?.teamCount ?? members.length })
    : fanoutChoice === 'relevant'
      ? fanoutText(t, 'composer.fanout.relevant', 'Quem tiver algo a dizer')
      : (responder?.name ?? '')
  // O Parar só toma o lugar do Enviar com o campo vazio: quem já escreveu algo ainda pode enfileirar ou direcionar.
  const showStop = stop !== undefined && draft.trim().length === 0 && pending.length === 0
  const slashToken = activeSlashToken(draft, fieldRef.current?.selectionStart ?? draft.length)
  const slashItems = slashToken === null ? [] : filterSlashCommands(slashToken.query, availableSlashIds(slashActions))
  const showSlashMenu = slashItems.length > 0 && slashToken !== null

  useEffect(() => { setSlashIndex(0) }, [draft, slashToken?.query])
  // TEAM-8c: "Dar minha opinião" leva o foco ao campo.
  const opinionRequestId = opinionContext?.requestId
  useEffect(() => { if (opinionRequestId !== undefined) fieldRef.current?.focus() }, [opinionRequestId])

  // CV-3: o popover abre com o foco na busca; clicar fora fecha SEM roubar o foco de onde a pessoa clicou.
  useEffect(() => { if (menuOpen) menuInputRef.current?.focus() }, [menuOpen])
  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = (event: MouseEvent): void => {
      const box = responderBoxRef.current
      if (box !== null && event.target instanceof Node && !box.contains(event.target)) {
        setMenuOpen(false)
        setMenuQuery('')
        setMenuActive(0)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [menuOpen])
  // CV-3: depois de escolher no `@nome`, o cursor fica logo depois do nome inserido.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return
    const position = pendingCaret.current
    pendingCaret.current = null
    const node = fieldRef.current
    if (node !== null) {
      node.focus()
      node.setSelectionRange(position, position)
    }
    setCaret(position)
  }, [draft])

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
    attachSeq.current += 1
    const key = `att-${Date.now()}-${String(attachSeq.current)}-${file.name}`
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

  const chooseFanout = (choice: FanoutChoice | undefined): void => {
    setFanoutChoice(choice)
    setConfirming(false)
    onFanoutChoiceChange?.(choice)
  }
  const closeMenu = (refocus = true): void => {
    setMenuOpen(false)
    setMenuQuery('')
    setMenuActive(0)
    if (refocus) fieldRef.current?.focus()
  }
  const openMenu = (): void => {
    dismissWhoRespondsHint()
    setMenuQuery('')
    setMenuActive(0)
    setMenuOpen(true)
  }
  const pickResponder = (item: ResponderItem): void => {
    if (item.kind === 'fanout') chooseFanout(item.choice)
    else {
      setResponderId(item.member.id)
      chooseFanout(undefined)
    }
    closeMenu()
  }
  const pickMention = (item: ResponderItem): void => {
    if (mention === null || item.kind === 'fanout') return
    const next = insertMention(draft, mention, caret, item.member.name)
    pendingCaret.current = next.caret
    setDraft(next.text)
    setMentionActive(0)
  }
  const onMenuKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setMenuActive(index => moveResponderActive(index, event.key === 'ArrowDown' ? 1 : -1, menuItems.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = menuItems[Math.min(menuActive, menuItems.length - 1)]
      if (item === undefined) return
      if ((event.ctrlKey || event.metaKey) && item.kind !== 'fanout' && onOpenPersonaDm !== undefined) {
        onOpenPersonaDm(item.member.id)
        closeMenu(false)
        return
      }
      pickResponder(item)
    }
  }

  const send = (modeOverride?: 'queue' | 'steer', fanoutOverride?: FanoutChoice): void => {
    if (!canSend && modeOverride === undefined) return
    const text = buildOutbound()
    if (text.length === 0 && readyAttachmentIds(pending).length === 0) return
    const ids = readyAttachmentIds(pending)
    // CV-8: `Toda a equipe` para MAIS de 5 pede uma confirmação inline no chip antes de enviar (o custo que mais surpreende).
    const fanout = fanoutOverride ?? (menuMode ? fanoutChoice : undefined)
    if (fanoutOverride === undefined && !confirming && needsFanoutConfirm(fanout, fanoutChoices?.teamCount ?? 0)) {
      setConfirming(true)
      return
    }
    pushSentHistory(conversationKey, text)
    // D-103c: a dica de 1ª vez nunca fica por cima do fio depois do 1º envio.
    dismissWhoRespondsHint()
    // IV-10: a resposta a uma pergunta da persona vai para quem a recebe (answerAttention), não para o fio como mensagem nova. Rejeitou = o texto volta ao campo.
    if (replyTarget !== undefined && onSendReply !== undefined) {
      void Promise.resolve(onSendReply(text, ids)).catch(() => { setDraft(current => (current === '' ? text : current)) })
      setDraft('')
      setPending([])
      setPastedTexts({})
      setOpenPastedKey(null)
      setHistoryIndex(null)
      setShowLimits(false)
      onClearQuote?.()
      replyTarget.onClear()
      fieldRef.current?.focus()
      return
    }
    // Na fila: com a persona trabalhando OU com a cota esgotada (nesse caso a mensagem espera a cota voltar, com os anexos
    // desta sessão). Com a persona trabalhando e anexos o envio segue normal (a fila do passo atual só guarda texto).
    const mode = quotaBlocked ? 'queue' : (modeOverride ?? 'queue')
    // CV-3: outra persona escolhida = a mensagem sai com o `@Nome ` (o host roteia por menção); a mensagem fica no canal.
    const handle = menuMode && fanout === undefined && responder !== undefined && responder.id !== defaultId ? `@${responder.name.replace(/\s+/gu, '')}` : ''
    const routed = handle !== '' && !text.includes(handle) ? `${handle} ${text}` : text
    const shouldQueue = mode === 'queue' && (responderWorking || quotaBlocked) && responder !== undefined
      && onQueueMessage !== undefined && (ids.length === 0 || quotaBlocked)
    if (fanout !== undefined) {
      onSend?.(text, ids, { fanout })
    } else if (shouldQueue) {
      const attachments = pending.flatMap(row => (row.status === 'ready' ? [{ id: row.id, name: row.name }] : []))
      onQueueMessage(
        text,
        { id: responder.id, name: responder.name },
        quotaBlocked ? { heldForQuota: true, ...(attachments.length > 0 ? { attachments } : {}) } : undefined,
      )
    } else if (mode === 'steer' && responderWorking && onSteer !== undefined && responder !== undefined && ids.length === 0) {
      onSteer(text, { id: responder.id, name: responder.name })
    } else if (opinionContext !== undefined) {
      onSend?.(routed, ids, { opinionFor: opinionContext.requestId })
    } else onSend?.(routed, ids)
    setDraft('')
    setPending([])
    setPastedTexts({})
    setOpenPastedKey(null)
    setHistoryIndex(null)
    setShowLimits(false)
    onClearQuote?.()
    // CV-3: escolher outra persona vale SÓ para a próxima mensagem: depois de enviar o chip volta à Coordenação.
    setConfirming(false)
    if (opinionContext !== undefined) onClearOpinionContext?.()
    if (menuMode) {
      setResponderId(defaultId)
      chooseFanout(undefined)
    }
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
      data-lit=""
      className={styles.composer}
      aria-label={t('composer.placeholder')}
      onSubmit={(event) => {
        event.preventDefault()
        if (showStop) return
        if (responderWorking && sendMode === 'steer') send('steer')
        else send('queue')
      }}
    >
      {quotaBlocked && <LimitBanner t={t} until={quotaResumeLabel} onSeeUsage={onSeeUsage} otherEngine={otherEngine} />}
      {showLimits &&<ComposerLimitsPanel t={t} limits={engineLimits ?? ENGINE_LIMITS_UNAVAILABLE} onClose={() => { setShowLimits(false) }} />}
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
      {replyTarget !== undefined && (
        <div className={styles.quoteChip} data-persona-reply-target={replyTarget.id}>
          <Chip size="s" tone="plain" icon={<UiIcon name="copy" size={12} strokeWidth={2.2} />}>
            {replyTarget.label}
          </Chip>
          <button type="button" className={styles.attachRemove} aria-label={t('composer.steer.cancelEdit')} onClick={replyTarget.onClear}>
            <UiIcon name="close" size={14} strokeWidth={2.4} />
          </button>
        </div>
      )}
      {opinionContext !== undefined && (
        <div className={styles.quoteChip} data-persona-opinion-context="">
          <Chip size="s" tone="plain" icon={<UiIcon name="copy" size={12} strokeWidth={2.2} />}>
            {t('opinion.quoting', { question: opinionContext.question.slice(0, 60) })}
          </Chip>
          {onClearOpinionContext !== undefined && (
            <button type="button" className={styles.attachRemove} aria-label={t('composer.steer.cancelEdit')} onClick={onClearOpinionContext}>
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
      {menuMode && fanoutChoices !== undefined && (
        <FanoutChip
          t={t}
          choice={fanoutChoice}
          teamCount={fanoutChoices.teamCount}
          estimate={fanoutEstimate}
          confirming={confirming}
          onConfirm={() => { send('queue', 'everyone') }}
          onRelevantOnly={() => { send('queue', 'relevant') }}
        />
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
      {mentionItems.length > 0 && (
        <div className={styles.mentionMenu} data-persona-mention-menu="">
          <ResponderMenu
            t={t}
            listId={mentionListId}
            items={mentionItems}
            activeIndex={mentionIndex}
            selectedId={responder?.id ?? ''}
            teamFaces={teamFaces}
            onActivate={setMentionActive}
            onPick={pickMention}
          />
        </div>
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
          placeholder={quotaBlocked && quotaResumeLabel !== undefined && quotaResumeLabel.length > 0
            ? t('limit.placeholder', { time: quotaResumeLabel })
            : (placeholder ?? t('composer.placeholderChannel'))}
          aria-describedby={hintId}
          onChange={(event) => {
            setDraft(event.target.value)
            setCaret(event.target.selectionStart)
            setMentionActive(0)
            setMentionDismissed(null)
            if (historyIndex !== null) setHistoryIndex(null)
          }}
          onSelect={(event) => { setCaret(event.currentTarget.selectionStart) }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text/plain')
            if (text.trim().length === 0 && uploadAttachment !== undefined) {
              const images = clipboardImageFiles(event.clipboardData)
              if (images.length > 0) {
                event.preventDefault()
                for (const image of images) queueFile(image)
                return
              }
            }
            if (text.length < COMPOSER_LARGE_PASTE_BYTES || uploadAttachment === undefined) return
            event.preventDefault()
            queueFile(new File([text], t('composer.pasteFileName'), { type: 'text/plain' }), text)
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            // CV-3: com o `@nome` aberto, ↑↓ movem, Enter/Tab escolhem e Esc fecha (o texto fica como está).
            if (mentionItems.length > 0 && !event.nativeEvent.isComposing) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setMentionActive(moveResponderActive(mentionIndex, event.key === 'ArrowDown' ? 1 : -1, mentionItems.length))
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                const pick = mentionItems[mentionIndex]
                if (pick !== undefined) pickMention(pick)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setMentionDismissed(mention?.start ?? null)
                return
              }
            }
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
            // Esc no campo vazio também para a resposta (o mesmo que o botão Parar).
            if (event.key === 'Escape' && showStop && !event.nativeEvent.isComposing) {
              event.preventDefault()
              stop.onStop()
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
      <div className={styles.toolbarBox}>
        <div className={styles.toolbar}>
          <div className={styles.tools}>
            <div className={styles.toolButtons} data-persona-composer-tools="">
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
            </div>
            {responder !== undefined && !responderHidden && (
              <div className={styles.responderGroup} data-persona-composer-responder="">
                <span className={styles.divider} aria-hidden="true" />
                <div ref={responderBoxRef} className={styles.responderContainer}>
                  <label className={styles.responder}>
                    <span className={styles.responderLabel}>{t('composer.respondsLabel')}</span>
                    <Avatar name={responder.name} src={AVATAR_96[responder.id]} size={24} decorative />
                    <span className={styles.responderName} aria-hidden="true">{responderLabel}</span>
                    <UiIcon name="chevronDown" size={14} strokeWidth={2.4} />
                    {menuMode ? (
                      <button
                        type="button"
                        className={styles.responderSelect}
                        aria-label={t('composer.modelLabel')}
                        aria-haspopup="listbox"
                        aria-expanded={menuOpen}
                        {...(menuOpen ? { 'aria-controls': menuListId } : {})}
                        onClick={() => { if (menuOpen) closeMenu(false); else openMenu() }}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowDown' && !menuOpen) {
                            event.preventDefault()
                            openMenu()
                          }
                        }}
                      />
                    ) : (
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
                    )}
                  </label>
                  {menuMode && menuOpen && (
                    <div className={styles.responderPopover} role="dialog" aria-label={t('composer.modelLabel')} data-persona-responder-popover="">
                      <input
                        ref={menuInputRef}
                        className={styles.responderSearch}
                        type="search"
                        role="combobox"
                        aria-label={t('composer.modelLabel')}
                        placeholder={t('dm.searchPlaceholder')}
                        aria-expanded="true"
                        aria-controls={menuListId}
                        {...(menuItems.length > 0 ? { 'aria-activedescendant': optionId(menuListId, Math.min(menuActive, menuItems.length - 1)) } : {})}
                        value={menuQuery}
                        onChange={(event) => {
                          setMenuQuery(event.target.value)
                          setMenuActive(0)
                        }}
                        onKeyDown={onMenuKeyDown}
                      />
                      <ResponderMenu
                        t={t}
                        listId={menuListId}
                        items={menuItems}
                        activeIndex={Math.min(menuActive, menuItems.length - 1)}
                        selectedId={responder.id}
                        selectedFanout={fanoutChoice}
                        teamFaces={teamFaces}
                        onActivate={setMenuActive}
                        onPick={pickResponder}
                      />
                      {onOpenPersonaDm !== undefined && menuItems[Math.min(menuActive, menuItems.length - 1)]?.kind !== 'fanout' && menuItems.length > 0 && (
                        <p className={styles.responderFooter}>
                          {t('responder.footer', { name: (menuItems[Math.min(menuActive, menuItems.length - 1)] as Exclude<ResponderItem, { kind: 'fanout' }>).member.name })}
                        </p>
                      )}
                    </div>
                  )}
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
                        ? t('composer.autonomy.tip.on-request', { name: responder.name })
                        : t('composer.autonomy.tip.act-within-limits', { name: responder.name })
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
              </div>
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
          {engineLabel !== undefined && responderEngine !== undefined && responder !== undefined && (
            <Tooltip content={t('composer.enginePill.tip', { name: responder.name })}>
              <button
                type="button"
                className={styles.enginePill}
                data-persona-composer-engine=""
                aria-haspopup="dialog"
                aria-label={t('composer.enginePill.label', { name: responder.name, config: engineLabel })}
                onClick={() => { responderEngine.onOpen(responder.id) }}
              >
                {engineLabel}
                <UiIcon name="chevronDown" size={12} strokeWidth={2.2} />
              </button>
            </Tooltip>
          )}
          {responderWorking && (
            // O relógio nunca fica solto: o tooltip diz o que ele faz (a dica de texto some a ≤ 1180 px).
            <Tooltip content={sendMode === 'queue' ? t('composer.modeSteer') : t('composer.modeQueue')}>
              <button
                type="button"
                className={styles.attachRemove}
                data-persona-composer-mode=""
                aria-label={sendMode === 'queue' ? t('composer.modeSteer') : t('composer.modeQueue')}
                onClick={() => { setSendMode(mode => mode === 'queue' ? 'steer' : 'queue') }}
              >
                <UiIcon name={sendMode === 'queue' ? 'clock' : 'arrowRight'} size={18} strokeWidth={2.2} />
              </button>
            </Tooltip>
          )}
          {/* D-103c: com o seletor visível o chip clicável dele já diz a autonomia; este só existe quando o seletor não aparece. */}
          {responderAutonomy !== 'propose' && (responder === undefined || responderHidden) && (
            <Chip size="s" tone="plain" className={styles.autonomyChip}>
              {t(`composer.autonomy.${responderAutonomy}`)}
            </Chip>
          )}
          {voiceSlot?.(draft.trim() === '')}
          {showStop ? (
            <Tooltip content={t('composer.stop')} shortcut={['Esc']}>
              <Button
                variant="secondary"
                className={styles.stop}
                data-persona-composer-stop=""
                aria-label={t('composer.stopLabel', { name: stop.personaName })}
                icon={<UiIcon name="close" size={20} strokeWidth={2.2} />}
                onClick={() => {
                  stop.onStop()
                  fieldRef.current?.focus()
                }}
              >
                {t('composer.stop')}
              </Button>
            </Tooltip>
          ) : (
            <button
              type="submit"
              className={styles.send}
              data-mode={(responderWorking && sendMode === 'queue') || quotaBlocked ? 'queue' : undefined}
              disabled={!canSend}
              aria-label={(responderWorking && sendMode === 'queue') || quotaBlocked ? t('composer.sendQueue') : t('composer.send')}
            >
              <UiIcon name={(responderWorking && sendMode === 'queue') || quotaBlocked ? 'clock' : 'send'} size={20} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
