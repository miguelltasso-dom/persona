import type { ProjectBoardSummary } from './types.ts'

/** Preview / Muse captures: Contratação + Site (BOARDS-SPEC §7). */
export const MOCK_PROJECT_BOARD_SUMMARIES: readonly ProjectBoardSummary[] = [
  {
    id: 'proj-contratacao',
    name: 'Contratação — Designer',
    flowModel: 'contratacao',
    counts: { todo: 3, doing: 2, review: 1, needs_you: 1, done: 4, blocked: 0 },
    needsYouCount: 1,
    sprintLabel: 'Sprint 3 · faltam 4 dias',
    activeWorkers: [
      { name: 'Atlas', state: 'working' },
      { name: 'Nina', state: 'waiting' },
      { name: 'Bento', state: 'resting' },
    ],
  },
  {
    id: 'proj-site',
    name: 'Site da agência',
    flowModel: 'site',
    counts: { todo: 2, doing: 3, review: 2, needs_you: 0, done: 6, blocked: 0 },
    needsYouCount: 0,
    sprintLabel: 'Fase Descoberta · faltam 9 dias',
    activeWorkers: [
      { name: 'Sol', state: 'working' },
      { name: 'Luna', state: 'working' },
    ],
  },
]
