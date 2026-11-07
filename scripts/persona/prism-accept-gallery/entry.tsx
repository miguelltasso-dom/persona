// Prism: galeria de aceite do fio v1.1 com os componentes REAIS (CSS, locale pt, tema escolhido pelo próprio instalador de tema) e dados de
// exemplo: o "Bom dia" (+ trilha de patinhas), o cartão de prévia de ação externa, a linha de ação direta, o pedido de iniciativa, a
// "Pergunta à parte" e o HT-3. O host real ainda não emite estes eventos; a galeria não espera a trava build. Montada por
// scripts/persona/prism-accept-gallery.mjs; `#estado` escolhe o que é desenhado. Não vai no app.
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, type ReactNode } from 'react'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import { installPersonaColorScheme } from '../../../packages/persona/client-ui-persona/src/client/theme/install-color-scheme.ts'
import { MessageList } from '../../../packages/persona/client-ui-persona/src/client/chat/GeneralChannelView.tsx'
import { AsideCard } from '../../../packages/persona/client-ui-persona/src/client/chat/AsideCard.tsx'
import type { AsideItemUi } from '../../../packages/persona/client-ui-persona/src/client/chat/use-aside-asks.ts'
import { mapActionEvent, mapActionPreview, mapDailyBrief, mapDeliveryCard, mapHarnessLine, mapInitiativeAsk, mapTeamPlan, type ChannelMessageUi } from '../../../packages/persona/client-ui-persona/src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../../../packages/persona/client-ui-persona/src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../../../packages/persona/client-ui-persona/src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../../../packages/persona/client-ui-persona/src/client/locale/shell/locales.ts'
import { AppearanceSettingsPanel } from '../../../packages/persona/client-ui-persona/src/client/shell/AppearanceSettingsPanel.tsx'
import { PersonasTeamPanel } from '../../../packages/persona/client-ui-persona/src/client/team/PersonasTeamPanel.tsx'
import type { RosterEntry } from '../../../packages/persona/client-ui-persona/src/client/team/personas-roster.ts'
import { TeamChannelStrip } from '../../../packages/persona/client-ui-persona/src/client/team/TeamChannelStrip.tsx'
import type { ChannelPersonaMember } from '../../../packages/persona/client-ui-persona/src/client/team/persona-work-state.ts'
import { PersonaCardPopover, usePersonaCardController } from '../../../packages/persona/client-ui-persona/src/client/primitives/index.ts'
import { PersonaInfoCard, type PersonaCardInfo } from '../../../packages/persona/client-ui-persona/src/client/profile/PersonaInfoCard.tsx'
import { applyThemeSource, createLocalThemeBridge, writeThemeMirror, type ThemeChoice } from '../../../packages/persona/client-ui-persona/src/client/theme/theme-preference.ts'

// As flags do fio ligadas ANTES de montar (o aceite é do que está atrás delas).
try {
  localStorage.setItem('persona.flag.teamwork', '1')
  localStorage.setItem('persona.flag.actionPreview', '1')
  localStorage.setItem('persona.flag.houseDecor', '1')
} catch { /* sem storage: as flags ficam desligadas e a galeria mostra o texto do host */ }
installPersonaColorScheme()

type Dict = Readonly<Record<string, string>>
const bind = (dict: Dict) => (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  (dict[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))
const t = bind(chatPt as Dict) as never
const shellT = bind(shellPt as Dict) as never

/** Equipe › Personas (Keel 03:33 + Muse 03:34): a lista de cartões; a ordem é a de abertura (Coordenação, quem trabalha ou espera, o resto por nome). */
const PERSONAS_ROSTER: readonly RosterEntry[] = [
  { id: 'p-atlas', name: 'Atlas', role: 'Coordenação', characterId: 'atlas', state: 'resting', queueCount: 0, coordination: true, caretaker: 'Ana' },
  { id: 'p-nina', name: 'Nina', role: 'Pesquisa', characterId: 'nina', state: 'working', currentTask: 'Pesquisa de preços da concorrência', queueCount: 2, coordination: false, caretaker: 'Ana' },
  { id: 'p-bento', name: 'Bento', role: 'Engenharia', characterId: 'bento', state: 'waiting', currentTask: 'Texto do cardápio da semana', queueCount: 1, coordination: false, caretaker: 'Ana' },
  { id: 'p-luna', name: 'Luna', role: 'Vigia', characterId: 'luna', state: 'resting', queueCount: 0, coordination: false },
  { id: 'p-sol', name: 'Sol', role: 'Relacionamento', characterId: 'sol', state: 'stuck', currentTask: 'Responder o cliente da encomenda de sexta', queueCount: 0, coordination: false, caretaker: 'Ana' },
  { id: 'p-tuca', name: 'Tuca', role: 'Design', characterId: 'tucano', state: 'resting', queueCount: 0, coordination: false },
]

/** Configurações › Aparência (TH-1): a escolha do estado vai para o <html> ANTES de montar (o instalador de tema troca o body), como ao reabrir o app. */
const APARENCIA_STATES = { 'aparencia-sistema': 'system', 'aparencia-claro': 'light', 'aparencia-escuro': 'dark' } as const satisfies Record<string, ThemeChoice>
function chooseTheme(state: string): void {
  const choice = (APARENCIA_STATES as Record<string, ThemeChoice | undefined>)[state]
  if (choice === undefined) return
  writeThemeMirror(choice)
  applyThemeSource(document.documentElement, choice)
}

const TEAM = {
  personas: [
    { id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação', systemRoles: ['coordination'] },
    { id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' },
    { id: 'persona-bento', name: 'Bento', avatarRef: 'bento', title: 'Texto' },
    { id: 'persona-luna', name: 'Luna', avatarRef: 'luna', title: 'Design' },
  ],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
} as unknown as TeamView

const base = { reactions: [], timeLabel: '09:00' } as const
const asView = (extra: Record<string, unknown>): MessageView => extra as unknown as MessageView

// ---- Bom dia ---------------------------------------------------------------------------------------------------------------------------
const brief = (extra: Record<string, unknown> = {}, occurredAt?: string) => asView({
  ...(occurredAt === undefined ? {} : { occurredAt }),
  dailyBrief: {
    day: '2026-11-05', coordinatorPersonaId: 'persona-atlas',
    yesterday: [
      { taskId: 'task-0', personaId: 'persona-atlas', title: 'Campanha de Natal',
        request: { requestId: 'req-natal', title: 'Campanha de Natal', parts: ['Texto', 'Arte', 'Posts'], personaIds: ['persona-bento', 'persona-luna', 'persona-nina', 'persona-atlas'] } },
      { taskId: 'task-1', personaId: 'persona-nina', title: 'Pesquisa de preços da concorrência' },
      { taskId: 'task-2', personaId: 'persona-bento', title: 'Texto do cardápio da semana' },
      { taskId: 'task-3', personaId: 'persona-luna', title: 'Logo da padaria' },
    ],
    yesterdayMore: 2,
    today: [
      { taskId: 'task-4', personaId: 'persona-nina', title: 'Comparar fornecedores de farinha' },
      { taskId: 'task-5', personaId: 'persona-bento', title: 'Post de lançamento da focaccia' },
    ],
    needsYou: { count: 2 }, paused: false, routineId: 'routine-morning',
    ...extra,
  },
})
const briefRow = (extra: Record<string, unknown> = {}, occurredAt?: string): ChannelMessageUi => ({
  id: 'brief', authorId: 'atlas', authorName: 'Atlas', body: 'Bom dia!', ...base, dailyBrief: mapDailyBrief(brief(extra, occurredAt), TEAM)!,
})
/** O resumo A PEDIDO depois das 12:00 (hora local da máquina): "Resumo do dia · 16:40", sem o spot do sol nascendo. */
const AFTERNOON = new Date(2026, 10, 5, 16, 40, 0).toISOString()

// ---- Prévia de ação externa ------------------------------------------------------------------------------------------------------------
const previewRow = (wire: Record<string, unknown>): ChannelMessageUi => ({
  id: `preview-${String(wire.approvalId)}`, authorId: 'nina', authorName: 'Nina', body: 'A Nina quer fazer uma ação.', ...base,
  actionPreview: mapActionPreview(asView({ actionPreview: wire }), TEAM)!,
})
const EMAIL = {
  approvalId: 'approval-1', actionClass: 'send', verb: 'email', connectorName: 'Gmail', personaId: 'persona-nina',
  to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta',
  body: 'Oi, Ana! Confirmo os 3 bolos de cenoura para sexta, retirada às 10h na loja.\n\nSe preferir entrega, me avise até quarta que eu combino com o motoboy.\n\nObrigada!\nNina — Padaria Pão Quente',
  truncated: false, requestedByPerson: true, status: 'pending',
}
const PAY = { approvalId: 'approval-2', actionClass: 'pay', verb: 'pay', connectorName: 'Mercado Pago', personaId: 'persona-nina', amount: 'R$ 120,00', payee: 'Moinho Bom Grão', reference: 'Pedido 4471 · farinha 25 kg', truncated: false, requestedByPerson: false, status: 'pending' }
const DELETE = { approvalId: 'approval-3', actionClass: 'delete', verb: 'delete', connectorName: 'Drive', personaId: 'persona-nina', items: ['contrato-antigo.pdf', 'rascunho-cardapio.docx', 'foto-vitrine-1.png', 'foto-vitrine-2.png'], count: 4, truncated: false, requestedByPerson: false, status: 'pending' }

// ---- Ação direta e pedido de iniciativa ------------------------------------------------------------------------------------------------
const inSeconds = (seconds: number): string => new Date(Date.now() + seconds * 1000).toISOString()
const EMAIL_SENT = { to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os 3 bolos de cenoura para sexta, retirada às 10h na loja.\n\nSe preferir entrega, me avise até quarta que eu combino com o motoboy.\n\nObrigada!\nNina — Padaria Pão Quente' }
const eventRow = (id: string, extra: Record<string, unknown>): ChannelMessageUi => ({
  id, authorId: 'nina', authorName: 'Nina', body: 'ação', ...base, actionEvent: mapActionEvent(asView({ actionEvent: extra }))!,
})
const initiativeRow = (id: string, extra: Record<string, unknown>): ChannelMessageUi => ({
  id, authorId: 'nina', authorName: 'Nina', body: 'quer usar o Drive', ...base,
  initiativeAsk: mapInitiativeAsk(asView({ initiativeAsk: { approvalId: id, personaId: 'persona-nina', connectorName: 'Drive', purpose: 'buscar o contrato do fornecedor', status: 'pending', ...extra } }), TEAM)!,
})

// ---- Pergunta à parte ------------------------------------------------------------------------------------------------------------------
const ASIDE_OK: readonly AsideItemUi[] = [
  { key: 'a2', id: 'a2', kind: 'summary', personaId: 'persona-nina', question: 'Resumo desta conversa', status: 'answered', answer: 'Decidiram o preço do pão de queijo e ficou pendente o logo da vitrine. A Luna entrega o logo amanhã cedo.' },
  { key: 'a1', id: 'a1', kind: 'aside', personaId: 'persona-nina', question: 'Qual o prazo da primeira entrega?', status: 'asking' },
]
const ASIDE_FAIL: readonly AsideItemUi[] = [
  { key: 'a4', id: 'a4', kind: 'aside', personaId: 'persona-luna', question: 'A vitrine já tem logo novo?', status: 'failed', error: 'no_engine' },
  { key: 'a3', id: 'a3', kind: 'aside', personaId: 'persona-bento', question: 'Posso mandar o orçamento hoje?', status: 'failed', error: 'paused' },
]

// ---- Plano vivo e entrega (EQUIPE-REAL §0) ---------------------------------------------------------------------------------------------
const TEAM_PLAN_PARTS = [
  { taskId: 'tp-1', personaId: 'persona-bento', title: 'Texto da campanha de lançamento', shortName: 'Texto', status: 'done' },
  { taskId: 'tp-2', personaId: 'persona-luna', title: 'Arte da campanha de lançamento', shortName: 'Arte', status: 'with-colleague', withPersonaId: 'persona-nina' },
  { taskId: 'tp-3', personaId: 'persona-nina', title: 'Posts da campanha de lançamento', shortName: 'Posts', status: 'doing' },
  { taskId: 'tp-4', personaId: 'persona-bento', title: 'Legendas dos posts para cada rede social do negócio', shortName: 'Legendas', status: 'waiting', withPersonaId: 'persona-luna' },
  { taskId: 'tp-5', personaId: 'persona-atlas', title: 'Revisão final da campanha', shortName: 'Revisão', status: 'reviewing' },
  { taskId: 'tp-6', personaId: 'persona-nina', title: 'Orçamento do anúncio pago', shortName: 'Orçamento', status: 'needs-you', approvalId: 'approval-12' },
  { taskId: 'tp-7', personaId: 'persona-luna', title: 'Vídeo curto de bastidores', shortName: 'Vídeo', status: 'stopped', reason: 'O motor de vídeo não está conectado. Conecte uma conta de vídeo em Conexões para a Luna continuar.' },
  { taskId: 'tp-8', personaId: 'persona-bento', title: 'Cartaz da vitrine', shortName: 'Cartaz', status: 'queued' },
]
const planRow = (): ChannelMessageUi => ({
  id: 'team-plan', authorId: 'atlas', authorName: 'Atlas', body: 'Dividi assim:', ...base,
  teamPlan: mapTeamPlan(asView({ teamPlan: { requestId: 'req-1', title: 'Campanha de lançamento', parts: TEAM_PLAN_PARTS } }), TEAM)!,
})
const deliveryRow = (): ChannelMessageUi => ({
  id: 'delivery', authorId: 'atlas', authorName: 'Atlas', body: 'Pronto.', ...base,
  deliveryCard: mapDeliveryCard(asView({
    deliveryCard: {
      requestId: 'req-1', title: 'Campanha de lançamento',
      parts: [{ taskId: 'tp-1', personaId: 'persona-bento', title: 'Texto' }, { taskId: 'tp-2', personaId: 'persona-luna', title: 'Arte' }, { taskId: 'tp-3', personaId: 'persona-nina', title: 'Posts' }],
      reviewedBy: { personaId: 'persona-atlas' }, approvalId: 'approval-77',
    },
  }), TEAM)!,
})

// ---- HT-3 ------------------------------------------------------------------------------------------------------------------------------
const harnessRow = (id: string, extra: Record<string, unknown>): ChannelMessageUi => ({
  id, authorId: 'atlas', authorName: 'Atlas', body: 'movimento', ...base,
  harness: mapHarnessLine(asView({ harness: { verb: 'board_card_move', ticketId: 'ticket-1', title: 'Logo da padaria', persona: { personaId: 'persona-luna', name: 'Luna' }, ...extra } }), TEAM)!,
})

function Thread({ rows }: { readonly rows: readonly ChannelMessageUi[] }): ReactNode {
  return (
    <div className="gallery-thread">
      <MessageList
        t={t}
        team={TEAM}
        messages={rows}
        dailyBriefActions={{ onOpenApprovals: () => undefined, onOpenBoard: () => undefined, onOpenRoutines: () => undefined, onOpenTask: () => undefined }}
        onDecideAction={() => undefined}
        onUndoAction={() => undefined}
        onDecideInitiative={() => undefined}
        onResumePersona={() => undefined}
        onOpenApprovalItem={() => undefined}
        onOpenTaskOnBoard={() => undefined}
      />
    </div>
  )
}

/** Clica num botão pelo nome depois de montar (estados que mostram uma interação: Editar, Ver tudo). */
function useClick(name: string | null): void {
  useEffect(() => {
    if (name === null) return
    const timer = setTimeout(() => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === name)
      button?.click()
    }, 300)
    return () => { clearTimeout(timer) }
  }, [name])
}

const MANY_TODAY = [
  ['persona-nina', 'Comparar fornecedores de farinha e fermento para a semana que vem, com preço e prazo de entrega'],
  ['persona-bento', 'Escrever o post de lançamento da focaccia com chamada para a encomenda de sexta'],
  ['persona-luna', 'Refazer o logo da vitrine em três versões e mandar para a Ana escolher'],
  ['persona-atlas', 'Montar o calendário de postagens do mês com as datas de promoção'],
  ['persona-nina', 'Pesquisar três ideias de embalagem que cabem no orçamento'],
  ['persona-bento', 'Revisar o texto do cardápio da semana com os preços novos'],
  ['persona-luna', 'Preparar o cartaz de vitrine para a promoção de sexta'],
  ['persona-atlas', 'Conferir as entregas pendentes e avisar quem está esperando'],
].map(([personaId, title], index) => ({ taskId: `task-m${index}`, personaId: personaId!, title: title! }))

// ---- Faixa da equipe estreita e cartão da persona (bundle 6, achados da Muse) --------------------------------------------------------------
// A galeria MEDE em Chrome de verdade (`window.__galleryMeasure`, lido pelo runner): etiquetas que se sobrepõem ou saem da caixa do membro, e o cartão
// (caixa e "Enviar" dentro da janela, altura máxima = janela − 16 px, topo fixo).
declare global { interface Window { __galleryMeasure?: () => unknown; __galleryReady?: boolean } }

const STRIP_4: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination', 'team_manager'] },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working', draftFiles: 3 },
  { id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working' },
  { id: 'sol', name: 'Sol', role: 'Relacionamento', state: 'waiting' },
]
const STRIP_5: readonly ChannelPersonaMember[] = [
  STRIP_4[0]!, STRIP_4[1]!, { id: 'luna', name: 'Luna', role: 'Vigia', state: 'stuck' }, STRIP_4[2]!, STRIP_4[3]!,
]
const FACE_PROPS = { onClick: () => undefined, onPointerEnter: () => undefined, onPointerLeave: () => undefined, onKeyDown: () => undefined, 'aria-keyshortcuts': 'Shift+F10' } as const
const MENU_PROPS = (id: string) => ({ onClick: () => undefined, 'aria-haspopup': 'dialog', 'aria-expanded': false, 'data-persona-card-trigger': id }) as const

/** A faixa dentro de uma caixa de largura FIXA (a do canal, do zoom ou de muitos membros); a 1180 px ou menos a faixa vira uma coluna, como no app. */
function StripBox({ width, members, caption }: { readonly width: number; readonly members: readonly ChannelPersonaMember[]; readonly caption: string }): ReactNode {
  return (
    <div data-strip-box={String(width)} style={{ width, maxWidth: '100%', marginBottom: 20 }}>
      <p style={{ font: '700 12px/16px var(--persona-font-text)', color: 'var(--persona-ink-soft)', margin: '0 0 6px' }}>{caption}</p>
      <TeamChannelStrip t={shellT} members={members} personaFace={() => FACE_PROPS} personaMenu={MENU_PROPS} />
    </div>
  )
}

/** Larguras de caixa que fazem sentido em cada janela: a faixa só empilha (1 coluna) a 1180 px ou menos, como no app. */
function stripWidths(): readonly number[] {
  const vw = window.innerWidth
  return vw > 1180 ? [1100, 900] : [vw - 32, 460, 360]
}

function measureStrips(): unknown {
  const boxes = [...document.querySelectorAll<HTMLElement>('[data-strip-box]')]
  const out = boxes.map((box) => {
    const members = [...box.querySelectorAll<HTMLElement>('section ul > li')].filter(li => li.querySelector(':scope > span[title]') !== null)
    const rows = members.map((li) => {
      const tag = li.querySelector<HTMLElement>(':scope > span[title]')!
      const nameRow = tag.children[0] as HTMLElement
      const statusRow = tag.children[1] as HTMLElement
      const text = [...nameRow.querySelectorAll<HTMLElement>('span')].find(span => span.children.length === 0 && (span.textContent ?? '').trim() !== '')
      const statusText = statusRow.children[1] as HTMLElement | undefined
      const li_ = li.getBoundingClientRect()
      const tag_ = tag.getBoundingClientRect()
      return {
        name: (text?.textContent ?? '').trim(),
        member: { left: li_.left, right: li_.right, width: Math.round(li_.width) },
        tag: { left: tag_.left, right: tag_.right, width: Math.round(tag_.width) },
        inside: tag_.left >= li_.left - 0.5 && tag_.right <= li_.right + 0.5,
        compact: statusText !== undefined && getComputedStyle(statusText).position === 'absolute',
        nameTruncated: text !== undefined && text.scrollWidth > text.clientWidth + 0.5,
        statusTruncated: statusText !== undefined && getComputedStyle(statusText).position !== 'absolute' && statusText.scrollWidth > statusText.clientWidth + 0.5,
      }
    })
    let overlaps = 0
    for (let i = 1; i < rows.length; i += 1) if (rows[i - 1]!.tag.right > rows[i]!.tag.left + 0.5) overlaps += 1
    const outside = rows.filter(row => !row.inside).length
    return {
      boxWidth: Math.round(box.getBoundingClientRect().width),
      members: rows.length,
      memberWidth: rows[0]?.member.width ?? 0,
      compact: rows.filter(row => row.compact).length,
      overlaps,
      outside,
      namesTruncated: rows.filter(row => row.nameTruncated).map(row => row.name),
      statusTruncated: rows.filter(row => row.statusTruncated).map(row => row.name),
    }
  })
  return { boxes: out, violations: out.reduce((sum, row) => sum + row.overlaps + row.outside, 0) }
}

const ATLAS_CARD: PersonaCardInfo = {
  personaId: 'p-atlas', name: 'Atlas', handle: '@atlas', role: 'Coordenação', characterId: 'atlas',
  systemRoles: ['coordination', 'team_manager'], nowKind: 'resting', nowText: 'Descansando — nada na fila',
  presence: 'online', talk: { everyone: true, names: [] }, ownerName: 'Você', projectName: 'Pessoal',
  engineLabel: 'Claude', engineChip: 'Haiku', autonomyLevel: 'propose', capabilities: { tools: [] },
}

/** O cartão aberto de verdade (o clique no rosto, como a pessoa) a `topPct` % da altura da janela; `scrolled` rola o MEIO até o fim. */
function CardOpen({ topPct, scrolled = false }: { readonly topPct: number; readonly scrolled?: boolean }): ReactNode {
  const card = usePersonaCardController()
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    window.__galleryReady = false
    const open = setTimeout(() => { trigger.current?.click() }, 250)
    const settle = setTimeout(() => {
      if (scrolled) {
        const area = document.querySelector<HTMLElement>('[role="dialog"] article > div')
        if (area !== null) area.scrollTop = area.scrollHeight
      }
      window.__galleryReady = true
    }, 700)
    return () => { clearTimeout(open); clearTimeout(settle) }
  }, [scrolled])
  return (
    <>
      <div style={{ position: 'fixed', left: 120, top: `${topPct}%` }}>
        <button ref={trigger} type="button" {...card.triggerProps('p-atlas')} style={{ padding: '8px 14px', border: '1.5px solid var(--persona-outline)', borderRadius: 12, background: 'var(--persona-card)', color: 'var(--persona-ink)', font: '700 14px/20px var(--persona-font-text)' }}>Atlas</button>
      </div>
      <PersonaCardPopover {...card.popoverProps} label="Cartão de Atlas">
        <PersonaInfoCard info={ATLAS_CARD} onOpenProfile={() => undefined} onEdit={() => undefined} onEditTalk={() => undefined} onTogglePause={() => undefined} onSwitchEngine={() => undefined} onSendMessage={() => undefined} />
      </PersonaCardPopover>
    </>
  )
}

function measureCard(): unknown {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
  if (dialog === null) return { problems: ['o cartão não abriu'], violations: 1 }
  const box = dialog.getBoundingClientRect()
  const send = [...dialog.querySelectorAll<HTMLElement>('button')].find(button => button.getAttribute('aria-label') === 'Enviar')
  const area = dialog.querySelector<HTMLElement>('article > div')
  const head = area?.firstElementChild as HTMLElement | null | undefined
  const vh = window.innerHeight
  const inside = (rect: DOMRect | undefined): boolean => rect !== undefined && rect.top >= -0.5 && rect.bottom <= vh + 0.5
  const sendBox = send?.getBoundingClientRect()
  const problems: string[] = []
  if (!inside(box)) problems.push('a caixa do cartão passa da janela')
  if (!inside(sendBox)) problems.push('o "Enviar" fica fora da janela')
  if (box.height > vh - 16 + 0.5) problems.push('o cartão é mais alto que a janela − 16 px')
  const round = (value: number): number => Math.round(value * 10) / 10
  return {
    viewportH: vh,
    dialog: { top: round(box.top), bottom: round(box.bottom), height: round(box.height) },
    send: sendBox === undefined ? null : { top: round(sendBox.top), bottom: round(sendBox.bottom) },
    middleScrolls: area === null || area === undefined ? null : area.scrollHeight > area.clientHeight + 1,
    headStaysAtTop: head === null || head === undefined || area === null || area === undefined ? null : Math.abs(head.getBoundingClientRect().top - area.getBoundingClientRect().top) < 1,
    problems,
    violations: problems.length,
  }
}

function Gallery({ state }: { readonly state: string }): ReactNode {
  useClick(state === 'previa-email-editar' ? 'Editar' : state.startsWith('acao-direta-ver') ? 'Ver' : state === 'plano-vivo-parou' ? 'Ver motivo' : null)
  let content: ReactNode
  switch (state) {
    case 'bom-dia': content = <Thread rows={[briefRow()]} />; break
    case 'bom-dia-tarde': content = <Thread rows={[briefRow({ variant: 'on-demand' }, AFTERNOON)]} />; break
    case 'bom-dia-sem-hoje': content = <Thread rows={[briefRow({ today: [], needsYou: { count: 0 }, yesterdayMore: 0 })]} />; break
    case 'bom-dia-ver-tudo': content = <Thread rows={[briefRow({ today: MANY_TODAY })]} />; break
    case 'previa-email': content = <Thread rows={[previewRow(EMAIL)]} />; break
    case 'previa-email-editar': content = <Thread rows={[previewRow(EMAIL)]} />; break
    case 'previa-pagamento': content = <Thread rows={[previewRow(PAY)]} />; break
    case 'previa-apagar': content = <Thread rows={[previewRow(DELETE)]} />; break
    case 'previa-parcial': content = <Thread rows={[previewRow({ ...EMAIL, approvalId: 'approval-4', truncated: true })]} />; break
    case 'previa-enviando': content = <Thread rows={[previewRow({ ...EMAIL, approvalId: 'approval-5', status: 'sending' })]} />; break
    case 'previa-enviado': content = <Thread rows={[previewRow({ ...EMAIL, approvalId: 'approval-6', status: 'sent', sentAt: new Date().toISOString() }), previewRow({ ...EMAIL, approvalId: 'approval-7', status: 'cancelled' })]} />; break
    case 'acao-direta':
      content = (
        <Thread rows={[
          eventRow('ev-1', { verb: 'email', connectorName: 'Gmail', target: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', activityId: 'act-1', content: EMAIL_SENT }),
          eventRow('ev-2', { verb: 'delete', connectorName: 'Drive', target: '3 arquivos antigos', activityId: 'act-2', undoable: true, undoUntil: inSeconds(3600), content: { items: ['contrato-antigo.pdf', 'rascunho-cardapio.docx', 'foto-vitrine-1.png'], count: 3 } }),
          eventRow('ev-3', { verb: 'board_card_move', connectorName: 'Quadros', target: 'Logo da padaria', after: 'Fazendo', activityId: 'act-3', undoable: true, undoUntil: inSeconds(3600) }),
          eventRow('ev-4', { verb: 'routine_pause', connectorName: 'Rotinas', target: 'Resumo da manhã', activityId: 'act-4', undoable: true, undoUntil: inSeconds(42) }),
          eventRow('ev-5', { verb: 'verbo_novo_do_host', connectorName: 'Quadros', target: 'Logo da padaria', activityId: 'act-5' }),
        ]} />
      )
      break
    case 'acao-direta-ver':
      content = <Thread rows={[eventRow('ev-v1', { verb: 'email', connectorName: 'Gmail', target: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', activityId: 'act-v1', content: EMAIL_SENT })]} />
      break
    case 'acao-direta-ver-pagamento':
      content = <Thread rows={[eventRow('ev-v2', { verb: 'pay', connectorName: 'Mercado Pago', target: 'R$ 120,00', activityId: 'act-v2', content: { amount: 'R$ 120,00', payee: 'Moinho Bom Grão', reference: 'Pedido 4471 · farinha 25 kg' } })]} />
      break
    case 'plano-vivo':
    case 'plano-vivo-parou':
      content = <Thread rows={[planRow()]} />
      break
    case 'entrega':
      content = <Thread rows={[planRow(), deliveryRow()]} />
      break
    case 'iniciativa':
      content = <Thread rows={[initiativeRow('ini-1', {}), initiativeRow('ini-2', { status: 'decided', choice: 'once' }), initiativeRow('ini-3', { status: 'decided', choice: 'not-now' })]} />
      break
    case 'lado':
    case 'lado-falha': {
      const personaOf = (id: string) => { const p = TEAM.personas.find(row => row.id === id); return p === undefined ? undefined : { name: p.name, characterId: p.avatarRef as never } }
      content = <AsideCard t={t} items={state === 'lado' ? ASIDE_OK : ASIDE_FAIL} personaOf={personaOf} onRetry={() => undefined} onDismiss={() => undefined} onResumePersona={() => undefined} />
      break
    }
    case 'ht3':
      content = (
        <Thread rows={[
          harnessRow('h-1', { outcome: 'started' }),
          harnessRow('h-2', { outcome: 'held', reason: 'paused' }),
          harnessRow('h-3', { outcome: 'held', reason: 'silence', until: '07:00' }),
          harnessRow('h-4', { outcome: 'held', reason: 'delivery_pending' }),
          harnessRow('h-5', { outcome: 'held', reason: 'no_owner', persona: undefined }),
        ]} />
      )
      break
    case 'aparencia-sistema':
    case 'aparencia-claro':
    case 'aparencia-escuro':
      content = <AppearanceSettingsPanel t={shellT} themeBridge={createLocalThemeBridge()} />
      break
    case 'equipe-personas':
      content = <PersonasTeamPanel t={shellT} roster={PERSONAS_ROSTER} onOpenPersona={() => undefined} onHire={() => undefined} />
      break
    case 'equipe-personas-vazio':
      content = <PersonasTeamPanel t={shellT} roster={[]} onHire={() => undefined} />
      break
    case 'faixa-equipe-estreita':
      window.__galleryMeasure = measureStrips
      content = (
        <>
          {stripWidths().map(width => (
            <div key={width}>
              <StripBox width={width} members={STRIP_4} caption={`${String(width)} px · 4 membros (Descansando, Num rascunho, Trabalhando, Aguardando você)`} />
              <StripBox width={width} members={STRIP_5} caption={`${String(width)} px · 5 membros (com Precisa de ajuda)`} />
            </div>
          ))}
        </>
      )
      break
    case 'cartao-persona-rodape':
      window.__galleryMeasure = measureCard
      content = <CardOpen topPct={45} />
      break
    case 'cartao-persona-rodape-baixo':
      window.__galleryMeasure = measureCard
      content = <CardOpen topPct={78} />
      break
    case 'cartao-persona-rodape-rolado':
      window.__galleryMeasure = measureCard
      content = <CardOpen topPct={20} scrolled />
      break
    default: content = <p>Estado desconhecido: {state}</p>
  }
  return (
    <main data-gallery-state={state} style={{ maxWidth: state.startsWith('aparencia') || state.startsWith('equipe-') || state.startsWith('faixa-') ? 1180 : 720, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ font: '800 12px/16px var(--persona-font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--persona-ink-soft)', margin: '0 0 12px' }}>Galeria do fio · {state}</h1>
      {content}
    </main>
  )
}

const state = window.location.hash.replace('#', '') || 'bom-dia'
chooseTheme(state)
document.body.style.background = 'var(--persona-paper)'
document.body.style.color = 'var(--persona-ink)'
createRoot(document.getElementById('root')!).render(<Gallery state={state} />)
