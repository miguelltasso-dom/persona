import { usableTaskTitle } from './task-title.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot } from '../team/persona-work-state.ts'

/**
 * CV-2: "trabalhando em «tarefa»" no cabeçalho da DM. Só com a persona trabalhando e com o TÍTULO real da tarefa
 * (nunca um id): sem isso, o cabeçalho mostra só a função.
 */
export function workingOnFor(rows: readonly PersonaNowSnapshot[], member: ChannelPersonaMember): string | undefined {
  if (member.state !== 'working') return undefined
  const row = rows.find(candidate => candidate.member.id === member.id && candidate.member.name === member.name)
    ?? rows.find(candidate => candidate.member.name === member.name)
  return usableTaskTitle(row?.currentTask)
}
