/** Subset of Persona host Remote used by the shell (wire types from host). */
import type { MessageView as HostMessageView, ReactionView } from '@deepseek-ai/dsh-persona-host/types'
import type { RunErrorPayload } from '../primitives/run-errors.ts'

export type {
  AwayEventView,
  ChannelView,
  DmView,
  FirstDeliveryView,
  OverviewNowView,
  OverviewView,
  PersonaNowView,
  PersonaView,
  PingResult,
  ProjectScopeRequest,
  ProjectView,
  ReactionView,
  TaskView,
  TeamView,
  WhileAwayView,
} from '@deepseek-ai/dsh-persona-host/types'

/**
 * Host message row for mappers. `reactions` is optional so fake/older hosts in tests (e.g. remote-unwrap) stay valid.
 */
export type MessageView = Omit<HostMessageView, 'reactions' | 'conversationSubjectId'> & {
  readonly reactions?: readonly ReactionView[]
  readonly conversationSubjectId?: string
  readonly topicId?: string
  /** Typed execution failure (RUN-ERRORS-SPEC); host sends code, not user-facing text. */
  readonly runError?: RunErrorPayload
  /** D-090 / EQUIPE-REAL-SPEC (b): o resumo da manhã, determinístico, sem IA. Os ids são os reais (tarefa, persona). */
  readonly dailyBrief?: DailyBriefWire
  /** D-090 / EQUIPE-REAL-SPEC (c): o pedido de opinião ao time (pergunta, respostas, consolidação). Nomes finais do Anvil (team-real.md §7); só com `Config.teamwork`. */
  readonly opinion?: OpinionWire
  /** D-084 / PERSONA-POWERS §1: o cartão de prévia de uma ação externa (a forma é a que o Anvil confirmou 04/11 21:21; atrás de `persona.flag.actionPreview`). */
  readonly actionPreview?: ActionPreviewWire
  /** PERSONA-POWERS §2: a linha "{persona} enviou um email para … · assunto" quando a persona age DIRETO (a forma que o Anvil confirmou 04/11 21:21). */
  readonly actionEvent?: ActionEventWire
  /** PERSONA-POWERS §3: "{persona} quer usar o {conector} para {motivo}" (a forma que proponho ao Anvil; `decideApproval({ kind: 'connector', … })`). */
  readonly initiativeAsk?: InitiativeAskWire
  /** EQUIPE-REAL §0: o plano de um pedido como UM cartão vivo (o estado de cada parte muda por upsert da mesma mensagem). Forma proposta ao Anvil. */
  readonly teamPlan?: TeamPlanWire
  /** EQUIPE-REAL §0: UM cartão de entrega por pedido, quando todas as partes ficaram prontas. Forma proposta ao Anvil. */
  readonly deliveryCard?: DeliveryCardWire
  /** EQUIPE-REAL-SPEC §(e) (Forge 15:47): UMA linha por turno que gravou arquivos no rascunho ("{persona} salvou {file} no rascunho"); só vira linha com `persona.flag.teamwork`. */
  readonly filesSaved?: { readonly files: readonly DraftFileWire[] }
}

/**
 * Um arquivo que a persona gravou no rascunho (`DraftFileView` do host, Forge 07/11 15:47, `persona-host/src/types.ts`; EQUIPE-REAL-SPEC §(e)). `path` é relativo à raiz do rascunho, com `/`, e é o MESMO que o Revisar usa;
 * `taskId` é o `ticketId` do Revisar; `thumb` é um PNG pequeno em `data:` feito pelo host quando a linha nasceu (ausente = a tela mostra o ícone do tipo); `pngPath`, num SVG, é o PNG irmão que o time viu.
 */
export interface DraftFileWire {
  readonly path: string
  readonly name: string
  readonly mime: string
  readonly taskId: string
  readonly personaId: string
  readonly size?: number
  readonly thumb?: string
  readonly pngPath?: string
}

/** Os 8 estados de uma parte do plano (Muse): "parou" é só falha que pede ação; o que espera a pessoa é "needs-you". */
export type TeamPartStatusWire = 'queued' | 'doing' | 'waiting' | 'with-colleague' | 'reviewing' | 'needs-you' | 'done' | 'stopped'

export interface TeamPlanPartWire {
  readonly taskId: string
  readonly personaId: string
  /** Curto e humano (<= 48); a UI ainda corta só no espaço. */
  readonly title: string
  /** O NOME CURTO da parte ('Texto', 'Arte', 'Posts'): é o que aparece dentro do cartão. Sem ele, vale o `title` cortado no espaço. */
  readonly shortName?: string
  readonly status: TeamPartStatusWire
  /** `waiting`/`with-colleague`: esperando/com quem. */
  readonly withPersonaId?: string
  /** `needs-you`: o cartão que pede a decisão (o chip abre Aprovações com ele selecionado). */
  readonly approvalId?: string
  /** EQUIPE-REAL §0 (TEAM-8): se a revisão falhou em >= 1 tarefa do mesmo pedido, a entrega sai sem o selo e mostra UMA linha agrupada. */
  readonly reviewSkippedCount?: number
  readonly reviewFailedCount?: number
  readonly reviewSkippedTaskId?: string
  /** `stopped`: o motivo em uma frase humana, para o "Ver motivo". */
  readonly reason?: string
}

export interface TeamPlanWire {
  readonly requestId: string
  readonly title: string
  readonly parts: readonly TeamPlanPartWire[]
}

export interface DeliveryCardWire {
  readonly requestId: string
  readonly title: string
  readonly parts: readonly { readonly taskId: string; readonly personaId: string; readonly title: string; readonly shortName?: string }[]
  readonly reviewedBy?: { readonly personaId: string; readonly name?: string }
  /** O "Revisar" abre Aprovações com ESTE item selecionado; sem ele não há botão. */
  readonly approvalId?: string
  /** EQUIPE-REAL §0 (TEAM-8): se a revisão falhou em >= 1 tarefa do mesmo pedido, a entrega sai sem o selo e mostra UMA linha agrupada. */
  readonly reviewSkippedCount?: number
  readonly reviewFailedCount?: number
  readonly reviewSkippedTaskId?: string
}

/** `MessageView.initiativeAsk`: o pedido de uso de um conector por iniciativa da persona. */
export interface InitiativeAskWire {
  readonly approvalId: string
  readonly personaId: string
  readonly personaName?: string
  readonly connectorName: string
  /** O motivo, em uma frase da persona ("buscar o contrato"). Texto, nunca instrução. */
  readonly purpose: string
  readonly status: 'pending' | 'decided'
  readonly choice?: 'once' | 'always' | 'not-now'
}

/** `MessageView.actionEvent`: o que a persona fez fora do app. `undoable` só para o que o harness consegue desfazer (nunca email/post/pagamento). */
export interface ActionEventWire {
  readonly verb: 'email' | 'post' | 'pay' | 'delete' | string
  readonly connectorName: string
  /** Para quem/o quê (o destinatário, o valor, os itens). */
  readonly target: string
  readonly subject?: string
  readonly undoable?: boolean
  /** ISO: até quando o Desfazer vale. */
  readonly undoUntil?: string
  /** O id da atividade (`undoPersonaAction({ activityId })`). */
  readonly activityId: string
  /** COLHEITA 5: a pessoa já desfez (o host guarda); a linha vira texto simples com "Desfeito". */
  readonly undone?: boolean
  /** Para onde (o "para Fazendo" do mover cartão), curto, quando o host sabe (contracts/harness-tools.md §4: `after`). */
  readonly after?: string
  /** O que saiu (o mesmo conteúdo da prévia), quando o host o guarda: é o que o "Ver" mostra. Sem ele, não há "Ver". */
  readonly content?: ActionContentWire
}

/** O conteúdo de uma ação externa (a prévia e o "Ver" mostram o mesmo). */
export interface ActionContentWire {
  readonly to?: string
  readonly subject?: string
  readonly body?: string
  readonly amount?: string
  readonly payee?: string
  readonly reference?: string
  readonly items?: readonly string[]
  readonly count?: number
}

/** A classe da ação (decide se há prévia e se existe a caixinha "Não perguntar de novo": só em `send`/`post`). */
export type ActionClassWire = 'send' | 'post' | 'pay' | 'delete'

/** `MessageView.actionPreview` / `ApprovalView.actionPreview` (kind "action"), forma confirmada pelo Anvil. */
export interface ActionPreviewWire {
  /** O id da aprovação (`decideApproval({ kind: 'action', id, … })`). */
  readonly approvalId: string
  readonly actionClass: ActionClassWire
  /** A palavra que decidiu a classe, como o host manda: "send" (email), "post", "pay", "delete"… (texto livre; `mapActionPreview` a normaliza para o verbo da tela). */
  readonly verb: string
  readonly connectorName: string
  readonly personaId: string
  readonly personaName?: string
  readonly to?: string
  readonly subject?: string
  readonly body?: string
  readonly amount?: string
  readonly payee?: string
  readonly reference?: string
  readonly items?: readonly string[]
  readonly count?: number
  /** A prévia foi cortada: a tela diz que é parcial e NÃO se aprova às cegas. */
  readonly truncated: boolean
  /** Uma parte está escondida (um segredo): a mesma regra da prévia cortada, não se aprova às cegas. */
  readonly masked?: boolean
  /** Só email e post podem ser dispensados com "Não perguntar de novo". */
  readonly canRemember?: boolean
  /** A pessoa pediu esta ação no fio ("Você pediu · {persona} confirma antes de enviar"). */
  readonly requestedByPerson: boolean
  readonly status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'adjusted'
  /** Para quem de fato foi (a linha "Enviado para …"); sem ele vale o `to`. */
  readonly sentTo?: string
  /** Tentativas (no máximo 2); depois a Tarefa para com a explicação. */
  readonly attempts?: number
  readonly sentAt?: string
  readonly failureReason?: string
  readonly expiresAt?: string
  /** COLHEITA 5: fechou sem resposta (só leitura; "Pedir de novo"). */
  readonly expired?: boolean
  /** COLHEITA 5: a pessoa já pediu de novo. */
  readonly retried?: boolean
}

/** Uma linha do resumo da manhã: quem e o quê (o título é o da tarefa). */
export interface DailyBriefItemWire {
  readonly personaId: string
  readonly taskId: string
  readonly title: string
  /** Um PEDIDO terminado, agrupado em UM item (o Anvil agrupa): o título do pedido, as partes curtas e quem participou. Parte de pedido aberto não leva isto. */
  readonly request?: { readonly requestId?: string; readonly title: string; readonly parts: readonly string[]; readonly personaIds?: readonly string[] }
}

/**
 * `MessageView.opinion` (persona-spec/contracts/team-real.md §7, nomes FINAIS do Anvil). O corpo da mensagem é a PERGUNTA (`request`), a resposta de
 * 1–3 linhas (`reply`) ou as 1–2 linhas da consolidação (`consolidated`).
 */
export interface OpinionWire {
  readonly kind: 'request' | 'reply' | 'consolidated'
  readonly requestId: string
  readonly taskId: string
  readonly round: number
  readonly maxRounds: number
  /** `request`: o rascunho em texto. */
  readonly draftText?: string
  /** `request`: as imagens do rascunho (ids de anexo). */
  readonly attachmentIds?: readonly string[]
  /** `request`: a descrição da imagem escrita pela persona. */
  readonly alt?: string
  /** `request` (Forge 15:47, Bolt 15:44): a ARTE do rascunho que está em opinião (SVG/PNG); `attachmentIds` segue sendo o anexo da PESSOA. Com o `.png` irmão de um `.svg`, vêm os dois itens. */
  readonly files?: readonly DraftFileWire[]
  readonly audience?: 'team' | 'some'
  /** Só quando o Tally mede. */
  readonly estimate?: {
    readonly responses: number
    readonly cost?: string
    /** D-092: o tipo de conta e o impacto na cota (Tally, USD-1); sem eles a tela não mostra dinheiro. */
    readonly billing?: 'subscription' | 'api' | 'unknown'
    readonly quota?: { readonly pct: { readonly min: number; readonly max: number }; readonly window: '5h' | 'week'; readonly resetsAt?: string } | null
    readonly custo?: { readonly microUsd: { readonly min: number; readonly max: number } } | null
  }
  /** `request`: personas puladas por motor sem visão. */
  readonly noVision?: readonly string[]
  /** `request` (Forge, team-real.md §12): os de `noVision` que a pessoa incluiu SÓ PELO TEXTO; o recolhido da tela é `noVision − textOnlyPersonaIds`. */
  readonly textOnlyPersonaIds?: readonly string[]
  /** `reply` (Forge, §12): SEMPRE presente na resposta de quem foi incluído só pelo texto → o chip neutro "Opinou só pelo texto". */
  readonly textOnly?: boolean
  /** `reply`: a marca; `nothing` recolhe em "e mais n sem nada a acrescentar". */
  readonly mark?: 'liked' | 'suggestion' | 'attention' | 'nothing'
  /** TEAM-4 (Tally, contracts/opinion-budget.md): o orçamento da rodada; o rodapé vem PRONTO. Quando presente, vale sobre `round`/`maxRounds`/`estimate`/`noVision`. */
  readonly budget?: {
    /** "≈ 3 respostas" (o custo só entra quando o histórico MEDIDO sustenta). */
    readonly rodape?: string
    /** D-092: o mesmo par billing + quota do estimate (Tally, USD-1). */
    readonly billing?: 'subscription' | 'api' | 'unknown'
    readonly quota?: { readonly pct: { readonly min: number; readonly max: number }; readonly window: '5h' | 'week'; readonly resetsAt?: string } | null
    readonly round?: number
    readonly roundsCap?: number
    /** `'rounds-cap'` = o teto de rodadas por Tarefa foi atingido (a persona segue com o que tem). */
    readonly stop?: string
    /** Cada colega não chamado e por quê (`no-vision`, `paused`, `at-limit`, `unavailable`, `over-limit`). */
    readonly skipped?: readonly { readonly id: string; readonly why: string }[]
  }
  /** `consolidated`: a versão nova (para "Antes · Depois", também de imagem). */
  readonly version?: {
    readonly k: number
    readonly before: { readonly text?: string; readonly attachmentIds?: readonly string[] }
    readonly after: { readonly text?: string; readonly attachmentIds?: readonly string[] }
  }
}

/** `MessageView.dailyBrief` (persona-spec/contracts/team-real.md §4, rascunho do Keel; Forge/Anvil corrigem os nomes). */
export interface DailyBriefWire {
  /** "YYYY-MM-DD" do dia do resumo. */
  readonly day: string
  /** A Coordenação que abre o resumo (o rosto do cartão). */
  readonly coordinatorPersonaId: string
  /** No máximo 3 (o host corta); o que ficou de fora vem em `yesterdayMore`. */
  readonly yesterday: readonly DailyBriefItemWire[]
  /** O "e mais n" de "Ontem". */
  readonly yesterdayMore?: number
  readonly today: readonly DailyBriefItemWire[]
  readonly needsYou: { readonly count: number }
  /** O resumo da manhã está pausado (o host não manda cartão novo enquanto isso). */
  readonly paused: boolean
  /** A rotina "Resumo da manhã", para "Pausar o resumo da manhã". */
  readonly routineId: string
  /**
   * Qual cartão é este (motor do Tally, `contracts/morning-brief.md` "Dois cartões"): `morning` = "Bom dia · {dia}" com o spot do sol nascendo;
   * `on-demand` = "Resumo do dia · {hora}" sem o spot (pedido à mão a partir das 12:00). Ausente (host que ainda não o manda, cartão antigo): a tela cai
   * na hora em que o cartão foi postado.
   */
  readonly variant?: 'morning' | 'on-demand'
}

export interface PersonaTenantScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly memberId: string
  readonly channelId: string
}
