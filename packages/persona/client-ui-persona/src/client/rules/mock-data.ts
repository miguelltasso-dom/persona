export interface TriageRule {
  readonly id: string
  readonly gateText: string
  readonly assessmentText: string
  readonly logOnly: boolean
  readonly speculativeEnabled: boolean
}

export interface TriageSimulationLog {
  readonly id: string
  readonly at: string
  readonly summary: string
}

export const MOCK_TRIAGE_RULES: readonly TriageRule[] = [
  {
    id: 'rule-1',
    gateText: 'Só @Atlas ou membros admin podem pedir deploy em produção.',
    assessmentText: 'Se for staging, preparar checklist; se for produção, pedir confirmação humana.',
    logOnly: true,
    speculativeEnabled: false,
  },
]

export const MOCK_TRIAGE_LOG: readonly TriageSimulationLog[] = [
  { id: 'log-1', at: '13:58', summary: 'Teria aberto ticket de revisão para copy (não executou).' },
]
