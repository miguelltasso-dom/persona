export type RoutineRunResult = 'ok' | 'partial' | 'failed' | 'skipped'

export interface RoutineRun {
  readonly id: string
  readonly routineName: string
  readonly day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  readonly time: string
  readonly result: RoutineRunResult
  readonly summary: string
}

export interface QuietWindow {
  readonly id: string
  readonly label: string
  readonly range: string
}

export const MOCK_ROUTINE_RUNS: readonly RoutineRun[] = [
  { id: 'run1', routineName: 'Stand-up Atlas', day: 'mon', time: '09:00', result: 'ok', summary: '3 tarefas desbloqueadas' },
  { id: 'run2', routineName: 'Varredura de PRs', day: 'wed', time: '18:00', result: 'partial', summary: '2 PRs revisados, 1 pendente' },
  { id: 'run3', routineName: 'Relatório semanal', day: 'fri', time: '17:00', result: 'failed', summary: 'CLI Codex offline' },
  { id: 'run4', routineName: 'Backup Cofre', day: 'sun', time: '22:00', result: 'skipped', summary: 'Janela de silêncio' },
]

export const MOCK_QUIET_WINDOWS: readonly QuietWindow[] = [
  { id: 'q1', label: 'Noites de semana', range: '22:00 – 07:00' },
  { id: 'q2', label: 'Domingo', range: '00:00 – 12:00' },
]

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
