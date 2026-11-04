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

const STATES: Readonly<Record<string, () => ReactNode>> = {
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
