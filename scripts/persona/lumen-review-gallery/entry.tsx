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

const STATES: Readonly<Record<string, () => ReactNode>> = {
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
