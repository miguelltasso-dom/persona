import { MOCK_CHANNEL_ROSTER } from '../team/mock-channel-roster.ts'
import type { AwaySummaryEvent, PersonaNowSnapshot } from '../team/persona-work-state.ts'

/** Mock “Agora” rows until host streams persona activity (PROACTIVITY §7). */
export const MOCK_OVERVIEW_NOW: readonly PersonaNowSnapshot[] = [
  {
    member: MOCK_CHANNEL_ROSTER[0]!,
    currentTask: 'Distribuir tarefas do sprint de proatividade',
    queueCount: 2,
  },
  {
    member: MOCK_CHANNEL_ROSTER[1]!,
    currentTask: 'Implementar faixa Agora na Visão geral',
    queueCount: 1,
  },
  {
    member: MOCK_CHANNEL_ROSTER[2]!,
    currentTask: 'Revisão de cláusulas de contratação',
    queueCount: 0,
  },
  {
    member: MOCK_CHANNEL_ROSTER[3]!,
    queueCount: 0,
  },
  {
    member: MOCK_CHANNEL_ROSTER[4]!,
    queueCount: 0,
  },
]

export const MOCK_AWAY_SUMMARY: readonly AwaySummaryEvent[] = [
  {
    id: 'away-1',
    bodyKey: 'overview.awayEvent1Body',
    taskLabelKey: 'overview.awayEvent1Task',
  },
  {
    id: 'away-2',
    bodyKey: 'overview.awayEvent2Body',
    taskLabelKey: 'overview.awayEvent2Task',
  },
  {
    id: 'away-3',
    bodyKey: 'overview.awayEvent3Body',
    taskLabelKey: 'overview.awayEvent3Task',
  },
]
