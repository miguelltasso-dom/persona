// Lumen: gallery of "Revisar mudanças" and "Projeto › Histórico" with sample data (the draft host, SW-6, is not here yet).
// Built by scripts/persona/lumen-review-gallery.mjs; `#state` picks what is drawn. Not shipped with the app.
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import { DraftReviewPanel } from '../../../packages/persona/client-ui-persona/src/client/review/simple/DraftReviewPanel.tsx'
import { ProjectHistoryView, type HistoryEntryUi } from '../../../packages/persona/client-ui-persona/src/client/review/simple/ProjectHistoryView.tsx'
import type { DraftFileUi } from '../../../packages/persona/client-ui-persona/src/client/review/simple/draft-types.ts'
import { diffLines } from '../../../packages/persona/client-ui-persona/src/client/review/simple/text-diff.ts'
import { draftFilesFromReviewSummary } from '../../../packages/persona/client-ui-persona/src/client/review/simple/patch-to-changes.ts'
import { BoardsHome } from '../../../packages/persona/client-ui-persona/src/client/boards/BoardsHome.tsx'
import { MOCK_PROJECT_BOARD_SUMMARIES } from '../../../packages/persona/client-ui-persona/src/client/boards/mock-data.ts'
import type { ProjectBoardSummary } from '../../../packages/persona/client-ui-persona/src/client/boards/types.ts'
import { pt as kanbanPt } from '../../../packages/persona/client-ui-persona/src/client/locale/kanban/locales.ts'
import { ReviewDeliveryPanel } from '../../../packages/persona/client-ui-persona/src/client/review/ReviewDeliveryPanel.tsx'
import { SecondBrainHome } from '../../../packages/persona/client-ui-persona/src/client/second-brain/SecondBrainHome.tsx'
import { pt as brainPt } from '../../../packages/persona/client-ui-persona/src/client/locale/second-brain/locales.ts'
import { pt as bycPt } from '../../../packages/persona/client-ui-persona/src/client/locale/onboarding/locales.ts'
import { ProposalReview, type ContextProposal, type ProposalChoice } from '../../../packages/persona/client-ui-persona/src/client/primitives/index.ts'
import { bindLocale } from '../../../packages/persona/client-ui-persona/src/client/preview/locale-bind.ts'
import { useState } from 'react'
import { OverviewView } from '../../../packages/persona/client-ui-persona/src/client/overview/OverviewView.tsx'
import { MOCK_AWAY_SUMMARY, MOCK_OVERVIEW_NOW } from '../../../packages/persona/client-ui-persona/src/client/overview/mock-overview-proactivity.ts'
import { shellTranslate } from '../../../packages/persona/client-ui-persona/src/client/preview/shell-translate.ts'
import { ApprovalsInbox } from '../../../packages/persona/client-ui-persona/src/client/approvals/ApprovalsInbox.tsx'
import { approvalViewToItem } from '../../../packages/persona/client-ui-persona/src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../../../packages/persona/client-ui-persona/src/client/locale/approvals/locales.ts'
import { houseEmptyArt } from '../../../packages/persona/client-ui-persona/src/client/decor/HouseDecor.tsx'
import { ILLUSTRATIONS } from '../../../packages/persona/client-ui-persona/src/client/assets/generated-imports.ts'
import { EmptyState } from '../../../packages/persona/client-ui-persona/src/client/primitives/index.ts'
import { ConnectedProjectFlowBoard } from '../../../packages/persona/client-ui-persona/src/client/remote/ConnectedProjectFlowBoard.tsx'
import { FanoutBlock } from '../../../packages/persona/client-ui-persona/src/client/chat/fanout/FanoutBlock.tsx'
import { FanoutChip } from '../../../packages/persona/client-ui-persona/src/client/chat/fanout/FanoutChip.tsx'
import { buildFanoutBlocks } from '../../../packages/persona/client-ui-persona/src/client/chat/fanout/fanout-block-model.ts'
import { pt as chatPt } from '../../../packages/persona/client-ui-persona/src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../../../packages/persona/client-ui-persona/src/client/remote/map-host-ui.ts'

const svg = (fill: string, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${fill}"/><text x="160" y="108" font-size="28" text-anchor="middle" fill="#2a1b3d" font-family="sans-serif">${label}</text></svg>`)}`

const MENU_BEFORE = '# Cardápio de novembro\n\nPão francês: R$ 12 o quilo\nBolo de cenoura: R$ 30\nCafé coado: R$ 6\n\nHorário: de segunda a sábado, das 7h às 19h.\nEncomendas pelo WhatsApp até as 16h do dia anterior.\n\nObs.: aceitamos Pix e cartão.\n'
const MENU_AFTER = '# Cardápio de novembro\n\nPão francês: R$ 14 o quilo\nBolo de cenoura: R$ 30\nCafé coado: R$ 6\nTorta de limão: R$ 38\n\nHorário: de segunda a sábado, das 7h às 19h.\nEncomendas pelo WhatsApp até as 16h do dia anterior.\n\nObs.: aceitamos Pix e cartão.\n'

const doc: DraftFileUi = { id: 'cardapio', name: 'cardapio.md', folder: 'Cardápio/2026', kind: 'changed', type: 'text', ops: diffLines(MENU_BEFORE, MENU_AFTER) }
const sheet: DraftFileUi = {
  id: 'precos', name: 'precos.xlsx', folder: 'Cardápio/2026', kind: 'changed', type: 'sheet',
  cells: [
    { sheet: 'Preços', cell: 'C4', before: 'R$ 12', after: 'R$ 14' },
    { sheet: 'Preços', cell: 'C9', before: 'R$ 36', after: 'R$ 38' },
    { sheet: 'Preços', cell: 'D2', before: '—', after: 'novo' },
    { sheet: 'Resumo', cell: 'B1', before: 'R$ 1.020', after: 'R$ 1.140' },
  ],
}
const image: DraftFileUi = { id: 'logo', name: 'logo.png', folder: 'Marca', kind: 'changed', type: 'image', beforeImageSrc: svg('#e9dcf7', 'Antes'), afterImageSrc: svg('#fbe3a8', 'Depois') }
const pdf: DraftFileUi = { id: 'contrato', name: 'contrato.pdf', folder: 'Contratos', kind: 'new', type: 'pdf', canOpenDraft: true }

// Atlas 07/11 (lib 6c): a poster the persona saved as `cartaz.svg` is drawn from the patch; the PNG next to it comes from the host (here a canvas stands in for its bytes).
const POSTER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" rx="16" fill="#fde7c4"/><circle cx="262" cy="52" r="26" fill="#e8a33d"/><text x="24" y="96" font-size="30" font-family="sans-serif" fill="#34243f">Promoção de Natal</text><text x="24" y="136" font-size="18" font-family="sans-serif" fill="#5e4e6b">Pão doce e panetone</text></svg>'
const posterPng = (): string => {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fde7c4'; ctx.fillRect(0, 0, 320, 200)
  ctx.fillStyle = '#e8a33d'; ctx.beginPath(); ctx.arc(262, 52, 26, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#34243f'; ctx.font = '30px sans-serif'; ctx.fillText('Promoção de Natal', 24, 96)
  ctx.fillStyle = '#5e4e6b'; ctx.font = '18px sans-serif'; ctx.fillText('Pão doce e panetone', 24, 136)
  return canvas.toDataURL('image/png')
}
const POSTER_FILES = draftFilesFromReviewSummary({
  ticketId: 't-poster',
  files: [{ path: 'Cartaz/cartaz.svg', added: 1, deleted: 0 }, { path: 'Cartaz/cartaz.png', added: 0, deleted: 0, kind: 'new', afterImage: posterPng() }],
  added: 1,
  deleted: 0,
  patch: ['diff --git a/Cartaz/cartaz.svg b/Cartaz/cartaz.svg', 'new file mode 100644', '--- /dev/null', '+++ b/Cartaz/cartaz.svg', '@@ -0,0 +1,1 @@', `+${POSTER_SVG}`].join('\n'),
  patchTruncated: false,
  patchLimitBytes: 32_768,
  secretsRedacted: false,
  testsClaimed: [],
})
const gone: DraftFileUi = { id: 'velho', name: 'cardapio-2025.md', folder: 'Cardápio/2025', kind: 'deleted', type: 'text', ops: diffLines('# Cardápio de 2025\nPão: R$ 10\n', '') }

const now = Date.now()
const iso = (hoursAgo: number): string => new Date(now - hoursAgo * 3_600_000).toISOString()
const history: HistoryEntryUi[] = [
  { id: 'h1', who: 'Bia', at: iso(2), files: [{ name: 'cardapio.md' }, { name: 'precos.xlsx' }, { name: 'logo.png' }] },
  { id: 'h2', who: 'Bia', at: iso(27), files: [{ name: 'notas-da-reuniao.docx' }] },
  { id: 'h3', who: 'Téo', at: iso(80), files: [{ name: 'a.txt' }, { name: 'b.txt' }, { name: 'c.txt' }, { name: 'd.txt' }, { name: 'e.txt' }], undone: true },
]

// ---- PB-5: project cards (Contratação, Site, and a project with nothing on its board)
const EMPTY_PROJECT: ProjectBoardSummary = { id: 'pessoal', name: 'Pessoal', flowModel: 'simples', counts: { todo: 0, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 }, needsYouCount: 0, activeWorkers: [] }
const ONE_WORKER: ProjectBoardSummary = { id: 'mkt', name: 'Campanha de novembro', flowModel: 'marketing', counts: { todo: 1, doing: 1, review: 0, needs_you: 0, done: 1, blocked: 0 }, needsYouCount: 0, activeWorkers: [{ name: 'Nina', state: 'working' }] }

// ---- SB-5: Segundo cérebro home with the data the app really has (a permission page, the automatic index)
const brainPage = (partial: Record<string, unknown>) => ({ body: '', slug: String(partial.id), revision: 1, links: [], sources: [], editorHint: 'person:owner', updatedAt: new Date().toISOString(), restricted: false, ...partial }) as never
const START = brainPage({ id: 'start', kind: 'company', title: 'Comece aqui', body: '# Comece aqui\n\nAtualizado sozinho a partir das páginas.\n\n- [[Cardápio]] (empresa)\n- [[Responder no WhatsApp: clientes aprovados]]', editorHint: 'person:system', sources: ['derived-index'] })
const GRANT_PAGE = brainPage({ id: 'grant-1', kind: 'permission', title: 'reply-whatsapp · clientes-aprovados', sources: ['grant:owner'] })

// ---- BYC-4: the review states, one row each
const bycProposals: ContextProposal[] = [
  { id: 'a', kind: 'brief', text: 'A Padaria Aurora vende pães e bolos em Itu desde 2014.', provenance: 'colado do ChatGPT em 04/11' },
  { id: 'b', kind: 'memory', text: 'Maria (dona) aprova orçamentos acima de R$ 500.', provenance: 'colado do ChatGPT em 04/11' },
  { id: 'c', kind: 'constraint', text: 'Nunca enviar proposta comercial sem revisão do jurídico.', provenance: 'de regras.md' },
  { id: 'h', kind: 'constraint', text: 'Respostas de orçamento saem em até 1 dia útil.', provenance: 'de regras.md' },
  { id: 'd', kind: 'memory', text: 'Atendemos de segunda a sábado, das 7h às 19h.', provenance: 'colado do Claude em 04/11', conflict: 'Atendemos de segunda a sábado', conflictKind: 'duplicate' },
  { id: 'e', kind: 'decision', text: 'O pão francês passa a custar R$ 15.', provenance: 'colado do Gemini em 04/11', conflict: 'O Cofre já tem a decisão fixada: “Pão francês custa R$ 14”. A colagem diz: “R$ 15”. Qual vale?', conflictKind: 'question' },
  { id: 'f', kind: 'memory', text: 'Talvez abrir aos domingos no fim do ano.', provenance: 'de ideias.md', uncertain: true },
  { id: 'g', kind: 'memory', text: 'CPF do contador: 123.456.789-00', provenance: 'colado do ChatGPT em 04/11', sensitive: 'parece um CPF' },
]
const bycChoices: Record<string, ProposalChoice> = {
  a: { decision: 'accept', private: false, text: bycProposals[0]!.text },
  b: { decision: 'accept', private: true, text: bycProposals[1]!.text },
  h: { decision: 'accept', private: false, text: bycProposals[3]!.text },
  d: { decision: 'discard', private: false, text: bycProposals[4]!.text },
  e: { decision: 'discard', private: false, text: bycProposals[5]!.text },
  f: { decision: 'accept', private: false, text: 'Talvez abrir aos domingos só no fim do ano.' },
  g: { decision: 'discard', private: false, text: bycProposals[7]!.text },
}
function BycReviewGallery(): ReactNode {
  const [choices, setChoices] = useState(bycChoices)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(bycPt, key, params)
  const countOf = (kind: string): number => bycProposals.filter(p => p.kind === kind && (choices[p.id]?.decision ?? 'accept') === 'accept').length
  void countOf
  return (
    <ProposalReview
      proposals={bycProposals}
      choices={choices}
      onChoice={(id, choice) => { setChoices(prev => ({ ...prev, [id]: choice })) }}
      onSave={() => {}}
      labels={{
        kinds: { brief: t('byc.review.kind.brief'), constraint: t('byc.review.kind.constraint'), decision: t('byc.review.kind.decision'), memory: t('byc.review.kind.memory') },
        accept: t('byc.review.accept'),
        discard: t('byc.review.discard'),
        edit: t('byc.review.edit'),
        done: t('byc.review.done'),
        private: t('byc.review.private'),
        uncertain: t('byc.review.uncertain'),
        sensitiveBlocked: why => t('byc.review.sensitiveBlocked', { why }),
        unblock: t('byc.review.unblock'),
        conflict: what => t('byc.review.conflict', { what }),
        acceptClean: t('byc.review.acceptClean'),
        save: n => t('byc.review.save', { count: n }),
        summary: (accepted, flagged, discarded) => t('byc.review.summary', { accepted: String(accepted), flagged: String(flagged), discarded: String(discarded) }),
        acceptAllRules: count => t('byc.review.acceptAllRules', { count: String(count) }),
        pendingRules: count => t(count === 1 ? 'byc.review.pendingRules.one' : 'byc.review.pendingRules', { count: String(count) }),
        pendingRuleNote: t('byc.review.pendingRuleNote'),
        constraintNotice: count => t(count === 1 ? 'byc.review.constraintNotice.one' : 'byc.review.constraintNotice', { count: String(count) }),
      }}
    />
  )
}

const ATTENTION_CARD = approvalViewToItem({ id: 'att-1', kind: 'attention', title: 'Primeira entrega', question: 'Primeira entrega', status: 'pending', personaId: 'bento', personaName: 'Bento' })
const SECOND_CARD = approvalViewToItem({ id: 'att-2', kind: 'attention', title: 'Cardápio de novembro', question: 'Posso publicar o cardápio novo?', status: 'pending', personaId: 'nina', personaName: 'Nina' })

// D-090: the board with the team-work chips (run with LUMEN_TEAMWORK=1: the flag + the two dev keys). Internal only.
const TEAMWORK_BOARD = {
  projectId: 'proj-site', projectName: 'Site da agência', persisted: true,
  counts: { todo: 0, doing: 1, review: 0, needs_you: 0, done: 0, blocked: 0 },
  workflow: { projectId: 'proj-site', template: 'site', fields: [], columns: [{ id: 'c-todo', name: 'A fazer', category: 'todo' }, { id: 'c-doing', name: 'Fazendo', category: 'doing' }, { id: 'c-review', name: 'Em revisão', category: 'review' }, { id: 'c-done', name: 'Live', category: 'done' }] },
  cards: [{ ticketId: 't-real', title: 'Preço do pão', category: 'doing', columnId: 'c-doing', blocked: false }],
}
const TEAMWORK_PERSONAS = [{ id: 'nina', name: 'Nina', title: 'Revisão', systemRoles: [] }, { id: 'bento', name: 'Bento', title: 'Código', systemRoles: [] }, { id: 'atlas', name: 'Atlas', title: 'Coordenação', systemRoles: [] }]
const teamworkPersona = { getProjectBoard: async () => ({ ok: true, value: TEAMWORK_BOARD }), moveTicket: async () => ({ ok: true, value: undefined }), listPersonas: async () => ({ ok: true, value: TEAMWORK_PERSONAS }) }

// CV-8: the card "Respostas da equipe de {x}" and the estimate chip (internal gallery; the acceptance capture is the real shell).
const chatT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const fanLine = (index: number, personaId: string, name: string, kind: 'reply' | 'nothing' | 'limit' | 'failed', body: string, extra: Record<string, unknown> = {}): ChannelMessageUi => ({
  id: `coord-m1-fan-${personaId}`, authorId: personaId, authorName: name, body, timeLabel: '10:00', reactions: [],
  fanout: { id: 'fan-m1', source: 'everyone', total: 6, index, personaId, kind, ...extra },
} as ChannelMessageUi)
const FAN_LINES: readonly ChannelMessageUi[] = [
  fanLine(1, 'nina', 'Nina', 'reply', 'Eu cuido do contrato e posso mandar hoje.\nVou revisar o anexo também e aviso a Maria quando estiver pronto, ainda antes das 17h.\nSe faltar algo, peço pelo canal.'),
  fanLine(2, 'bento', 'Bento', 'reply', 'O site já está no ar; só falta o texto da página de contato.'),
  fanLine(3, 'sol', 'Sol', 'nothing', ''),
  fanLine(4, 'luna', 'Luna', 'nothing', ''),
  fanLine(5, 'atlas', 'Atlas', 'limit', '', { until: '2026-11-04T17:30:00' }),
  fanLine(6, 'cervo', 'Cervo', 'failed', '', { message: 'Houve um problema ao responder. Tente de novo em instantes.' }),
]

// "Precisa de você / Liberar para {B}" (contracts/team-real.md §9): the colleague case and the initiative case, as the live store would drive them.
const CONNECTOR_COLLEAGUE = approvalViewToItem({ id: 'conn-1', kind: 'connector', title: 'Liberar o Gmail para Téo', question: '', status: 'pending', personaId: 'bento', personaName: 'Bento', connector: { reason: 'colleague', connectorName: 'Gmail', cli: 'claude', connectorId: 'gmail', access: 'read', requestedByPersonaId: 'nina', requestedByPersonaName: 'Nina', taskId: 't-1', taskTitle: 'Arte da home', options: ['once', 'always', 'not-now'] } } as never)
const CONNECTOR_INITIATIVE = approvalViewToItem({ id: 'conn-2', kind: 'connector', title: 'Liberar o Drive para Luna', question: '', status: 'pending', personaId: 'luna', personaName: 'Luna', connector: { reason: 'initiative', connectorName: 'Drive', cli: 'claude', connectorId: 'drive', access: 'read', purpose: 'organizar as notas da semana na pasta Clientes', options: ['once', 'not-now'] } } as never)

const STATES: Readonly<Record<string, () => ReactNode>> = {
  'approvals-connector': () => <ApprovalsInbox dict={approvalsPt} items={[{ ...CONNECTOR_COLLEAGUE, decisionState: 'pending' }, { ...CONNECTOR_INITIATIVE, decisionState: 'pending' }]} onDecideItem={() => {}} onDecideConnector={() => {}} />,
  'fanout-block': () => <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}><FanoutBlock t={chatT} block={[...buildFanoutBlocks(FAN_LINES).values()][0]!} teamName="Marketing" /></ol>,
  'fanout-block-progress': () => <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}><FanoutBlock t={chatT} block={[...buildFanoutBlocks(FAN_LINES.slice(0, 2)).values()][0]!} teamName="Marketing" /></ol>,
  'fanout-chip': () => (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <FanoutChip t={chatT} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 } }} />
      <FanoutChip t={chatT} choice="everyone" teamCount={4} />
      <FanoutChip t={chatT} choice="everyone" teamCount={30} estimate={{ replies: 30, calls: { min: 30, max: 30 } }} confirming onConfirm={() => {}} onRelevantOnly={() => {}} />
    </div>
  ),
  'teamwork-board': () => <ConnectedProjectFlowBoard persona={teamworkPersona as never} scope={{ workspaceId: 'ws', projectId: 'proj-site' }} onBack={() => {}} onMutate={() => {}} />,
  // D-089 (b): the house ornaments (run with LUMEN_DECOR=1 so persona.flag.houseDecor is on). Internal only: the acceptance capture is the real shell.
  'decor-overview': () => <OverviewView t={shellTranslate} attentionItems={['Aprovar o cardápio de novembro']} nowRows={MOCK_OVERVIEW_NOW} awayEvents={MOCK_AWAY_SUMMARY} />,
  'decor-approvals': () => <ApprovalsInbox dict={approvalsPt} items={[ATTENTION_CARD, SECOND_CARD]} />,
  'decor-empty-approvals': () => <ApprovalsInbox dict={approvalsPt} items={[]} />,
  'decor-empty-dm': () => <EmptyState compact illustration={ILLUSTRATIONS['empty-dm']} art={houseEmptyArt('empty-dm', 'empty-dm-noite')} title="Nenhuma conversa ainda" body="Escolha alguém da equipe para começar." />,
  'decor-empty-geral': () => <EmptyState compact illustration={ILLUSTRATIONS['empty-dm']} art={houseEmptyArt('empty-dm', 'empty-geral-noite')} title="Este é o começo do #geral" body="Peça algo e a equipe divide entre si." />,
  boards: () => <BoardsHome dict={kanbanPt} summaries={[...MOCK_PROJECT_BOARD_SUMMARIES, ONE_WORKER, EMPTY_PROJECT]} onOpenProject={() => {}} onNewProject={() => {}} onGlobalView={() => {}} onCreateFirstTask={() => {}} />,
  'boards-empty-only': () => <BoardsHome dict={kanbanPt} summaries={[EMPTY_PROJECT]} onOpenProject={() => {}} onNewProject={() => {}} onCreateFirstTask={() => {}} />,
  'second-brain': () => (
    <SecondBrainHome
      dict={brainPt}
      home={{ startHereId: 'start', changedToday: [START, GRANT_PAGE], activeGrants: [{ id: 'g1', pageId: 'grant-1', personaId: 'nina', action: 'reply-whatsapp', target: 'clientes-aprovados', validity: 'until-revoke', useCount: 3 }], contradictions: [], leftover: [] }}
      pages={[START, GRANT_PAGE]}
      personaNames={{ nina: 'Nina' }}
      memberNames={{ owner: 'Você' }}
      onOpenPage={() => {}}
      onOpenPermissions={() => {}}
      onOpenKind={() => {}}
      onBringContext={() => {}}
      onWritePage={() => {}}
      onRevokeGrant={() => {}}
    />
  ),
  'byc-review': () => <BycReviewGallery />,
  'review-loading': () => <ReviewDeliveryPanel initialState="loading" summary={null} />,
  review: () => <DraftReviewPanel personaName="Bia" taskTitle="Atualizar o cardápio" files={[doc, sheet, image, pdf, gone]} onApply={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} onOpenDraftFile={() => {}} />,
  'review-text': () => <DraftReviewPanel personaName="Bia" taskTitle="Atualizar o cardápio" files={[doc]} onApply={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} />,
  'review-image': () => <DraftReviewPanel personaName="Bia" taskTitle="Cartaz de natal" files={POSTER_FILES} onApply={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} />,
  'review-image-done': () => <DraftReviewPanel personaName="Bia" taskTitle="Cartaz de natal" files={POSTER_FILES} phase={{ kind: 'done', undoable: true }} onApply={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} onUndoApplied={() => {}} onLeave={() => {}} />,
  'review-conflict': () => <DraftReviewPanel personaName="Bia" files={[{ ...doc, id: 'c1', name: 'cardapio.docx', conflict: true, folderText: MENU_BEFORE.replace('R$ 12', 'R$ 13').replace('Café coado: R$ 6', 'Café coado: R$ 7') }, sheet]} onApply={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} />,
  'review-locked': () => <DraftReviewPanel personaName="Bia" files={[doc, sheet]} phase={{ kind: 'locked', file: 'precos.xlsx' }} onApply={() => {}} onRetry={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} />,
  'review-onedrive': () => <DraftReviewPanel personaName="Bia" files={[doc, sheet]} phase={{ kind: 'downloading', file: 'cardapio.docx', percent: 40 }} onApply={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} />,
  'review-failed': () => <DraftReviewPanel personaName="Bia" files={[doc]} phase={{ kind: 'failed', detail: 'ENOSPC: no space left on device' }} onApply={() => {}} onRetry={() => {}} onRequestChanges={() => {}} onDiscard={() => {}} />,
  history: () => <ProjectHistoryView entries={history} onUndo={() => {}} />,
  'history-empty': () => <ProjectHistoryView entries={[]} onUndo={() => {}} />,
}

const state = window.location.hash.replace('#', '') || 'review'
const render = STATES[state] ?? STATES.review!
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.setAttribute('data-ds-dark-theme', 'true')

// The app's frame: the rail keeps its width, the screen gets what is left (so 960 px and 200 % zoom are honest).
createRoot(document.getElementById('root')!).render(
  <div data-persona-root="" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', minHeight: '100vh', background: 'var(--persona-paper)', color: 'var(--persona-ink)' }}>
    <aside style={{ background: 'var(--persona-rail)' }} aria-hidden="true" />
    <main data-gallery-state={state} style={{ padding: 24, minWidth: 0 }}>{render()}</main>
  </div>,
)
