import { expect, it } from 'vitest'
import {
  ONBOARDING_TEMPLATE_IDS,
  TEAM_TEMPLATES,
  can,
  looksLikeCredential,
  teamTemplateById,
} from '../src/index.ts'
import type { Actor, PersonaSpec } from '../src/index.ts'

function actor(spec: PersonaSpec, id: string): Actor {
  return {
    kind: 'persona',
    id,
    workspaceId: 'ws',
    workspaceRole: 'member',
    projectIds: ['launch'],
    systemRoles: spec.systemRoles,
    canRecruit: spec.canRecruit,
  }
}

it('onboarding tem 8 modelos com Coordenação e Vigia, sem Atlas/Router, sem credencial', () => {
  expect(ONBOARDING_TEMPLATE_IDS).toHaveLength(8)
  for (const id of ONBOARDING_TEMPLATE_IDS) {
    const template = teamTemplateById(id)
    expect(template, id).toBeDefined()
    expect(template!.personas.length).toBeGreaterThanOrEqual(3)
    expect(template!.personas.length).toBeLessThanOrEqual(5)
    expect(template!.personas.filter(row => row.systemRoles.includes('coordination'))).toHaveLength(1)
    expect(template!.personas.filter(row => row.systemRoles.includes('watchdog'))).toHaveLength(1)
    expect(template!.personas.some(row => row.canRecruit)).toBe(true)
    expect(JSON.stringify(template)).not.toMatch(/\bAtlas\b/)
    expect(JSON.stringify(template)).not.toMatch(/\bRouter\b/)
    expect(looksLikeCredential(JSON.stringify(template))).toBe(false)
    for (const persona of template!.personas) {
      expect(persona.instructions.length).toBeGreaterThan(40)
      expect(persona.instructions).toMatch(/proponha|pergunt/i)
      expect(persona.limits.concurrency).toBe(1)
      expect(Object.values(persona.tools).every(level => level === 'read' || level === 'write' || level === 'none')).toBe(true)
      expect(persona.runner.kind).toBe('dsh')
    }
  }
})

it('todo modelo passa em can() e nos limites de orçamento', () => {
  for (const template of TEAM_TEMPLATES) {
    for (const [index, persona] of template.personas.entries()) {
      const who = actor(persona, `${template.id}-${String(index)}`)
      expect(can(who, 'read', { type: 'project', workspaceId: 'ws', projectId: 'launch' })).toBe(true)
      if (persona.systemRoles.includes('coordination')) {
        expect(can(who, 'decide', { type: 'channel', workspaceId: 'ws', projectId: 'launch' })).toBe(true)
        expect(can(who, 'recruit', { type: 'workspace', workspaceId: 'ws' })).toBe(true)
      }
      expect(persona.limits.tokensPerMonth === undefined || persona.limits.tokensPerMonth <= 50_000).toBe(true)
    }
  }
})

it('snapshot das instruções dos modelos de onboarding', () => {
  const snapshot = ONBOARDING_TEMPLATE_IDS.map((id) => {
    const template = teamTemplateById(id)!
    return {
      id,
      name: template.name,
      instructions: template.personas.map(row => ({ title: row.title, text: row.instructions })),
    }
  })
  expect(snapshot).toMatchSnapshot()
})
