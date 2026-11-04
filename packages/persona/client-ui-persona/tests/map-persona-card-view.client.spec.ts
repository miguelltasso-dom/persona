import { describe, expect, it } from 'vitest'
import { personaCardViewToInfo } from '../src/client/profile/map-persona-card-view.ts'
import type { PersonaCardView } from '@deepseek-ai/dsh-persona-host/types'

const CARD: PersonaCardView = {
  personaId: 'dev',
  handle: '@ada',
  name: 'Ada',
  title: 'Dev',
  systemRoles: [],
  nowKind: 'working',
  nowText: 'Revisando o PR',
  presence: { online: true, lastActiveAt: '2026-11-03T12:00:00Z' },
  engine: { runnerLabel: 'Claude', modelLabel: 'Sonnet' },
  sectorName: 'Engenharia',
  ownerName: 'Você',
  currentProjectName: 'Site da agência',
}

describe('personaCardViewToInfo', () => {
  it('maps sector, charge and project from host card', () => {
    const info = personaCardViewToInfo(CARD)
    expect(info.sector).toBe('Engenharia')
    expect(info.projectName).toBe('Site da agência')
    expect(info.engineLabel).toContain('Sonnet')
  })

  it('maps active account seat on the persona card', () => {
    const info = personaCardViewToInfo({
      ...CARD,
      activeAccount: { provider: 'claude', label: 'Trabalho' },
    })
    expect(info.activeAccountLabel).toBe('Claude · Trabalho')
  })

  it('maps gestorAuditReason when present on host card (GES-5)', () => {
    const info = personaCardViewToInfo({
      ...CARD,
      systemRoles: ['team_manager'],
      gestorAuditReason: 'Alocou Nina no Site e criou 2 tarefas',
    })
    expect(info.gestorAuditReason).toBe('Alocou Nina no Site e criou 2 tarefas')
  })
})
