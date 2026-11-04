import { describe, expect, it } from 'vitest'
import { personaCardFromHost } from '../src/client/profile/map-persona-card-from-host.ts'
import type { PersonaCardHostDto } from '../src/client/profile/persona-card-host-dto.ts'

const sample: PersonaCardHostDto = {
  personaId: 'dev',
  handle: 'bento',
  name: 'Bento',
  title: 'Engenharia',
  systemRoles: ['coordination'],
  nowKind: 'resting',
  nowText: 'Descansando — nada na fila',
  presence: { online: true, lastActiveAt: '2026-11-03T00:00:00.000Z' },
  engine: { runnerLabel: 'claude', modelLabel: 'haiku' },
  sectorName: 'Produto',
  ownerName: 'Ana',
  currentProjectName: 'Time',
  quota: { fiveHourPct: 42 },
}

describe('personaCardFromHost', () => {
  it('maps host card into PersonaCardInfo', () => {
    const info = personaCardFromHost(sample, 'bento')
    expect(info.personaId).toBe('dev')
    expect(info.handle).toBe('@bento')
    expect(info.role).toBe('Engenharia')
    expect(info.sector).toBe('Produto')
    expect(info.characterId).toBe('bento')
    expect(info.engineLabel).toBe('Claude · Haiku')
    expect(info.quota?.fiveHourPct).toBe(42)
    expect(info.presence).toBe('online')
  })
})
