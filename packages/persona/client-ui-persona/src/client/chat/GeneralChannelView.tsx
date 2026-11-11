import { ChannelTeamFaces } from './ChannelTeamFaces.tsx'
import { isPlacesNavEnabled } from '../shell/nav-flag.ts'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { channelScene, channelSceneKey, houseEmptyArt } from '../decor/HouseDecor.tsx'
import { usePersonaMotion } from '../motion/index.ts'
import {
  Avatar,
  BrandIcon,
  DayDivider,
  Button,
  Chip,
  EmptyState,
  IconButton,
  REACTION_EMOJI,
  REACTION_IDS,
  ReactionChip,
  Skeleton,
  UiIcon,
  stickerUrl,
  Toast,
  ToastRegion,
  ActivityGroup,
  FixedRowVirtualScroller,
  type ActivityGroupProps,
  type ReactionId,
} from '../primitives/index.ts'
import { CHAT_MESSAGE_ROW_PX, CHAT_MESSAGE_VIRTUAL_MIN } from './message-stream-virtual.ts'
import type { ConversationSubjectUi } from './conversation-subjects.ts'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from './conversation-subjects.ts'
import { MoveMessageSubject } from './MoveMessageSubject.tsx'
import { subjectDisplayName } from './SubjectBar.tsx'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { TeamChannelStrip } from '../team/TeamChannelStrip.tsx'
import { isHeldAfterStop } from './queued-after-stop.ts'
import { QueuedMessageBubble, type QueuedMessageItem } from './QueuedMessageBubble.tsx'
import { nextQueueSeq, readQueuedMessages, writeQueuedMessages } from './composer-queue-store.ts'
import { ChannelComposer } from './ChannelComposer.tsx'
import type { ComposerSendOptions } from './ChannelComposer.tsx'
import type { FanoutChoice, FanoutEstimateUi } from './fanout/fanout-rules.ts'
import { MessageQuoteToolbar, type MessageQuote } from './MessageQuoteToolbar.tsx'
import type { ComposerSlashActions } from './composer-slash-commands.ts'
import type { EngineLimitsUi } from '../remote/engine-limits.ts'
import { MarkdownBody } from './markdown/MarkdownBody.tsx'
import { MessageSprig } from './MessageSprig.tsx'
import { isBubblesEnabled } from './bubbles-flag.ts'
import { isLampLightEnabled, useLampLight } from './lamp-light.ts'
import type { HostQueueControls } from './host-queue.ts'
import type { HostTurnControls } from './host-turn.ts'
import { useStreamAnnouncement } from './use-stream-announcement.ts'
import { TypingIndicator } from './TypingIndicator.tsx'
import { typingPersona } from './typing-indicator.ts'
import { bubbleNeedsWidth, groupPositions, type GroupPosition } from './message-grouping.ts'
import { SubjectBar, type SubjectBarProps } from './SubjectBar.tsx'
import { ReactionAdder, reactionIdFromEmoji } from './ReactionAdder.tsx'
import { TurnContextDrawer } from './TurnContextDrawer.tsx'
import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'
import { GestorPlanAdjustModal } from './GestorPlanAdjustModal.tsx'
import { GestorPlanMessageCard } from './GestorPlanMessageCard.tsx'
import { resolveGestorPlanForMessage } from './resolve-gestor-plan-display.ts'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import { resolveHostPersonaId } from '../remote/map-host-ui.ts'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import type { TeamView } from '../remote/persona-remote-types.ts'
import type { TurnContextActivityFoldUi, TurnContextUi } from '../remote/turn-context-ui.ts'
import { PersonaCardPopoverHost, usePersonaCardController } from '../profile/PersonaCardPopoverHost.tsx'
import { ConversationRunErrorCard } from './ConversationRunErrorCard.tsx'
import { HarnessEventLine } from './HarnessEventLine.tsx'
import { DailyBriefCard, type DailyBriefActions } from './DailyBriefCard.tsx'
import { useMessageFocus } from './message-focus.ts'
import { PersonaAskCard, hasAskChips } from '../ask/PersonaAskCard.tsx'
import { HandoffGroup, HandoffLine, ReviewLine } from './TeamLine.tsx'
import { ReviewedBySeal } from '../teamwork/ReviewedBySeal.tsx'
import { analyzeTeamStreamNoise, groupHelpRuns, handoffLineText, reviewLineText, type HandoffLineUi } from '../teamwork/team-lines-model.ts'
import { TaskProposalCard } from '../proposal/TaskProposalCard.tsx'
import { breaksGroup } from './group-breakers.ts'
import type { TaskProposalsBinding } from '../proposal/use-connected-task-proposals.ts'
import type { PersonaAsksBinding } from '../ask/use-connected-persona-asks.ts'
import { isTeamworkEnabled } from './teamwork-flag.ts'
import { isSystemActor } from './system-actor.ts'
import { TeamPlanCard } from './TeamPlanCard.tsx'
import { DeliveryCard } from './DeliveryCard.tsx'
import { DraftFilesLine } from './draft-files/DraftFilesLine.tsx'
import { ActionPreviewCard, type ActionDecision } from './ActionPreviewCard.tsx'
import { ActionEventLine } from './ActionEventLine.tsx'
import { InitiativeAskCard, type InitiativeChoice } from './InitiativeAskCard.tsx'
import { isActionPreviewEnabled } from './action-preview-flag.ts'
import { buildFanoutBlocks } from './fanout/fanout-block-model.ts'
import { FanoutBlock } from './fanout/FanoutBlock.tsx'
import { OpinionBlock, type OpinionActions } from './opinion/OpinionBlock.tsx'
import { buildOpinionBlocks } from './opinion/opinion-model.ts'
import type { RunErrorHandlerContext } from './run-error-handlers.ts'
import styles from './GeneralChannelView.module.css'

export interface GeneralChannelViewProps extends PropsLocale<'persona.chat'> {
  readonly shellT: PropsLocale<'persona.shell'>['t']
  readonly members: readonly ChannelPersonaMember[]
  readonly messages: readonly ChannelMessageUi[]
  /** Os dados do host ainda não chegaram (recarregar): skeleton em vez de "equipe vazia" / "canal quietinho". */
  readonly loading?: boolean | undefined
  readonly passThroughFollowers?: readonly { readonly name: string; readonly id?: string | undefined }[]
  readonly turnContext?: TurnContextUi | null
  readonly turnActivityLabels?: import('../primitives/Pooled.tsx').ActivityGroupProps['labels'] | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  /** PRO-4 / C5b — focus the real task card on Quadros. */
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly onSendMessage?: ((body: string, attachmentIds?: readonly string[], options?: ComposerSendOptions) => void) | undefined
  /** CV-8: o canal oferece "Toda a equipe ({n})" e "Quem tiver algo a dizer" no "Quem responde". */
  readonly fanoutChoices?: { readonly teamCount: number } | undefined
  readonly onFanoutChoiceChange?: ((choice: FanoutChoice | undefined) => void) | undefined
  readonly fanoutEstimate?: FanoutEstimateUi | undefined
  readonly uploadAttachment?: ((file: File) => Promise<{ readonly id: string; readonly name: string }>) | undefined
  /** Empty-team CTA in the banner (Prism wires: open onboarding/team builder). */
  readonly onBuildTeam?: (() => void) | undefined
  /** Header ? → Ajuda (guide canais). */
  readonly onOpenHelp?: (() => void) | undefined
  readonly onOpenSearch?: (() => void) | undefined
  /** Sino do cabeçalho: abre o que espera a pessoa (Aprovações). Sem handler, o sino nem aparece (nada de controle morto). */
  readonly onOpenNotifications?: (() => void) | undefined
  /** Quantas decisões esperam a pessoa; o ponto do sino só aparece com pelo menos 1. */
  readonly notificationsCount?: number | undefined
  /** Menu da conta (ainda não existe): sem handler o avatar é só a presença, não um botão. */
  readonly onOpenAccount?: (() => void) | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
  /** HT-3: "Retomar {persona}" na linha de evento do fio. */
  readonly onResumePersona?: ((personaId: string) => void | Promise<void>) | undefined
  /** D-090 (TEAM-7): o que os botões do cartão "Bom dia" fazem. */
  readonly dailyBriefActions?: DailyBriefActions | undefined
  /** D-084 (HT-9): a decisão da pessoa no cartão de prévia de ação externa (sem ela o cartão é só leitura). */
  readonly onDecideAction?: ((decision: ActionDecision) => void | Promise<void>) | undefined
  /** D-084 §2: "Desfazer" na linha de uma ação direta (só existe quando o host marca `undoable`). */
  readonly onUndoAction?: ((activityId: string) => void | Promise<void>) | undefined
  /** D-084 §3: a saída do pedido de iniciativa (Permitir desta vez · Sempre permitir · Agora não). */
  readonly onDecideInitiative?: ((approvalId: string, choice: InitiativeChoice) => void | boolean | Promise<void | boolean>) | undefined
  /** D-084 §3: o Desfazer do Toast de "Sempre permitir" (revoga a concessão). */
  readonly onUndoInitiativeGrant?: ((approvalId: string) => void | Promise<void>) | undefined
  /** EQUIPE-REAL §0: "precisa de você" (cartão do plano) e "Revisar" (cartão de entrega) abrem Aprovações com este item selecionado. */
  readonly onOpenApprovalItem?: ((approvalId: string) => void) | undefined
  /** IV-10 (atrás de `persona.flag.personaAsk`): o estado vivo e o "responder" dos cartões de pergunta com chips; sem isto o fio mostra a frase simples do host. */
  readonly personaAsks?: PersonaAsksBinding | undefined
  /** P1-9 (atrás de `persona.flag.taskProposal`): o estado vivo e o Aceitar / Agora não / Desfazer dos cartões "Proposta de {persona}"; sem isto o fio mostra a frase simples do host. */
  readonly taskProposals?: TaskProposalsBinding | undefined
  /** IV-6: o cartão "Pergunta à parte" (`/lado`, `/resumo`), acima do composer e fora do fio. */
  readonly asideSlot?: ReactNode
  readonly team?: TeamView | null
  readonly personaCard?: PersonaCardShellBridge | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  /** Clicar no rosto da persona abre a DM com ela (CV-4); o cartão vem por hover longo, ⋯ ou Shift+F10. */
  readonly onOpenPersonaDm?: ((personaId: string) => void) | undefined
  /** CV-6 (host): o nome da equipe para a qual o canal nasceu; mostra "Canal criado para a equipe de {team}" no começo do fio. */
  readonly createdForTeam?: string | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  /** WAVE2 assuntos (Prism data; Muse styles SubjectBar). */
  readonly subjectBar?: Omit<SubjectBarProps, 't'> | undefined
  readonly subjectsLoadError?: import('../remote/persona-remote-unwrap.ts').PersonaRemoteError | null | undefined
  readonly onRetrySubjects?: (() => void) | undefined
  readonly composerSubjectPlaceholder?: string | undefined
  readonly composerSubjectColorIndex?: import('./conversation-subjects.ts').SubjectColorIndex | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  readonly onUndoMoveMessage?: ((messageId: string, revertSubjectId: string) => void) | undefined
  readonly gestorPlansById?: Readonly<Record<string, GestorPlanView>>
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onFeedbackGestorPlan?: ((planId: string, comment: string) => void) | undefined
  readonly gestorPlanAdjustingIds?: Readonly<Record<string, true>> | undefined
  readonly conversationKey?: string | undefined
  /** O que cada comando "/" faz (P0-27); sem handler o comando não aparece no menu. */
  readonly slashActions?: ComposerSlashActions | undefined
  /** IV-4: limites reais do motor (`/limites` e gaveta "Contexto usado"); sem fonte, "indisponível". */
  readonly engineLimits?: EngineLimitsUi | undefined
  /** O `/limites` abriu: quem monta a tela lê as cotas agora. */
  readonly onOpenLimits?: (() => void) | undefined
  readonly quotaBlocked?: boolean | undefined
  /** O host já disse como está a cota (esgotada ou livre). Sem isso, a fila "por cota" restaurada espera até 15 s. */
  readonly quotaKnown?: boolean | undefined
  readonly quotaResumeLabel?: string | undefined
  readonly onResumeQuota?: (() => void) | undefined
  readonly onSwapAccount?: (() => void) | undefined
  /** P0-19: "Ver uso e limites" da faixa "No limite até {hora}". */
  readonly onSeeUsage?: (() => void) | undefined
  /** P0-19: outro motor conectado → "Usar {motor} enquanto isso". Sem handler, o botão não existe. */
  readonly otherEngine?: { readonly name: string; readonly onUse: () => void } | undefined
  readonly responderAutonomy?: import('../persona-editor/persona-draft.ts').AutonomyLevel | undefined
  /** UX-PHASE §6: messages waiting for the responder's current step; local queue when the host has none. */
  readonly queuedMessages?: readonly QueuedMessageItem[] | undefined
  readonly onSendQueuedNow?: ((id: string) => void) | undefined
  readonly onEditQueued?: ((id: string) => void) | undefined
  readonly onRemoveQueued?: ((id: string) => void) | undefined
  /** FL-11 / P0-18 (atrás de `persona.flag.workingControl`): a fila por item que o HOST guarda. Sem isto, a fila local de sempre. */
  readonly hostQueue?: HostQueueControls | undefined
  /** FL-11 / IV-5 (atrás de `persona.flag.workingControl`): Parar e "Direcionar agora" de verdade (host). Sem isto, o botão é sempre o de enviar. */
  readonly turnControls?: HostTurnControls | undefined
  /** IV-10: "Responder" a uma pergunta da persona (o chip e o envio que chama answerAttention). */
  readonly replyTarget?: { readonly id: string; readonly label: string; readonly onClear: () => void } | undefined
  readonly onSendReply?: ((text: string, attachmentIds: readonly string[]) => Promise<void>) | undefined
  /** D-090 (TEAM-8c, atrás de `persona.flag.teamwork`): o que os botões do cartão "Pedido de opinião" fazem (imagem, trocar o motor, opinar). */
  readonly opinionActions?: OpinionActions | undefined
  /** FR-3: faixa "Falta uma IA" fixa acima do composer (Connected liga ao host). */
  readonly engineBanner?: ReactNode | undefined
}

function isReactionId(id: string): id is ReactionId {
  return (REACTION_IDS as readonly string[]).includes(id)
}

function reactionLabels(t: PropsLocale<'persona.chat'>['t']): Readonly<Record<ReactionId, string>> {
  return {
    joinha: t('reaction.joinha'),
    coracao: t('reaction.coracao'),
    rindo: t('reaction.rindo'),
    comemorando: t('reaction.comemorando'),
    pensando: t('reaction.pensando'),
    feito: t('reaction.feito'),
  }
}

function avatarFor(authorId: string): string | undefined {
  return authorId === 'user' ? undefined : AVATAR_96[authorId as keyof typeof AVATAR_96]
}

/** #geral — header, illustrated team banner, grouped stream with reactions, full composer (DESIGN-SYSTEM §6–7). */
export function GeneralChannelView({
  t,
  shellT,
  members,
  messages,
  loading = false,
  passThroughFollowers = [],
  turnContext,
  turnActivityLabels,
  onLoadTurnContext,
  onOpenTaskOnBoard,
  onSendMessage,
  fanoutChoices,
  onFanoutChoiceChange,
  fanoutEstimate,
  onBuildTeam,
  onOpenHelp,
  onOpenSearch,
  onOpenNotifications,
  notificationsCount = 0,
  onOpenAccount,
  runErrorHandlers,
  onRetrySend,
  onResumePersona,
  dailyBriefActions,
  onDecideAction,
  onUndoAction,
  onDecideInitiative,
  onUndoInitiativeGrant,
  onOpenApprovalItem,
  personaAsks,
  taskProposals,
  asideSlot,
  uploadAttachment,
  team = null,
  personaCard,
  openPersonaProfile,
  onOpenPersonaDm,
  createdForTeam,
  memberId,
  onToggleReaction,
  subjectBar,
  subjectsLoadError = null,
  onRetrySubjects,
  composerSubjectPlaceholder,
  composerSubjectColorIndex,
  subjectMoveTargets,
  onMoveMessageSubject,
  onUndoMoveMessage,
  gestorPlansById = {},
  onApproveGestorPlan,
  onRejectGestorPlan,
  onFeedbackGestorPlan,
  gestorPlanAdjustingIds = {},
  conversationKey = 'channel:geral',
  slashActions,
  engineLimits,
  onOpenLimits,
  quotaBlocked,
  quotaKnown,
  quotaResumeLabel,
  onResumeQuota,
  onSwapAccount,
  onSeeUsage,
  otherEngine,
  responderAutonomy,
  queuedMessages,
  onSendQueuedNow,
  onEditQueued,
  onRemoveQueued,
  hostQueue,
  turnControls,
  opinionActions,
  replyTarget,
  onSendReply,
  engineBanner,
}: GeneralChannelViewProps): ReactNode {
  // A fila local sobrevive a recarregar a janela (Muse): volta como os mesmos balões tracejados, "Ainda na fila". Quando o host
  // guardar a fila (IV-5), `queuedMessages` a substitui.
  const [localQueued, setLocalQueued] = useState<readonly QueuedMessageItem[]>(() => readQueuedMessages(conversationKey))
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null)
  const [removedQueued, setRemovedQueued] = useState<QueuedMessageItem | null>(null)
  const [queueAnnounce, setQueueAnnounce] = useState('')
  /** P0-19: "A cota voltou · N mensagens saíram da fila". */
  const [quotaBackCount, setQuotaBackCount] = useState<number | null>(null)
  const queueSeq = useRef(nextQueueSeq(localQueued))
  useEffect(() => { writeQueuedMessages(conversationKey, localQueued) }, [conversationKey, localQueued])
  useEffect(() => {
    if (quotaBackCount === null) return undefined
    const timer = setTimeout(() => { setQuotaBackCount(null) }, 6_000)
    return () => { clearTimeout(timer) }
  }, [quotaBackCount])
  // Com a fila do host, os balões dele vêm primeiro; o que tem anexo (o host guarda só texto) continua na fila local.
  // TEAM-8c: a opinião que a pessoa está dando ("Dar minha opinião"); vale para a próxima mensagem e some depois de enviar ou ao cancelar.
  const [opinionTarget, setOpinionTarget] = useState<{ readonly requestId: string; readonly question: string } | null>(null)
  const effectiveQueued = queuedMessages ?? (hostQueue === undefined ? localQueued : [...hostQueue.items, ...localQueued])
  const isHostItem = (id: string): boolean => hostQueue?.items.some(item => item.id === id) === true
  const editingQueuedItem = effectiveQueued.find(q => q.id === editingQueuedId)

  /** Enviar de verdade: se a mensagem veio de uma edição da fila, o item original sai da fila. */
  const sendMessage = (body: string, attachmentIds?: readonly string[], options?: ComposerSendOptions): void => {
    if (editingQueuedId !== null && hostQueue !== undefined && isHostItem(editingQueuedId)) {
      // Editar um balão do host troca o texto dele (não é uma mensagem nova).
      hostQueue.submitEdit(editingQueuedId, body)
      setEditingQueuedId(null)
      return
    }
    if (editingQueuedId !== null) {
      setLocalQueued(prev => prev.filter(q => q.id !== editingQueuedId))
      setEditingQueuedId(null)
    }
    if (options === undefined) onSendMessage?.(body, attachmentIds)
    else onSendMessage?.(body, attachmentIds ?? [], options)
  }
  /** "Na fila" com a persona trabalhando: guarda como balão tracejado até ela terminar o passo atual. */
  const enqueueMessage = (
    text: string,
    responder: { readonly id: string; readonly name: string },
    options?: { readonly heldForQuota?: boolean; readonly attachments?: readonly { readonly id: string; readonly name: string }[] },
  ): void => {
    if (hostQueue !== undefined && (options?.attachments === undefined || options.attachments.length === 0)) {
      if (editingQueuedId !== null && isHostItem(editingQueuedId)) {
        hostQueue.submitEdit(editingQueuedId, text)
      } else {
        if (editingQueuedId !== null) setLocalQueued(prev => prev.filter(q => q.id !== editingQueuedId))
        hostQueue.enqueue(text, responder, options?.heldForQuota === true ? 'quota' : undefined)
      }
      setEditingQueuedId(null)
      setQueueAnnounce(t('composer.steer.queuedAnnounce'))
      return
    }
    queueSeq.current += 1
    const item: QueuedMessageItem = {
      id: `queued-${String(queueSeq.current)}`,
      text,
      targetPersonaName: responder.name,
      targetPersonaId: responder.id,
      ...(options?.heldForQuota === true ? { heldForQuota: true } : {}),
      ...(options?.attachments !== undefined && options.attachments.length > 0 ? { attachments: options.attachments } : {}),
    }
    setLocalQueued(prev => [...prev.filter(q => q.id !== editingQueuedId), item])
    setEditingQueuedId(null)
    setQueueAnnounce(t('composer.steer.queuedAnnounce'))
  }
  /** Envia um item da fila; o segundo argumento só existe quando há anexos (contrato antigo: `onSendMessage(texto)`). */
  const dispatchQueued = (item: QueuedMessageItem): void => {
    const ids = item.attachments?.map(file => file.id) ?? []
    if (ids.length > 0) onSendMessage?.(item.text, ids)
    else onSendMessage?.(item.text)
  }
  const handleSendQueuedNow = (id: string): void => {
    if (hostQueue !== undefined && isHostItem(id)) {
      hostQueue.sendNow(id)
      if (editingQueuedId === id) setEditingQueuedId(null)
      setQueueAnnounce(t('composer.steer.sentAnnounce'))
      return
    }
    if (onSendQueuedNow !== undefined) { onSendQueuedNow(id); return }
    const item = localQueued.find(q => q.id === id)
    if (item === undefined) return
    setLocalQueued(prev => prev.filter(q => q.id !== id))
    if (editingQueuedId === id) setEditingQueuedId(null)
    dispatchQueued(item)
    setQueueAnnounce(t('composer.steer.sentAnnounce'))
  }
  const handleEditQueued = (id: string): void => {
    if (onEditQueued !== undefined) { onEditQueued(id); return }
    setEditingQueuedId(id)
  }
  const handleRemoveQueued = (id: string): void => {
    if (hostQueue !== undefined && isHostItem(id)) {
      hostQueue.drop(id)
      if (editingQueuedId === id) setEditingQueuedId(null)
      return
    }
    if (onRemoveQueued !== undefined) { onRemoveQueued(id); return }
    const item = localQueued.find(q => q.id === id)
    setLocalQueued(prev => prev.filter(q => q.id !== id))
    if (editingQueuedId === id) setEditingQueuedId(null)
    if (item !== undefined) setRemovedQueued(item)
  }
  const undoRemoveQueued = (): void => {
    if (hostQueue?.removed != null) { hostQueue.undoDrop(); return }
    if (removedQueued !== null) setLocalQueued(prev => [...prev, removedQueued])
    setRemovedQueued(null)
  }
  useEffect(() => {
    if (removedQueued === null) return undefined
    const timer = setTimeout(() => { setRemovedQueued(null) }, 6_000)
    return () => { clearTimeout(timer) }
  }, [removedQueued])
  // O Toast do Tirar do host some sozinho (passou o tempo do Desfazer); o erro do host também (a mensagem é dele, o tempo é nosso).
  const hostRemoved = hostQueue?.removed ?? null
  const hostError = hostQueue?.error ?? turnControls?.error ?? null
  const dismissHostRemoved = hostQueue?.dismissRemoved
  const clearQueueError = hostQueue?.clearError
  const clearTurnError = turnControls?.clearError
  const clearHostError = useCallback(() => { clearQueueError?.(); clearTurnError?.() }, [clearQueueError, clearTurnError])
  useEffect(() => {
    if (hostRemoved === null || dismissHostRemoved === undefined) return undefined
    const timer = setTimeout(() => { dismissHostRemoved() }, 6_000)
    return () => { clearTimeout(timer) }
  }, [hostRemoved, dismissHostRemoved])
  useEffect(() => {
    if (hostError === null) return undefined
    const timer = setTimeout(() => { clearHostError() }, 6_000)
    return () => { clearTimeout(timer) }
  }, [hostError, clearHostError])
  // Depois de recarregar, `quotaBlocked: false` ainda é "não sei". Um item guardado "por cota" espera o PRIMEIRO estado de cota
  // do host (o que chegar primeiro: o estado ou 15 s) e só então decide: cota voltou → sai; ainda no limite → fica (Muse).
  const [quotaWaitOver, setQuotaWaitOver] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => { setQuotaWaitOver(true) }, 15_000)
    return () => { clearTimeout(timer) }
  }, [])
  const quotaSettled = quotaKnown === true || quotaWaitOver
  // FL-11: migração ÚNICA da fila local para o host (com a flag ligada). Só sai do armazenamento local DEPOIS que o host aceitou; o que tem anexo (o host
  // guarda só texto) ou perdeu o anexo fica como está. Enquanto migra, o agendador local não toca nesses balões (senão sairiam em duplicata).
  const migratingIds = useRef<Set<string>>(new Set())
  const migrationTried = useRef(false)
  const [migrationTick, setMigrationTick] = useState(0)
  useEffect(() => {
    if (hostQueue === undefined || migrationTried.current) return
    migrationTried.current = true
    const movable = localQueued.filter(item => (item.attachments === undefined || item.attachments.length === 0)
      && (item.lostAttachmentNames === undefined || item.lostAttachmentNames.length === 0))
    if (movable.length === 0) return
    for (const item of movable) migratingIds.current.add(item.id)
    void (async () => {
      const moved = new Set<string>()
      for (const item of movable) {
        // Sem a persona alvo conhecida não há para quem enfileirar: o balão fica local, como está.
        if (item.targetPersonaId === undefined) break
        const accepted = await Promise.resolve(hostQueue.enqueue(item.text, { id: item.targetPersonaId, name: item.targetPersonaName }, item.heldForQuota === true ? 'quota' : undefined)).catch(() => false)
        if (accepted === false) break
        moved.add(item.id)
      }
      for (const item of movable) migratingIds.current.delete(item.id)
      if (moved.size > 0) setLocalQueued(prev => prev.filter(row => !moved.has(row.id)))
      setMigrationTick(tick => tick + 1)
    })()
  }, [hostQueue, localQueued])
  // A fila sai sozinha quando a persona alvo termina o passo atual (ou some do elenco). O que entrou na fila por falta de
  // cota (P0-19) só sai quando a cota voltar, e então aparece "A cota voltou · N mensagens saíram da fila". Item que perdeu o
  // anexo no recarregamento NUNCA sai sozinho (sairia sem o anexo, calado): fica com o aviso até a pessoa decidir.
  useEffect(() => {
    if (queuedMessages !== undefined || localQueued.length === 0) return
    const ready = localQueued.filter((item) => {
      if (item.id === editingQueuedId) return false
      if (migratingIds.current.has(item.id)) return false
      if (item.lostAttachmentNames !== undefined && item.lostAttachmentNames.length > 0) return false
      if (item.heldForQuota === true && (quotaBlocked === true || (item.restored === true && !quotaSettled))) return false
      const target = members.find(member => member.id === item.targetPersonaId)
      return target === undefined || target.state !== 'working'
    })
    if (ready.length === 0) return
    setLocalQueued(prev => prev.filter(item => !ready.some(r => r.id === item.id)))
    for (const item of ready) dispatchQueued(item)
    setQueueAnnounce(t('composer.steer.sentAnnounce'))
    const heldSent = ready.filter(item => item.heldForQuota === true).length
    if (heldSent > 0) setQuotaBackCount(heldSent)
  }, [members, localQueued, editingQueuedId, queuedMessages, onSendMessage, t, quotaBlocked, quotaSettled, migrationTick])
  const [moveToast, setMoveToast] = useState<{ readonly messageId: string; readonly subjectLabel: string; readonly revertSubjectId: string } | null>(null)
  const [pendingQuote, setPendingQuote] = useState<MessageQuote | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<{ readonly planId: string; readonly gestorName: string } | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  // CONVERSAS-SPEC (D-077): o cabeçalho novo e a barra única andam atrás da mesma flag do A-1.
  const singleBar = isPlacesNavEnabled()
  const card = usePersonaCardController()
  const cardData = card.personaId === null || personaCard === undefined
    ? undefined
    : personaCard.cardInfo(card.personaId)
  const coordinationAnimal = (members.find(member => member.systemRoles?.includes('coordination') === true) ?? members[0])?.id
  const personaCardTrigger = personaCard === undefined || team === null
    ? undefined
    : (ref: string) => {
      const hostId = resolveHostPersonaId(team, ref)
      const props = card.triggerProps(hostId)
      return {
        ...props,
        onPointerEnter: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(hostId)
          props.onPointerEnter(event)
        },
        onClick: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(hostId)
          props.onClick(event)
        },
      }
    }
  // CV-4: no rosto da faixa da equipe, clicar = DM; o cartão por hover longo / ⋯ / Shift+F10.
  const faceEnabled = personaCard !== undefined && team !== null && onOpenPersonaDm !== undefined
  const personaFace = !faceEnabled
    ? undefined
    : (ref: string) => {
      const hostId = resolveHostPersonaId(team, ref)
      const face = card.faceProps(hostId, () => { onOpenPersonaDm(hostId) })
      return {
        ...face,
        onPointerEnter: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(hostId)
          face.onPointerEnter(event)
        },
      }
    }
  const personaMenu = !faceEnabled
    ? undefined
    : (ref: string) => {
      const hostId = resolveHostPersonaId(team, ref)
      const menu = card.menuProps(hostId)
      return {
        ...menu,
        onClick: (event: MouseEvent<HTMLElement>) => {
          personaCard.prefetch(hostId)
          menu.onClick(event)
        },
      }
    }
  const composerProps = {
    ...(onSendMessage !== undefined ? { onSend: sendMessage, onQueueMessage: enqueueMessage } : {}),
    ...(uploadAttachment !== undefined ? { uploadAttachment } : {}),
    ...(composerSubjectPlaceholder !== undefined ? { placeholder: composerSubjectPlaceholder } : {}),
    ...(composerSubjectColorIndex !== undefined ? { activeSubjectColorIndex: composerSubjectColorIndex } : {}),
    conversationKey,
    pendingQuote,
    onClearQuote: () => { setPendingQuote(null) },
    ...(slashActions === undefined ? {} : { slashActions }),
    ...(engineLimits === undefined ? {} : { engineLimits }),
    ...(onOpenLimits === undefined ? {} : { onOpenLimits }),
    ...(quotaBlocked === undefined ? {} : { quotaBlocked }),
    ...(quotaResumeLabel === undefined ? {} : { quotaResumeLabel }),
    ...(onResumeQuota === undefined ? {} : { onResumeQuota }),
    ...(onSwapAccount === undefined ? {} : { onSwapAccount }),
    ...(onSeeUsage === undefined ? {} : { onSeeUsage }),
    ...(otherEngine === undefined ? {} : { otherEngine }),
    ...(responderAutonomy === undefined ? {} : { responderAutonomy }),
    ...(replyTarget === undefined ? {} : { replyTarget }),
    ...(onSendReply === undefined ? {} : { onSendReply }),
    ...(opinionTarget === null ? {} : { opinionContext: opinionTarget, onClearOpinionContext: () => { setOpinionTarget(null) } }),
    ...(fanoutChoices === undefined ? {} : { fanoutChoices }),
    ...(onFanoutChoiceChange === undefined ? {} : { onFanoutChoiceChange }),
    ...(fanoutEstimate === undefined ? {} : { fanoutEstimate }),
    ...(onOpenPersonaDm === undefined ? {} : { onOpenPersonaDm }),
    ...(turnControls === undefined ? {} : { onSteer: turnControls.steer }),
    ...(turnControls?.stoppable == null ? {} : { stop: { personaName: turnControls.stoppable.personaName, onStop: turnControls.stop } }),
    // Muse 03:26: com o controle de trabalho ligado, "respondendo" é só quem de fato responde a esta conversa (não qualquer persona trabalhando numa Tarefa).
    ...(turnControls === undefined ? {} : { responding: turnControls.stoppable != null }),
  }
  const userName = messages.find(message => message.authorId === 'user')?.authorName ?? t('message.you')
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id
  // P1-4: "{persona} está escrevendo…" (atrás da mesma flag do controle de trabalho: só com `turnControls`).
  const typing = turnControls === undefined ? null : typingPersona(messages, members)
  const typingId = typing?.id ?? ''
  // Luz da luminária (NIGHT-THEME-SPEC §5): só com `persona.flag.lampLight` + balões; sem isso nada disto existe.
  const lamp = isLampLightEnabled()
  const lampRef = useLampLight<HTMLDivElement>(lamp, messages.length)

  useEffect(() => {
    const node = scrollRef.current
    if (node === null || lastId === undefined) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 240
    if (nearBottom) node.scrollTo({ top: node.scrollHeight })
  }, [lastId, typingId])

  return (
    <div className={styles.view} data-persona-root="" ref={lampRef} {...(lamp ? { 'data-lamp': '' } : {})}>
      {lamp && <div className={styles.lampLayer} aria-hidden="true" />}
      <header className={styles.header}>
        {/* BR-P4 (atrás de `persona.flag.houseDecor`): o canal de uma equipe ganha o ícone-cena dela no lugar do selo "#". */}
        {(singleBar && createdForTeam !== undefined ? channelScene(createdForTeam) : null) ?? (
          <span className={styles.hashBadge} aria-hidden="true">
            <BrandIcon name="canais" size={22} />
          </span>
        )}
        {singleBar ? (
          // CV-2: a barra única já diz onde a pessoa está ("Conversas" deixou de ser um lugar): sem eyebrow; "# nome",
          // a equipe do canal e os rostos empilhados.
          <div className={styles.headerTitles}>
            <h1 className={styles.channelTitle}>{t('header.channelGeneral')}</h1>
            <p className={styles.subtitle}>
              {members.length === 0
                ? t('header.subtitle')
                : createdForTeam === undefined
                  ? t(members.length === 1 ? 'header.teamLine.one' : 'header.teamLine', { count: members.length })
                  : t(members.length === 1 ? 'header.teamLineFor.one' : 'header.teamLineFor', { team: createdForTeam, count: members.length })}
            </p>
          </div>
        ) : (
          <div className={styles.headerTitles}>
            <p className={styles.eyebrow}>{t('header.section')}</p>
            <h1 className={styles.channelTitle}>{t('header.channelGeneral')}</h1>
            <p className={styles.subtitle}>{t('header.subtitle')}</p>
          </div>
        )}
        {singleBar && <ChannelTeamFaces members={members} label={t('header.teamFaces')} />}
        <div className={styles.headerTools}>
          <IconButton
            label={t('header.search')}
            icon={<BrandIcon name="busca" size={20} />}
            {...(onOpenSearch === undefined ? {} : { onClick: onOpenSearch })}
          />
          {onOpenNotifications !== undefined && (
            <IconButton
              label={notificationsCount > 0 ? t('header.notificationsCount', { count: notificationsCount }) : t('header.notifications')}
              icon={<UiIcon name="bell" size={21} />}
              badge={notificationsCount > 0}
              onClick={onOpenNotifications}
            />
          )}
          <IconButton
            label={t('header.help')}
            icon={<UiIcon name="help" size={21} />}
            {...(onOpenHelp === undefined ? {} : { onClick: onOpenHelp })}
          />
          {onOpenAccount === undefined ? (
            <span className={styles.userButton} data-static="">
              <Avatar name={userName} size={40} presence="online" decorative />
            </span>
          ) : (
            <button type="button" className={styles.userButton} aria-label={t('header.userMenu')} onClick={onOpenAccount}>
              <Avatar name={userName} size={40} presence="online" decorative />
              <UiIcon name="chevronDown" size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      {subjectBar !== undefined && (
        <div className={styles.subjectRow}>
          {subjectsLoadError !== null && subjectsLoadError !== undefined && (
            <div className={styles.subjectError} role="status">
              <p>{t('subjects.loadError')}</p>
              {onRetrySubjects !== undefined && (
                <button type="button" className={styles.subjectRetry} onClick={() => { onRetrySubjects() }}>
                  {t('subjects.retry')}
                </button>
              )}
            </div>
          )}
          <SubjectBar t={t} {...subjectBar} />
        </div>
      )}

      <div className={styles.scroll} ref={scrollRef} tabIndex={0} role="region" aria-label={t('header.channelGeneral')}>
        <div className={styles.column}>
          <TeamChannelStrip
            t={shellT}
            members={members}
            loading={loading}
            onBuildTeam={onBuildTeam}
            {...(personaFace === undefined || personaMenu === undefined ? {} : { personaFace, personaMenu })}
            {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
          />
          {passThroughFollowers.length > 0 && (
            <ul className={styles.passThroughList} aria-live="polite">
              {passThroughFollowers.map(row => (
                <li key={row.name} className={styles.passThrough}>
                  {personaCardTrigger !== undefined && row.id !== undefined ? (
                    <button type="button" className={styles.passThroughButton} {...personaCardTrigger(row.id)}>
                      {t('stream.passThrough', { name: row.name })}
                    </button>
                  ) : t('stream.passThrough', { name: row.name })}
                </li>
              ))}
            </ul>
          )}
          <div
            ref={streamRef}
            className={styles.stream}
            data-persona-channel-stream=""
            {...(messages.length === 0 ? { 'data-empty': '' } : {})}
            {...(subjectBar?.panelId === undefined ? { role: 'log' as const } : { id: subjectBar.panelId, role: 'tabpanel' as const })}
            aria-label={t('header.channelGeneral')}
            aria-live="polite"
          >
            <MessageQuoteToolbar
              t={t}
              containerRef={streamRef}
              onQuote={(quote) => { setPendingQuote({ ...quote, comment: '' }) }}
            />
            {singleBar && createdForTeam !== undefined && (
              <p className={styles.channelCreated}>{t('channel.created', { team: createdForTeam })}</p>
            )}
            {messages.length === 0 && loading ? (
              <div className={styles.streamSkeleton} aria-busy="true" data-loading="">
                <span className="persona-sr-only" role="status">{t('stream.loading')}</span>
                {[78, 52, 66].map(width => (
                  <div key={width} className={styles.skeletonRow} aria-hidden="true">
                    <Skeleton width={32} height={32} shape="circle" />
                    <div className={styles.skeletonLines}>
                      <Skeleton width={96} height={12} />
                      <Skeleton width={`${String(width)}%`} height={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 && singleBar && createdForTeam !== undefined ? (
              // CV-7 (Muse): o vazio do canal de EQUIPE usa o ÍCONE-CENA da própria equipe (a 96 px; o mesmo nos dois temas), nunca a arte do #geral.
              <EmptyState
                compact
                illustration={ILLUSTRATIONS[channelSceneKey(createdForTeam)] ?? ILLUSTRATIONS['channel-equipe'] ?? ILLUSTRATIONS['empty-dm']}
                artSize={96}
                title={t('channel.empty', { team: createdForTeam })}
                body={<ChannelTeamFaces members={members} label={t('header.teamFaces')} />}
              />
            ) : messages.length === 0 ? (
              <EmptyState
                compact
                illustration={ILLUSTRATIONS['empty-dm']}
                art={houseEmptyArt('empty-dm', 'empty-geral-noite')}
                title={t('stream.emptyTitle')}
                body={t('stream.emptyBody')}
              />
            ) : (
              <MessageList
                t={t}
                team={team}
                messages={messages}
                {...(createdForTeam === undefined ? {} : { fanoutTeamName: createdForTeam })}
                {...(dailyBriefActions === undefined ? {} : { dailyBriefActions })}
                opinionActions={{ ...(opinionActions ?? {}), onGiveOpinion: (request) => { setOpinionTarget(request) } }}
                {...(onDecideAction === undefined ? {} : { onDecideAction })}
                {...(onUndoAction === undefined ? {} : { onUndoAction })}
                {...(onDecideInitiative === undefined ? {} : { onDecideInitiative })}
                {...(onUndoInitiativeGrant === undefined ? {} : { onUndoInitiativeGrant })}
                {...(onOpenApprovalItem === undefined ? {} : { onOpenApprovalItem })}
                {...(personaAsks === undefined ? {} : { personaAsks })}
                {...(taskProposals === undefined ? {} : { taskProposals })}
                gestorPlansById={gestorPlansById}
                gestorPlanAdjustingIds={gestorPlanAdjustingIds}
                onLoadTurnContext={onLoadTurnContext}
                {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard })}
                {...(onApproveGestorPlan === undefined ? {} : { onApproveGestorPlan })}
                {...(onRejectGestorPlan === undefined ? {} : { onRejectGestorPlan })}
                {...(onFeedbackGestorPlan === undefined ? {} : {
                  onRequestGestorPlanAdjust: (planId: string) => {
                    const plan = gestorPlansById[planId]
                    const gestorName = plan === undefined
                      ? planId
                      : (team?.personas.find(row => row.id === plan.gestorId)?.name ?? plan.gestorId)
                    setAdjustTarget({ planId, gestorName })
                  },
                })}
                {...(personaCardTrigger === undefined ? {} : { personaCardTrigger })}
                {...(memberId === undefined ? {} : { memberId })}
                {...(onToggleReaction === undefined ? {} : { onToggleReaction })}
                {...(coordinationAnimal === undefined ? {} : { userStickerAnimal: coordinationAnimal })}
                {...(subjectMoveTargets === undefined ? {} : { subjectMoveTargets })}
                {...(onMoveMessageSubject === undefined ? {} : {
                  onMoveMessageSubject: (messageId, subjectId) => {
                    const moved = messages.find(row => row.id === messageId)
                    const revertSubjectId = moved?.conversationSubjectId ?? DEFAULT_CONVERSATION_SUBJECT_ID
                    onMoveMessageSubject(messageId, subjectId)
                    const target = subjectMoveTargets?.find(row => row.id === subjectId)
                    const subjectLabel = target === undefined ? subjectId : subjectDisplayName(t, target)
                    setMoveToast({ messageId, subjectLabel, revertSubjectId })
                  },
                })}
                {...(turnContext?.ticketId === undefined ? {} : { turnActivityTicketId: turnContext.ticketId })}
                {...(turnContext?.activityFolds === undefined ? {} : { turnActivityFolds: turnContext.activityFolds })}
                {...(turnActivityLabels === undefined ? {} : { turnActivityLabels })}
                {...(runErrorHandlers === undefined ? {} : { runErrorHandlers })}
                {...(onRetrySend === undefined ? {} : { onRetrySend })}
                {...(onResumePersona === undefined ? {} : { onResumePersona })}
                {...(onSendMessage === undefined ? {} : {
                  onContinue: (messageId: string) => {
                    // A retomada vai para a persona que parou (o host roteia por menção); sem a menção cairia na Coordenação, sem o contexto.
                    const stopped = messages.find(row => row.id === messageId)
                    const handle = stopped === undefined || stopped.authorId === 'user' ? '' : `@${stopped.authorName.replace(/\s+/gu, '')} `
                    onSendMessage(`${handle}${t('stream.resumeText')}`)
                  },
                })}
              />
            )}
            {effectiveQueued.map(item => (
              <QueuedMessageBubble
                key={item.id}
                t={t}
                item={{ ...(isHeldAfterStop(item, messages) ? { ...item, heldAfterStop: true } : item), authorName: item.authorName ?? userName }}
                {...(quotaResumeLabel === undefined || quotaBlocked !== true ? {} : { quotaUntil: quotaResumeLabel })}
                isOnlyItem={effectiveQueued.length === 1}
                onSendNow={handleSendQueuedNow}
                onEdit={handleEditQueued}
                onRemove={handleRemoveQueued}
              />
            ))}
            {typing !== null && <TypingIndicator t={t} member={typing} />}
          </div>
        </div>
      </div>

      <TurnContextDrawer t={t} context={turnContext} activityLabels={turnActivityLabels} limits={engineLimits} />

      <div className={styles.composerDock}>
        <div className={styles.column}>
          {engineBanner}
          {asideSlot}
          <ChannelComposer
            t={t}
            members={members}
            suppressHint={Object.values(gestorPlansById).some(plan => plan.status === 'proposed')}
            {...composerProps}
            {...(editingQueuedItem === undefined ? {} : {
              editingQueuedText: editingQueuedItem.text,
              onCancelEditQueued: () => { setEditingQueuedId(null) },
            })}
          />
        </div>
      </div>
      <span className="persona-sr-only" role="status" aria-live="polite">{queueAnnounce}</span>
      <span className="persona-sr-only" role="status" aria-live="polite">
        {turnControls?.stoppedPersona == null ? '' : t('composer.stoppedAnnounce', { name: turnControls.stoppedPersona })}
      </span>
      {quotaBackCount !== null && (
        <ToastRegion label={t(quotaBackCount === 1 ? 'limit.backOne' : 'limit.back', { n: String(quotaBackCount) })}>
          <Toast tone="success" title={t(quotaBackCount === 1 ? 'limit.backOne' : 'limit.back', { n: String(quotaBackCount) })} />
        </ToastRegion>
      )}
      {hostError !== null && (
        <ToastRegion label={hostError}>
          <Toast tone="warning" title={hostError} />
        </ToastRegion>
      )}
      {(removedQueued !== null || hostRemoved !== null) && (
        <ToastRegion label={t('composer.steer.removedToast')}>
          <Toast
            tone="neutral"
            title={t('composer.steer.removedToast')}
            action={<Button variant="ghost" size="s" onClick={undoRemoveQueued}>{t('composer.steer.undoRemove')}</Button>}
          />
        </ToastRegion>
      )}
      {moveToast !== null && (
        <ToastRegion label={t('subjects.move')}>
          <Toast
            tone="neutral"
            title={t('subjects.moved', { subject: moveToast.subjectLabel })}
            {...(onUndoMoveMessage === undefined ? {} : {
              action: (
                <Button
                  variant="ghost"
                  size="s"
                  onClick={() => {
                    onUndoMoveMessage(moveToast.messageId, moveToast.revertSubjectId)
                    setMoveToast(null)
                  }}
                >
                  {t('subjects.undoMove')}
                </Button>
              ),
            })}
          />
        </ToastRegion>
      )}
      <GestorPlanAdjustModal
        t={t}
        open={adjustTarget !== null}
        gestorName={adjustTarget?.gestorName ?? ''}
        onClose={() => { setAdjustTarget(null) }}
        onSubmit={(comment) => {
          if (adjustTarget === null || onFeedbackGestorPlan === undefined) return
          onFeedbackGestorPlan(adjustTarget.planId, comment)
        }}
      />
      {personaCard !== undefined && openPersonaProfile !== undefined && (
        <PersonaCardPopoverHost
          card={card}
          bridge={personaCard}
          openPersonaProfile={openPersonaProfile}
          cardData={cardData}
        />
      )}
    </div>
  )
}

/** Grouped message stream with day pill (shared by #geral and DMs). */
export function MessageList({ t, team = null, messages: allMessages, gestorPlansById = {}, gestorPlanAdjustingIds = {}, onApproveGestorPlan, onRejectGestorPlan, onRequestGestorPlanAdjust, onLoadTurnContext, onOpenTaskOnBoard, personaCardTrigger, memberId, onToggleReaction, userStickerAnimal, subjectMoveTargets, onMoveMessageSubject, turnActivityTicketId, turnActivityFolds, turnActivityLabels, runErrorHandlers, onRetrySend, onResumePersona, onContinue, fanoutTeamName, dailyBriefActions, onDecideAction, onUndoAction, onDecideInitiative, personaAsks, taskProposals, opinionActions, onUndoInitiativeGrant, onOpenApprovalItem }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly team?: TeamView | null
  readonly messages: readonly ChannelMessageUi[]
  /** CV-8: the team of the channel, for the title "Respostas da equipe de {x}" (without it: "Respostas da equipe"). */
  readonly fanoutTeamName?: string | undefined
  /** TEAM-8c: o que os botões do cartão "Pedido de opinião" fazem. */
  readonly opinionActions?: OpinionActions | undefined
  /** D-090 (TEAM-7): o que os botões do cartão "Bom dia" fazem (só com a flag `persona.flag.teamwork`). */
  readonly dailyBriefActions?: DailyBriefActions | undefined
  /** D-084 (HT-9): a decisão da pessoa no cartão de prévia de ação externa (sem ela o cartão é só leitura). */
  readonly onDecideAction?: ((decision: ActionDecision) => void | Promise<void>) | undefined
  /** D-084 §2: "Desfazer" na linha de uma ação direta (só existe quando o host marca `undoable`). */
  readonly onUndoAction?: ((activityId: string) => void | Promise<void>) | undefined
  /** D-084 §3: a saída do pedido de iniciativa (Permitir desta vez · Sempre permitir · Agora não). */
  readonly onDecideInitiative?: ((approvalId: string, choice: InitiativeChoice) => void | boolean | Promise<void | boolean>) | undefined
  /** D-084 §3: o Desfazer do Toast de "Sempre permitir" (revoga a concessão). */
  readonly onUndoInitiativeGrant?: ((approvalId: string) => void | Promise<void>) | undefined
  /** EQUIPE-REAL §0: "precisa de você" (cartão do plano) e "Revisar" (cartão de entrega) abrem Aprovações com este item selecionado. */
  readonly onOpenApprovalItem?: ((approvalId: string) => void) | undefined
  /** IV-10 (atrás de `persona.flag.personaAsk`): o estado vivo e o "responder" dos cartões de pergunta com chips; sem isto o fio mostra a frase simples do host. */
  readonly personaAsks?: PersonaAsksBinding | undefined
  /** P1-9 (atrás de `persona.flag.taskProposal`): o estado vivo e o Aceitar / Agora não / Desfazer dos cartões "Proposta de {persona}"; sem isto o fio mostra a frase simples do host. */
  readonly taskProposals?: TaskProposalsBinding | undefined
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
  readonly gestorPlansById?: Readonly<Record<string, GestorPlanView>>
  readonly gestorPlanAdjustingIds?: Readonly<Record<string, true>>
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onRequestGestorPlanAdjust?: ((planId: string) => void) | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  /** PRO-4 / C5b — focus the real task card on Quadros. */
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly personaCardTrigger?: ((ref: string) => Record<string, unknown>) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  /**
   * Whose sticker set reacts to the human's own messages (the DM peer, or the coordination in #geral), so the
   * stream never mixes Brush stickers with emoji (UX-16).
   */
  readonly userStickerAnimal?: string | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  /** T3 §9 — inline activity on the message row that cites this ticket (when turn context is loaded). */
  readonly turnActivityTicketId?: string | undefined
  readonly turnActivityFolds?: readonly TurnContextActivityFoldUi[] | undefined
  readonly turnActivityLabels?: ActivityGroupProps['labels'] | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
  /** HT-3: "Retomar {persona}" na linha "não começou porque está em pausa" (sem o handler, o botão não existe). */
  readonly onResumePersona?: ((personaId: string) => void | Promise<void>) | undefined
  /** FL-11: o "Continuar" da linha "Você parou aqui"; sem ele a linha existe, mas sem o link (nada de controle morto). */
  readonly onContinue?: ((messageId: string) => void) | undefined
}): ReactNode {
  // EQUIPE-REAL §0: mensagem de rotina/sistema (autor `routine:…`, `team:…`) nunca entra no fio.
  const messages = useMemo(() => allMessages.filter(message => !isSystemActor(message)), [allMessages])
  // "Resumir o dia" → `posted`/`already`: vai até o cartão e o faz piscar 1× (o pedido espera o cartão chegar pelo fio).
  useMessageFocus(useMemo(() => messages.map(message => message.id), [messages]))
  const streamAnnouncement = useStreamAnnouncement(messages, t)
  // CV-8: the lines of one "Respostas da equipe" block are drawn as ONE card (empty without `Config.fanout`: the thread is the usual one).
  const fanoutBlocks = useMemo(() => buildFanoutBlocks(messages), [messages])
  // TEAM-8c: as linhas de UM pedido de opinião (pergunta, respostas, consolidação) são desenhadas como UM cartão (vazio sem `Config.teamwork`).
  const opinionBlocks = useMemo(() => buildOpinionBlocks(messages), [messages])
  // A block is taller than a fixed row and its other lines draw nothing: a thread with a block is not windowed.
  // IV-10 / P1-9: os cartões com chips e botões são mais altos que a linha fixa da lista virtual (104 px): com eles no fio a lista não virtualiza.
  const hasTallCards = (personaAsks !== undefined || taskProposals !== undefined)
    && messages.some(message => (message.personaAsk !== undefined && personaAsks !== undefined) || (message.taskProposal !== undefined && taskProposals !== undefined))
  const virtualized = messages.length >= CHAT_MESSAGE_VIRTUAL_MIN && fanoutBlocks.size === 0 && opinionBlocks.size === 0 && !hasTallCards
  // CV-9 (atrás da flag `persona.flag.bubbles`): quem forma um grupo (mesmo autor, menos de 5 min, sem cartão no meio).
  const bubbles = isBubblesEnabled()
  const positions = useMemo(() => groupPositions(messages.map(message => ({
    authorId: message.authorId,
    occurredAt: message.occurredAt,
    timeLabel: message.timeLabel,
    structured: breaksGroup(message),
  }))), [messages])
  const rowProps = (index: number) => ({
    t,
    team,
    message: messages[index]!,
    gestorPlansById,
    gestorPlanAdjustingIds,
    index,
    position: positions[index] ?? 'single',
    bubbles,
    // o fio de antes (flag desligada): "continua" = o mesmo autor da mensagem anterior, sem limite de tempo
    // (Muse 04:01: depois de um cartão, de uma linha de evento ou de equipe a mensagem do mesmo autor abre o cabeçalho de novo)
    continued: index > 0 && messages[index - 1]?.authorId === messages[index]?.authorId && !breaksGroup(messages[index - 1]!),
    streamVirtual: virtualized,
    onLoadTurnContext,
    ...(onOpenTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard }),
    ...(onApproveGestorPlan === undefined ? {} : { onApproveGestorPlan }),
    ...(onRejectGestorPlan === undefined ? {} : { onRejectGestorPlan }),
    ...(onRequestGestorPlanAdjust === undefined ? {} : { onRequestGestorPlanAdjust }),
    ...(personaCardTrigger === undefined ? {} : { personaCardTrigger }),
    ...(memberId === undefined ? {} : { memberId }),
    ...(onToggleReaction === undefined ? {} : { onToggleReaction }),
    ...(userStickerAnimal === undefined ? {} : { userStickerAnimal }),
    ...(subjectMoveTargets === undefined ? {} : { subjectMoveTargets }),
    ...(onMoveMessageSubject === undefined ? {} : { onMoveMessageSubject }),
    ...(turnActivityTicketId === undefined ? {} : { turnActivityTicketId }),
    ...(turnActivityFolds === undefined ? {} : { turnActivityFolds }),
    ...(turnActivityLabels === undefined ? {} : { turnActivityLabels }),
    ...(runErrorHandlers === undefined ? {} : { runErrorHandlers }),
    ...(onRetrySend === undefined ? {} : { onRetrySend }),
    ...(onContinue === undefined ? {} : { onContinue }),
  })

  /** HT-3: a mensagem com `harness` vira a linha de evento; as demais seguem a linha de sempre. */
  // TEAM-8 (atrás de `persona.flag.teamwork`): vários pedidos de ajuda da mesma persona no mesmo minuto viram UMA linha de grupo.
  const helpRuns = useMemo(() => {
    const items = messages.flatMap((message, index) => (message.teamHandoff === undefined ? [] : [{ index, line: message.teamHandoff, occurredAt: message.occurredAt }]))
    const firstOf = new Map<number, readonly HandoffLineUi[]>()
    const rest = new Set<number>()
    for (const run of groupHelpRuns(items)) {
      firstOf.set(run[0]!.index, run.map(item => item.line))
      for (const item of run.slice(1)) rest.add(item.index)
    }
    return { firstOf, rest }
  }, [messages])

  const teamNoise = useMemo(() => analyzeTeamStreamNoise(messages.map(row => ({
    authorId: row.authorId,
    authorName: row.authorName,
    harnessStatus: row.harness?.outcome,
    teamHandoff: row.teamHandoff,
    teamReview: row.teamReview,
    ticketId: row.ticketId,
    stateLine: row.stateLine,
    hasTeamPlan: row.teamPlan !== undefined,
    planRequestId: row.teamPlan?.requestId,
    hasDeliveryCard: row.deliveryCard !== undefined,
    deliveryRequestId: row.deliveryCard?.requestId,
    deliveryTaskIds: row.deliveryCard?.parts.map(part => part.taskId),
    hasTaskCard: row.taskTitle !== undefined && row.taskTitle.length > 0,
  }))), [messages])

  const renderRow = (index: number, rowTag?: 'li' | 'div'): ReactNode => {
    if (isTeamworkEnabled() && teamNoise.hiddenIndices.has(index)) return null
    const message = messages[index]!
    // TEAM-8c (atrás de `persona.flag.teamwork`): o pedido de opinião vira UM cartão no lugar da pergunta; as outras linhas do pedido não desenham nada.
    // Antes do fan-out: as respostas de um pedido da persona podem trazer `fanout` e pertencem a ESTE cartão. Sem a pergunta ou sem a flag: mensagem comum.
    if (message.opinion !== undefined && isTeamworkEnabled()) {
      const block = opinionBlocks.get(message.opinion.requestId)
      if (block !== undefined) {
        if (block.firstIndex !== index) return null
        return (
          <OpinionBlock
            t={t}
            block={block}
            team={team}
            {...(opinionActions ?? {})}
            {...(onOpenTaskOnBoard === undefined ? {} : { onOpenDraftFile: (target: { readonly taskId: string }) => { onOpenTaskOnBoard(target.taskId) } })}
            {...(rowTag === undefined ? {} : { rowTag })}
          />
        )
      }
    }
    // CV-8: the card sits where the block's first line is; the other lines draw nothing of their own.
    if (message.fanout !== undefined) {
      const block = fanoutBlocks.get(message.fanout.id)
      if (block === undefined || block.firstIndex !== index) return null
      return <FanoutBlock t={t} block={block} teamName={fanoutTeamName} {...(rowTag === undefined ? {} : { rowTag })} />
    }
    // D-090 (TEAM-7): o resumo da manhã vira o cartão "Bom dia"; sem a flag, a mensagem do host aparece como texto, como antes.
    if (message.dailyBrief !== undefined && isTeamworkEnabled()) {
      return <DailyBriefCard t={t} brief={message.dailyBrief} messageId={message.id} {...(rowTag === undefined ? {} : { rowTag })} {...(dailyBriefActions ?? {})} />
    }
    // D-084 (HT-9 básico, atrás de `persona.flag.actionPreview`): a prévia de uma ação externa vira o cartão com Enviar · Editar · Cancelar; sem a flag, texto.
    if (message.actionPreview !== undefined && isActionPreviewEnabled()) {
      return <ActionPreviewCard t={t} preview={message.actionPreview} {...(rowTag === undefined ? {} : { rowTag })} {...(onDecideAction === undefined ? {} : { onDecide: onDecideAction })} />
    }
    // EQUIPE-REAL §0 (atrás de `persona.flag.teamwork`): o plano vivo e o cartão de entrega; sem a flag, a mensagem do host aparece como texto.
    if (message.teamPlan !== undefined && isTeamworkEnabled()) {
      return <TeamPlanCard t={t} plan={message.teamPlan} {...(rowTag === undefined ? {} : { rowTag })} {...(onOpenApprovalItem === undefined ? {} : { onOpenApproval: onOpenApprovalItem })} />
    }
    // EQUIPE-REAL-SPEC §(e) (atrás de `persona.flag.teamwork`): "{persona} salvou {file} no rascunho", UMA linha por turno; sem a flag, a frase simples do host (`body`) aparece como mensagem.
    // O clique abre a Tarefa do arquivo (`taskId` = o ticket do Revisar) na placa: a tela só chama quem a casca já liga.
    if (message.filesSaved !== undefined && isTeamworkEnabled()) {
      return (
        <DraftFilesLine
          t={t}
          files={message.filesSaved.files}
          personaName={message.authorName}
          personaCharacterId={message.authorId}
          timeLabel={message.timeLabel}
          {...(rowTag === undefined ? {} : { rowTag })}
          {...(onOpenTaskOnBoard === undefined ? {} : { onOpenDraftFile: (target: { readonly taskId: string }) => { onOpenTaskOnBoard(target.taskId) } })}
        />
      )
    }
    if (message.deliveryCard !== undefined && isTeamworkEnabled()) {
      const delivery = message.deliveryCard.reviewSkippedCount === undefined && teamNoise.reviewSkippedCount > 0
        ? { ...message.deliveryCard, reviewSkippedCount: teamNoise.reviewSkippedCount }
        : message.deliveryCard
      return <DeliveryCard t={t} delivery={delivery} {...(rowTag === undefined ? {} : { rowTag })} {...(onOpenApprovalItem === undefined ? {} : { onOpenApproval: onOpenApprovalItem })} {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTask: onOpenTaskOnBoard })} />
    }
    // D-084 §3: o pedido de iniciativa ("{persona} quer usar o {conector} para …") com as três saídas.
    if (message.initiativeAsk !== undefined && isActionPreviewEnabled()) {
      return <InitiativeAskCard t={t} ask={message.initiativeAsk} {...(rowTag === undefined ? {} : { rowTag })} {...(onDecideInitiative === undefined ? {} : { onDecide: onDecideInitiative })} {...(onUndoInitiativeGrant === undefined ? {} : { onUndoGrant: onUndoInitiativeGrant })} />
    }
    // D-084 §2 ("Age dentro de limites"): a linha "{persona} enviou um email para …"; o Desfazer só com `undoable` e nunca em email/post/pagamento.
    if (message.actionEvent !== undefined && isActionPreviewEnabled()) {
      return <ActionEventLine t={t} event={message.actionEvent} personaName={message.authorName} {...(rowTag === undefined ? {} : { rowTag })} timeLabel={message.timeLabel} personaCharacterId={message.authorId} {...(onUndoAction === undefined ? {} : { onUndo: onUndoAction })} />
    }
    // P1-9 (atrás de `persona.flag.taskProposal`): a proposta vira o cartão; sem a flag, a frase simples do host aparece como antes.
    if (message.taskProposal !== undefined && taskProposals !== undefined) {
      return (
        <TaskProposalCard
          t={t}
          proposal={message.taskProposal}
          liveById={taskProposals.liveById}
          authorName={message.authorName}
          authorCharacterId={message.authorId}
          timeLabel={message.timeLabel}
          onDecide={taskProposals.onDecide}
          onUndo={taskProposals.onUndo}
          {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTask: onOpenTaskOnBoard })}
          {...(rowTag === undefined ? {} : { rowTag })}
        />
      )
    }
    // TEAM-8 (atrás de `persona.flag.teamwork`): as linhas da equipe real; sem texto na spec para o caso, o corpo simples do host aparece.
    if (message.teamHandoff !== undefined && handoffLineText(message.teamHandoff) !== undefined && isTeamworkEnabled()) {
      if (helpRuns.rest.has(index)) return null
      const grouped = helpRuns.firstOf.get(index)
      return grouped === undefined
        ? <HandoffLine t={t} line={message.teamHandoff} timeLabel={message.timeLabel} {...(rowTag === undefined ? {} : { rowTag })} {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTask: onOpenTaskOnBoard })} />
        : <HandoffGroup t={t} lines={grouped} timeLabel={message.timeLabel} {...(rowTag === undefined ? {} : { rowTag })} {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTask: onOpenTaskOnBoard })} />
    }
    if (message.teamReview !== undefined && reviewLineText(message.teamReview) !== undefined && isTeamworkEnabled()) {
      return <ReviewLine t={t} line={message.teamReview} timeLabel={message.timeLabel} {...(rowTag === undefined ? {} : { rowTag })} {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTask: onOpenTaskOnBoard })} />
    }
    // IV-10 (atrás de `persona.flag.personaAsk`): a pergunta com chips vira o cartão; sem a flag, o corpo simples do host aparece como antes.
    if (message.personaAsk !== undefined && personaAsks !== undefined && hasAskChips(message.personaAsk)) {
      return (
        <PersonaAskCard
          t={t}
          ask={message.personaAsk}
          live={personaAsks.liveById[message.personaAsk.askId]}
          characterId={message.personaAsk.characterId}
          timeLabel={message.timeLabel}
          onAnswer={personaAsks.onAnswer}
          {...(rowTag === undefined ? {} : { rowTag })}
        />
      )
    }
    if (message.harness !== undefined) {
      return (
        <HarnessEventLine
          t={t}
          line={message.harness}
          timeLabel={message.timeLabel}
          {...(rowTag === undefined ? {} : { rowTag })}
          {...(onOpenTaskOnBoard === undefined ? {} : { onOpenTask: onOpenTaskOnBoard })}
          {...(onResumePersona === undefined ? {} : { onResumePersona })}
        />
      )
    }
    return <ChannelMessageRow {...rowProps(index)} {...(rowTag === undefined ? {} : { rowTag })} />
  }

  return (
    <>
      <DayDivider>{t('stream.today')}</DayDivider>
      <span className="persona-sr-only" role="status" aria-live="polite">{streamAnnouncement}</span>
      {virtualized ? (
        <FixedRowVirtualScroller
          className={styles.messagesVirtual}
          rowCount={messages.length}
          rowHeight={CHAT_MESSAGE_ROW_PX}
          ariaLabel={t('stream.today')}
          getRowKey={index => messages[index]?.id ?? `msg-row-${index}`}
          renderRow={index => (
            <div className={styles.messageVirtualSlot}>
              {renderRow(index, 'div')}
            </div>
          )}
        />
      ) : (
        <ol className={styles.messages}>
          {messages.map((_message, index) => (
            <Fragment key={messages[index]!.id}>{renderRow(index)}</Fragment>
          ))}
        </ol>
      )}
    </>
  )
}

function ChannelMessageRow(props: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly team: TeamView | null
  readonly message: ChannelMessageUi
  readonly gestorPlansById: Readonly<Record<string, GestorPlanView>>
  readonly gestorPlanAdjustingIds: Readonly<Record<string, true>>
  readonly index: number
  /** CV-9: o lugar da mensagem no grupo de balões do mesmo autor. */
  readonly position: GroupPosition
  /** CV-9 ligado (`persona.flag.bubbles`)? Desligado, o fio de antes. */
  readonly bubbles: boolean
  /** O fio de antes: mesmo autor da anterior. */
  readonly continued: boolean
  readonly streamVirtual?: boolean
  readonly rowTag?: 'li' | 'div'
  readonly onApproveGestorPlan?: ((planId: string) => void) | undefined
  readonly onRejectGestorPlan?: ((planId: string) => void) | undefined
  readonly onRequestGestorPlanAdjust?: ((planId: string) => void) | undefined
  readonly onLoadTurnContext?: ((ticketId: string) => void) | undefined
  /** PRO-4 / C5b — focus the real task card on Quadros. */
  readonly onOpenTaskOnBoard?: ((ticketId: string) => void) | undefined
  readonly personaCardTrigger?: ((ref: string) => Record<string, unknown>) | undefined
  readonly memberId?: string | undefined
  readonly onToggleReaction?: ((messageId: string, stickerId: ReactionId) => void) | undefined
  readonly userStickerAnimal?: string | undefined
  readonly subjectMoveTargets?: readonly ConversationSubjectUi[] | undefined
  readonly onMoveMessageSubject?: ((messageId: string, subjectId: string) => void) | undefined
  readonly turnActivityTicketId?: string | undefined
  readonly turnActivityFolds?: readonly TurnContextActivityFoldUi[] | undefined
  readonly turnActivityLabels?: ActivityGroupProps['labels'] | undefined
  readonly runErrorHandlers?: RunErrorHandlerContext | undefined
  /** P0-30: "Tentar de novo" numa mensagem que não foi enviada. */
  readonly onRetrySend?: ((messageId: string) => void) | undefined
  readonly onContinue?: ((messageId: string) => void) | undefined
}): ReactNode {
  const { t, message, team, gestorPlansById, gestorPlanAdjustingIds, position, bubbles, onLoadTurnContext, onOpenTaskOnBoard, onApproveGestorPlan, onRejectGestorPlan, onRequestGestorPlanAdjust, memberId, onToggleReaction, subjectMoveTargets, onMoveMessageSubject, turnActivityTicketId, turnActivityFolds, turnActivityLabels, runErrorHandlers, onRetrySend } = props
  const inlineActivity = message.ticketId !== undefined
    && turnActivityTicketId === message.ticketId
    && turnActivityFolds !== undefined
    && turnActivityFolds.length > 0
    && turnActivityLabels !== undefined
  const gestorPlanRaw = message.gestorPlanId === undefined ? undefined : gestorPlansById[message.gestorPlanId]
  const gestorPlan = resolveGestorPlanForMessage(gestorPlanRaw, gestorPlansById, gestorPlanAdjustingIds)
  const motion = usePersonaMotion({
    preset: 'base',
    fromOpacity: props.streamVirtual === true ? 1 : 0,
    fromTranslateY: props.streamVirtual === true ? 0 : 8,
    delayMs: props.streamVirtual === true ? 0 : Math.min(props.index, 8) * 60,
  })
  const gestorMotion = usePersonaMotion({
    preset: 'character',
    fromOpacity: 0,
    fromTranslateY: 12,
    delayMs: 80,
  })
  const isUser = message.authorId === 'user'
  // CV-9: o rosto e a linha do nome só no 1º do grupo; o último (ou o único) da pessoa leva "Você · hora" embaixo.
  const grouped = position === 'middle' || position === 'last'
  const continued = bubbles ? grouped : props.continued
  const authorRole = team?.personas.find(persona => persona.id === message.authorPersonaId)?.title
  const showsBubble = bubbles && message.body.length > 0 && !(message.runError !== undefined && runErrorHandlers !== undefined)
  const wide = showsBubble && !isUser && bubbleNeedsWidth(message.body)
  const labels = reactionLabels(t)
  const selectedReactions: ReactionId[] = message.reactions.flatMap((row) => {
    if (!isReactionId(row.stickerId)) return []
    return memberId !== undefined && row.actorIds.includes(memberId) ? [row.stickerId] : []
  })
  const hasReactions = message.reactions.length > 0
  /** Stickers are drawn by the message author's animal; the human's messages use the peer/coordination set. */
  const stickerAnimal = isUser ? props.userStickerAnimal : message.authorId
  const currentSubjectId = message.conversationSubjectId ?? DEFAULT_CONVERSATION_SUBJECT_ID
  const mover = subjectMoveTargets !== undefined && onMoveMessageSubject !== undefined ? (
    <MoveMessageSubject
      t={t}
      subjects={subjectMoveTargets}
      currentSubjectId={currentSubjectId}
      onMove={(subjectId) => { onMoveMessageSubject(message.id, subjectId) }}
    />
  ) : null
  const adder = onToggleReaction === undefined ? null : (
    <ReactionAdder
      animal={stickerAnimal}
      label={t('reaction.add')}
      labels={labels}
      selected={selectedReactions}
      placement={hasReactions ? 'top-start' : 'bottom-end'}
      onReact={(reaction) => { onToggleReaction(message.id, reaction) }}
    />
  )

  // FL-11: a resposta que ainda cresce (cursor-bloco âmbar no fim do texto, só visual; o leitor de tela recebe aria-busy e UM aviso).
  const streamingAttrs = message.streaming === true ? { 'data-streaming': '', 'aria-busy': true as const } : {}
  // FL-11: "Continuar" manda "Continue de onde parou."; a mensagem leva o chip pequeno "Retomada" (Muse 19:10).
  const resumeText = t('stream.resumeText')
  const resumedChip = isUser && (message.body === resumeText || (message.body.startsWith('@') && message.body.endsWith(` ${resumeText}`)))
    ? <Chip size="s" tone="plain">{t('stream.resumedChip')}</Chip>
    : null
  const RowTag = props.rowTag === 'div' ? 'div' : 'li'
  const rowRole = props.rowTag === 'div' ? { role: 'listitem' as const } : {}

  return (
    <RowTag
      className={bubbles ? styles.bubbleRow : continued ? `${styles.message} ${styles.continued}` : styles.message}
      data-author={isUser ? 'user' : 'persona'}
      {...(bubbles ? { 'data-group': position } : {})}
      data-message-id={message.id}
      ref={motion.ref}
      style={motion.style}
      {...rowRole}
    >
      {(!bubbles || !isUser) && (
        <div className={styles.gutter}>
          {continued ? (
            <time className={styles.gutterTime} dateTime={message.timeLabel}>{message.timeLabel}</time>
          ) : !isUser && props.personaCardTrigger !== undefined ? (
            <button
              type="button"
              className={styles.avatarButton}
              aria-label={message.authorName}
              {...props.personaCardTrigger(message.authorId)}
            >
              <Avatar
                name={message.authorName}
                src={avatarFor(message.authorId)}
                shape="portrait"
                size={bubbles ? 32 : 48}
                decorative
              />
            </button>
          ) : (
            <Avatar
              name={message.authorName}
              src={avatarFor(message.authorId)}
              shape={isUser ? 'person' : 'portrait'}
              size={bubbles ? 32 : 48}
              decorative
            />
          )}
        </div>
      )}
      <div className={styles.body}>
        {bubbles && !continued && !isUser && (
          <div className={styles.meta}>
            <span className={styles.author}>{message.authorName}</span>
            <span className={styles.metaSoft}>
              {authorRole !== undefined && authorRole.length > 0 ? ` · ${authorRole}` : ''}
              {' · '}
              <time dateTime={message.timeLabel}>{message.timeLabel}</time>
            </span>
          </div>
        )}
        {!bubbles && !continued && (
          <div className={styles.meta}>
            <span className={styles.author}>{message.authorName}</span>
            <time className={styles.time} dateTime={message.timeLabel}>{message.timeLabel}</time>
            {resumedChip}
            {message.steeredPersonaName !== undefined && (
              <Chip size="s" tone="brand">
                <span className={styles.steeredChipContent}>
                  <UiIcon name="arrowRight" size={12} strokeWidth={2.4} />
                  {t('composer.steer.steeredBadge', { name: message.steeredPersonaName })}
                </span>
              </Chip>
            )}
          </div>
        )}
        {message.runError !== undefined && runErrorHandlers !== undefined ? (
          <div className={styles.runError}>
            <ConversationRunErrorCard
              t={t}
              personaName={message.authorName}
              payload={message.runError}
              {...(avatarFor(message.authorId) === undefined ? {} : { avatarSrc: avatarFor(message.authorId) })}
              {...(message.authorPersonaId === undefined ? {} : { hostPersonaId: message.authorPersonaId })}
              handlers={runErrorHandlers}
            />
          </div>
        ) : showsBubble ? (
          // CV-9: o texto mora num BALÃO (a pessoa em lilás à direita, a persona em creme à esquerda). IV-3: as respostas das
          // personas são markdown (listas, tabelas, código, links), nunca HTML cru; o que a pessoa escreve continua texto simples.
          <div
            className={styles.bubble}
            data-persona-bubble=""
            data-lit=""
            data-author={isUser ? 'user' : 'persona'}
            data-position={position}
            data-wide={wide ? '' : undefined}
          >
            {!isUser && (position === 'first' || position === 'single') && <MessageSprig className={styles.sprig} />}
            {isUser
              ? <p className={styles.text}>{message.body}</p>
              : <div className={styles.text} {...streamingAttrs}><MarkdownBody source={message.body} t={t} streaming={message.streaming === true} /></div>}
          </div>
        ) : !bubbles && message.body.length > 0 ? (
          // O fio de antes (flag desligada): texto corrido. IV-3: markdown nas respostas das personas; a pessoa escreve texto simples.
          isUser
            ? <p className={styles.text}>{message.body}</p>
            : <div className={styles.text} {...streamingAttrs}><MarkdownBody source={message.body} t={t} streaming={message.streaming === true} /></div>
        ) : null}
        {message.stopped === true && (
          // FL-11 (Muse): a pessoa apertou Parar; o balão ficou com o que já veio e esta linha diz onde parou. "Continuar" = mensagem nova.
          <p className={styles.stoppedLine} data-persona-stopped="">
            {t('stream.stoppedHere')}
            {props.onContinue !== undefined && (
              <>
                {' · '}
                <button type="button" className={styles.stoppedLink} onClick={() => { props.onContinue?.(message.id) }}>
                  {t('stream.continue')}
                </button>
              </>
            )}
          </p>
        )}
        {message.sendFailed === true && (
          // P0-30: o host não recebeu. O texto fica no fio com a falha dita em voz alta e a ação de tentar de novo.
          <div className={styles.sendFailed} role="status" data-persona-send-failed="">
            <UiIcon name="alert" size={14} strokeWidth={2.2} />
            <span>{t('message.notSent')}</span>
            {onRetrySend !== undefined && (
              <Button size="s" variant="ghost" onClick={() => { onRetrySend(message.id) }}>
                {t('runError.action.retry')}
              </Button>
            )}
          </div>
        )}
        {bubbles && isUser && showsBubble && message.sendFailed !== true && (position === 'single' || position === 'last') && (
          <div className={styles.userTime}>
            <span>{t('message.you')} · <time dateTime={message.timeLabel}>{message.timeLabel}</time></span>
            {resumedChip}
            {message.steeredPersonaName !== undefined && (
              <Chip size="s" tone="brand">
                <span className={styles.steeredChipContent}>
                  <UiIcon name="arrowRight" size={12} strokeWidth={2.4} />
                  {t('composer.steer.steeredBadge', { name: message.steeredPersonaName })}
                </span>
              </Chip>
            )}
          </div>
        )}
        {gestorPlan !== undefined && (
          <div className={styles.gestorPlan} ref={gestorMotion.ref} style={gestorMotion.style}>
            <GestorPlanMessageCard
              t={t}
              plan={gestorPlan}
              team={team}
              {...(onApproveGestorPlan === undefined || gestorPlanRaw === undefined || gestorPlanRaw.status !== 'proposed'
                ? {}
                : { onApprove: () => { onApproveGestorPlan(gestorPlanRaw.id) } })}
              {...(onRejectGestorPlan === undefined || gestorPlan.status !== 'proposed'
                ? {}
                : { onDecline: () => { onRejectGestorPlan(gestorPlanRaw!.id) } })}
              {...(onRequestGestorPlanAdjust === undefined || gestorPlanRaw === undefined || gestorPlanRaw.status !== 'proposed'
                ? {}
                : { onAdjust: () => { onRequestGestorPlanAdjust(gestorPlanRaw.id) } })}
            />
          </div>
        )}
        {message.taskTitle !== undefined && message.taskTitle.length > 0 && (
          // Uma ficha só: o título da tarefa UMA vez e as duas ações como links ao lado ("Ver contexto usado · Ver no quadro").
          <div className={styles.taskCard} role="group" aria-label={message.taskTitle}>
            <span className={styles.taskCardTitle}>{message.taskTitle}</span>
            {message.taskReviewedBy !== undefined && (
              <ReviewedBySeal reviewer={message.taskReviewedBy} label={t('review.seal', { name: message.taskReviewedBy.name })} />
            )}
            {message.ticketId !== undefined && onLoadTurnContext !== undefined && (
              <button type="button" className={styles.taskCardLink} onClick={() => { onLoadTurnContext(message.ticketId!) }}>
                {t('context.show')}
              </button>
            )}
            {message.ticketId !== undefined && onOpenTaskOnBoard !== undefined && (
              <button type="button" className={styles.taskCardLink} onClick={() => { onOpenTaskOnBoard(message.ticketId!) }}>
                {t('context.openBoard')}
              </button>
            )}
          </div>
        )}
        {inlineActivity && (
          <div className={styles.messageActivity} aria-label={t('context.activityLabel')}>
            {turnActivityFolds.map(fold => (
              <ActivityGroup
                key={fold.persona.name}
                persona={fold.persona}
                items={fold.items}
                labels={turnActivityLabels}
              />
            ))}
          </div>
        )}
        {hasReactions && (
          <ul className={styles.reactions} aria-label={t('reaction.listLabel')}>
            {message.reactions.map((reaction) => {
              const reactionId = isReactionId(reaction.stickerId)
                ? reaction.stickerId
                : reactionIdFromEmoji(reaction.stickerId)
              const emoji = reactionId !== undefined ? REACTION_EMOJI[reactionId] : reaction.stickerId
              const sticker = reactionId !== undefined ? stickerUrl(stickerAnimal, reactionId) : undefined
              const selected = reactionId !== undefined && selectedReactions.includes(reactionId)
              const name = reactionId !== undefined ? labels[reactionId] : emoji
              return (
                <li key={reaction.stickerId}>
                  <ReactionChip
                    emoji={emoji}
                    {...(sticker === undefined ? {} : { sticker })}
                    count={reaction.count}
                    selected={selected}
                    label={t('reaction.chipLabel', { name, count: String(reaction.count) })}
                    {...(onToggleReaction === undefined || reactionId === undefined
                      ? {}
                      : {
                        onClick: () => { onToggleReaction(message.id, reactionId) },
                      })}
                  />
                </li>
              )
            })}
            {adder !== null && <li className={styles.reactionAdder}>{adder}</li>}
            {mover !== null && <li className={styles.reactionAdder}>{mover}</li>}
          </ul>
        )}
        {!hasReactions && (adder !== null || mover !== null) && (
          <div className={styles.hoverActions}>
            {mover}
            {adder}
          </div>
        )}
      </div>
    </RowTag>
  )
}
