/** Proactive initiative proposals (grouped daily per persona — PROACTIVITY.md §4–6). */

export type ProactiveProposalKind = 'initiative' | 'followUp' | 'risk'

export interface ProactiveCostEstimate {
  readonly tokens: number
  readonly runs: number
}

export interface ProactiveProposal {
  readonly id: string
  readonly kind: ProactiveProposalKind
  /** Host {@link ApprovalView.kind} for `decideApproval`. */
  readonly approvalKind?: 'hire' | 'vault' | 'skill'
  readonly title: string
  readonly oneQuestion: string
  /** Plain-language effect (not the proposer name alone). */
  readonly impactDetail: string
  readonly cost?: ProactiveCostEstimate
}

export interface PersonaDailyProactiveSummary {
  readonly personaId: string
  readonly personaName: string
  readonly summaryDate: string
  readonly personaCharacterId?: string
  readonly proposals: readonly ProactiveProposal[]
}

export const MOCK_PROACTIVE_SUMMARY_DATE = '2026-11-03'

export const MOCK_PERSONA_DAILY_SUMMARIES: readonly PersonaDailyProactiveSummary[] = [
  {
    personaId: 'persona-nina',
    personaName: 'Nina',
    personaCharacterId: 'nina',
    summaryDate: MOCK_PROACTIVE_SUMMARY_DATE,
    proposals: [
      {
        id: 'prop-nina-1',
        kind: 'initiative',
        title: 'Automatizar smoke do checkout',
        oneQuestion: 'Posso abrir um ticket e rodar o smoke no branch main?',
        impactDetail: 'Reduz risco de regressão no fluxo de pagamento; ~15 min de runner.',
        cost: { tokens: 12_000, runs: 1 },
      },
      {
        id: 'prop-nina-2',
        kind: 'risk',
        title: 'Dependência desatualizada no CRM',
        oneQuestion: 'Atualizo o pacote de datas e abro PR de teste?',
        impactDetail: 'Corrige CVE moderado; build pode precisar de ajuste em timezone.',
        cost: { tokens: 28_000, runs: 2 },
      },
    ],
  },
  {
    personaId: 'persona-atlas',
    personaName: 'Atlas',
    personaCharacterId: 'atlas',
    summaryDate: MOCK_PROACTIVE_SUMMARY_DATE,
    proposals: [
      {
        id: 'prop-atlas-1',
        kind: 'followUp',
        title: 'Desbloquear copy da landing',
        oneQuestion: 'Reatribuo a tarefa de hero para Sol com prazo de hoje?',
        impactDetail: 'Desbloqueia coluna “Em revisão” no Site da agência.',
        cost: { tokens: 4_000, runs: 0 },
      },
    ],
  },
]
