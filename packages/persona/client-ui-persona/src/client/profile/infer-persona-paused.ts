import type { PersonaNowKind } from '../primitives/index.ts'

/** Host marks intentional pause with offline + fixed copy (persona-card.ts nowLineOf). */
export function inferPersonaPaused(nowKind: PersonaNowKind, nowText: string): boolean {
  return nowKind === 'offline' && nowText === 'Offline'
}
