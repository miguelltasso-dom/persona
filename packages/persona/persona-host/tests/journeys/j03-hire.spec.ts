import { expect } from 'vitest'
import { SCOPE, openJourney, seedJourney, it } from './journey-host.ts'

it('J3 — três Contratar? em cadeia, sem escalar acesso, só depois da aprovação', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true }])
  const names = ['Sol', 'Nara', 'Pico']
  for (const [index, name] of names.entries()) {
    const id = `ap-${name.toLowerCase()}`
    const card = h.proposeHire({
      ...SCOPE, id, creatorPersonaId: 'coord', name, title: 'Suporte', description: 'Atende.',
    })
    expect(card.status).toBe('pending')
    expect(card.kind).toBe('hire')
    expect(h.listPersonas(SCOPE).some(item => item.name === name)).toBe(false)
    expect(h.decideApproval({ ...SCOPE, id, kind: 'hire', accept: true }).status).toBe('approved')
    const hired = h.listPersonas(SCOPE).find(item => item.name === name)
    expect(hired).toBeDefined()
    expect(hired!.canRecruit).toBe(false)
    const stored = h.product.getPersona(hired!.id)!
    expect(stored.tools).toEqual({})
    expect(JSON.stringify(stored)).not.toMatch(/sk-|ghp_|Bearer /)
    expect(index).toBeLessThan(3)
  }
  expect(h.listPersonas(SCOPE).filter(item => names.includes(item.name))).toHaveLength(3)
})
