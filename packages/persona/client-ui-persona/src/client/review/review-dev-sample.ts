/**
 * A sample draft for the real shell — CAPTURES ONLY. In the web app the fake CLI writes no files into a worktree, so no
 * ticket reaches "Em revisão" with something to look at; the design review (D-074: inside the complete shell) needs one.
 * Opt-in, dev seed only: `localStorage['persona.devSeed.review'] = '1'` (and the dev seed flag). Without it nothing here
 * runs, and no host call is replaced.
 */

import type { ReviewAcceptView, ReviewSummaryView } from '@deepseek-ai/dsh-persona-host/types'
import { readClientDevSeedEnabled } from '../remote/persona-dev-seed.ts'

const KEY = 'persona.devSeed.review'

export function reviewDevSampleEnabled(): boolean {
  if (!readClientDevSeedEnabled()) return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const REVIEW_DEV_TICKET_ID = 'dev-review-sample'
export const REVIEW_DEV_TASK_TITLE = 'Atualizar o cardápio de novembro'

const svg = (fill: string, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220"><rect width="360" height="220" fill="${fill}"/><text x="180" y="120" font-size="30" text-anchor="middle" fill="#2a1b3d" font-family="sans-serif">${label}</text></svg>`)}`

const MENU_BEFORE = '# Cardápio de novembro\n\nPão francês: R$ 12 o quilo\nBolo de cenoura: R$ 30\nCafé coado: R$ 6\n\nHorário: de segunda a sábado, das 7h às 19h.\nEncomendas pelo WhatsApp até as 16h do dia anterior.\n'
const MENU_AFTER = '# Cardápio de novembro\n\nPão francês: R$ 14 o quilo\nBolo de cenoura: R$ 30\nCafé coado: R$ 6\nTorta de limão: R$ 38\n\nHorário: de segunda a sábado, das 7h às 19h.\nEncomendas pelo WhatsApp até as 16h do dia anterior.\n'

/** What the host's `reviewSummary` would send for a draft with one file of each kind (the per-file extras are the SW-6 shape). */
export const REVIEW_DEV_SUMMARY = {
  ticketId: REVIEW_DEV_TICKET_ID,
  files: [
    { path: 'Cardápio/2026/cardapio.md', added: 2, deleted: 1, kind: 'changed', before: MENU_BEFORE, after: MENU_AFTER },
    {
      path: 'Cardápio/2026/precos.xlsx', added: 0, deleted: 0, kind: 'changed',
      cells: [
        { sheet: 'Preços', cell: 'C4', before: 'R$ 12', after: 'R$ 14' },
        { sheet: 'Preços', cell: 'C9', before: 'R$ 36', after: 'R$ 38' },
      ],
    },
    { path: 'Marca/logo.png', added: 0, deleted: 0, kind: 'changed', beforeImage: svg('#e9dcf7', 'Antes'), afterImage: svg('#fbe3a8', 'Depois') },
    { path: 'Contratos/contrato.pdf', added: 0, deleted: 0, kind: 'new', canOpenDraft: true },
    { path: 'Promoções/promocao-de-natal.docx', added: 1, deleted: 1, kind: 'changed', before: 'Natal: 10% de desconto\n', after: 'Natal: 15% de desconto\n' },
  ],
  added: 3,
  deleted: 2,
  patch: '',
  patchTruncated: false,
  secretsRedacted: false,
  testsClaimed: [],
  hasWorktree: true,
} as unknown as ReviewSummaryView

/** The first Aplicar finds one file changed in the folder meanwhile (so the clash moment can be seen); the second succeeds. */
export function reviewDevAccept(call: number): ReviewAcceptView {
  if (call === 0) {
    const version = { hash: 'dev-hash', mode: '100644' as const }
    return {
      kind: 'blocked',
      mode: 'ff',
      explanation: 'A pasta mudou enquanto o rascunho era feito.',
      conflicts: [{ path: 'Promoções/promocao-de-natal.docx', user: version, persona: version }],
    }
  }
  return { kind: 'merged', mode: 'ff', explanation: '', restorePointId: 'dev-restore-point' }
}
