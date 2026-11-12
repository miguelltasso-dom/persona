import { describe, expect, it } from 'vitest'
import { blockedSummary, chainOf, downstreamIds, failureLine, type SplitNext } from '../src/split-chain.ts'

/**
 * D100-1 (item 1, the part in front of the chain did NOT deliver): the pure words and the walk of the chain. The host behavior (blocked parts, ONE honest line, restart by
 * itself in order) is in `acceptance-item1-falhas-red.host.spec.ts`.
 */
describe('the chain when the first part fails', () => {
  const nexts: Record<string, SplitNext> = {
    'split:m1:bia': { nextId: 'split:m1:teo', nextPersonaId: 'teo' },
    'split:m1:teo': { nextId: 'split:m1:caio', nextPersonaId: 'caio' },
  }
  const nextOf = (id: string): SplitNext | undefined => nexts[id]

  it('downstreamIds: every part that depends on it, in chain order; none for the last part or a part outside the chain', () => {
    expect(downstreamIds('split:m1:bia', nextOf)).toEqual(['split:m1:teo', 'split:m1:caio'])
    expect(downstreamIds('split:m1:teo', nextOf)).toEqual(['split:m1:caio'])
    expect(downstreamIds('split:m1:caio', nextOf)).toEqual([])
    expect(downstreamIds('split:m1:ana', nextOf)).toEqual([])
  })

  it('downstreamIds never loops, whatever the links say', () => {
    const loop: Record<string, SplitNext> = { a: { nextId: 'b', nextPersonaId: 'b' }, b: { nextId: 'a', nextPersonaId: 'a' } }
    expect(downstreamIds('a', id => loop[id])).toEqual(['b']) // it stops when the walk comes back to where it started
  })

  it('the card of a blocked part names who is missing, in plain words', () => {
    expect(blockedSummary('Bia', 'texto')).toBe('Esperando Bia: texto não saiu. Peça de novo e esta parte segue sozinha.')
  })

  it('the ONE line of the owner: what did not come out, what waits for it and what to do — plural and singular, nothing technical', () => {
    const two = failureLine({ name: 'Bia', label: 'texto' }, [{ name: 'Teo', label: 'arte' }, { name: 'Caio', label: 'posts' }])
    expect(two).toBe('Bia não conseguiu entregar a parte dela (texto), então a parte de Teo (arte) e Caio (posts) ficam esperando. Peça texto de novo e elas seguem sozinhas.')
    const one = failureLine({ name: 'Teo', label: 'arte' }, [{ name: 'Caio', label: 'posts' }])
    expect(one).toBe('Teo não conseguiu entregar a parte dela (arte), então a parte de Caio (posts) fica esperando. Peça arte de novo e ela segue sozinha.')
    expect(`${two} ${one}`).not.toMatch(/blocked|waiting|ticket|split|handoff|motor|erro/iu)
  })

  it('when the PERSON stopped the part, the words say so and never promise that the others go on by themselves (a stopped part is over)', () => {
    const line = failureLine({ name: 'Bia', label: 'texto' }, [{ name: 'Teo', label: 'arte' }, { name: 'Caio', label: 'posts' }], 'stopped')
    expect(line).toBe('Você parou a parte de Bia (texto), então a parte de Teo (arte) e Caio (posts) ficam esperando. Se ainda quiser, peça texto de novo ou pare essas partes.')
    expect(line).not.toMatch(/seguem sozinhas|conseguiu/u)
    expect(blockedSummary('Bia', 'texto', 'stopped')).toBe('Esperando Bia: texto foi parado. Peça de novo ou pare esta parte.')
  })

  it('a paused persona is out of the chain, so the walk starts from the next live part', () => {
    const links = chainOf([
      { personaId: 'bia', cues: ['texto'], paused: true },
      { personaId: 'teo', cues: ['arte'], paused: false },
      { personaId: 'caio', cues: ['posts'], paused: false },
    ])
    expect(links).toEqual([{ personaId: 'caio', afterPersonaId: 'teo' }])
  })
})
