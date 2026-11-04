/**
 * What the Rotinas screen asks of the host (IV-9): a routine carries its request (`prompt`) and who does it
 * (`ownerPersonaId`), and can be created, updated, paused and deleted. The shapes are the host's own; the screen draws a
 * button only for what the connected host really has.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  CreateRoutineRequest,
  DeleteRoutineRequest,
  PauseRoutineRequest,
  RoutineScheduleView,
  RoutineView,
  UpdateRoutineRequest,
} from '@deepseek-ai/dsh-persona-host/types'

/** A schedule row as the host sends it. */
export type RoutineScheduleWire = RoutineScheduleView

export interface RoutineWire {
  createRoutine(request: CreateRoutineRequest): Promise<RemoteResult<RoutineView>>
  pauseRoutine(request: PauseRoutineRequest): Promise<RemoteResult<RoutineView>>
  updateRoutine?(request: UpdateRoutineRequest): Promise<RemoteResult<RoutineView>>
  deleteRoutine?(request: DeleteRoutineRequest): Promise<RemoteResult<boolean>>
}

/** The host needs a name; the person writes only the request, so the name is its first line, short. */
export function routineNameFromPrompt(prompt: string): string {
  const line = prompt.trim().replace(/\s+/gu, ' ')
  return line.length <= 60 ? line : `${line.slice(0, 57).trimEnd()}…`
}
