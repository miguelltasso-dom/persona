import type { RoutineRunView, RoutineScheduleView } from '@deepseek-ai/dsh-persona-host/types'
import type { QuietWindow, RoutineRun, RoutineRunResult } from '../../routines/mock-data.ts'
import { WEEK_DAYS } from '../../routines/mock-data.ts'

const DAY_BY_INDEX: Record<number, (typeof WEEK_DAYS)[number]> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}

function dayFromScheduled(iso: string): (typeof WEEK_DAYS)[number] {
  const day = new Date(iso).getDay()
  return DAY_BY_INDEX[day] ?? 'mon'
}

function timeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function resultFromStatus(status: RoutineRunView['status']): RoutineRunResult {
  switch (status) {
    case 'done': return 'ok'
    case 'failed': return 'failed'
    case 'cancelled': return 'skipped'
    default: return 'partial'
  }
}

/** Scheduler read-model → weekly grid rows. */
export function routineScheduleToRuns(schedules: readonly RoutineScheduleView[]): readonly RoutineRun[] {
  const runs: RoutineRun[] = []
  for (const schedule of schedules) {
    for (const run of schedule.runs) {
      runs.push({
        id: run.id,
        routineName: schedule.name,
        day: dayFromScheduled(run.scheduledFor),
        time: timeLabel(run.scheduledFor),
        result: resultFromStatus(run.status),
        summary: schedule.paused ? 'Rotina pausada' : run.status,
      })
    }
  }
  return runs
}

/** Silence windows from routine definitions (until dedicated quiet RPC in UI). */
export function routineScheduleToQuiet(schedules: readonly RoutineScheduleView[]): readonly QuietWindow[] {
  const seen = new Set<string>()
  const windows: QuietWindow[] = []
  for (const schedule of schedules) {
    if (schedule.silenceStart === '' && schedule.silenceEnd === '') continue
    const key = `${schedule.silenceStart}-${schedule.silenceEnd}`
    if (seen.has(key)) continue
    seen.add(key)
    windows.push({
      id: key,
      label: schedule.name,
      range: `${schedule.silenceStart} – ${schedule.silenceEnd}`,
    })
  }
  return windows
}
