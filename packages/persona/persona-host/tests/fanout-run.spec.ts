import { expect, it } from 'vitest'
import { FAILED_EMPTY, FAILED_ERROR, runFanout, type FanoutLine } from '../src/fanout-run.ts'

/** CV-8: the fan-out runner (pure: the world is injected). */
interface P { readonly id: string; readonly name: string; readonly title: string }
const team: P[] = ['Nina', 'Bento', 'Mia', 'Leo', 'Ana'].map(name => ({ id: name.toLowerCase(), name, title: 'Cargo' }))
const open = { paused: false, limited: false }

function world(over: { gate?: (p: P) => { paused: boolean; limited: boolean; limitUntil?: string }; answer?: (p: P) => string | Error; pick?: string | Error } = {}) {
  const lines: FanoutLine<P>[] = []
  const asked: string[] = []
  let running = 0
  let widest = 0
  const deps = {
    gateOf: over.gate ?? (() => open),
    ask: async (persona: P): Promise<string> => {
      asked.push(persona.name)
      running += 1
      widest = Math.max(widest, running)
      await new Promise(resolve => setTimeout(resolve, 5))
      running -= 1
      const out = over.answer?.(persona) ?? `Resposta de ${persona.name}`
      if (out instanceof Error) throw out
      return out
    },
    ...(over.pick === undefined ? {} : {
      pick: async (): Promise<string> => { if (over.pick instanceof Error) throw over.pick; return over.pick as string },
    }),
    post: (line: FanoutLine<P>) => { lines.push(line) },
    concurrency: 2,
  }
  return { lines, asked, deps, widest: () => widest }
}

it('"Toda a equipe": every persona gets exactly ONE typed line; paused and limited make no call', async () => {
  const w = world({ gate: p => (p.name === 'Bento' ? { paused: true, limited: false } : p.name === 'Mia' ? { paused: false, limited: true, limitUntil: '2026-11-04T22:00:00.000Z' } : open) })
  const result = await runFanout({ fanoutId: 'f1', source: 'everyone', personas: team, message: 'Como estamos?', deps: w.deps })
  expect(result).toEqual({ total: 5, counts: { reply: 3, nothing: 0, limit: 1, paused: 1, failed: 0 }, calls: 3 })
  expect(w.asked.sort()).toEqual(['Ana', 'Leo', 'Nina']) // Bento (paused) and Mia (limit) were never asked
  expect(w.lines.map(l => l.persona.name).sort()).toEqual(['Ana', 'Bento', 'Leo', 'Mia', 'Nina']) // and still every one has a line
  expect(w.lines.find(l => l.persona.name === 'Mia')).toMatchObject({ kind: 'limit', until: '2026-11-04T22:00:00.000Z', total: 5 })
  expect(new Set(w.lines.map(l => l.index)).size).toBe(5)
})

it('the pool never runs more calls at once than its width (thirty personas ≠ thirty calls)', async () => {
  const many: P[] = Array.from({ length: 30 }, (_, i) => ({ id: `p${String(i)}`, name: `P${String(i)}`, title: 'Cargo' }))
  const w = world()
  const result = await runFanout({ fanoutId: 'f2', source: 'everyone', personas: many, message: 'oi', deps: w.deps })
  expect(result.calls).toBe(30)
  expect(w.lines).toHaveLength(30)
  expect(w.widest()).toBeLessThanOrEqual(2)
})

it('"nada a acrescentar" becomes its own kind; a failure or an empty answer is an honest `failed`, never silence', async () => {
  const w = world({ answer: p => (p.name === 'Nina' ? '[[nada]]' : p.name === 'Bento' ? new Error('o motor caiu') : p.name === 'Mia' ? '   ' : 'Tenho uma ideia.') })
  const result = await runFanout({ fanoutId: 'f3', source: 'everyone', personas: team, message: 'ideias?', deps: w.deps })
  expect(result.counts).toEqual({ reply: 2, nothing: 1, limit: 0, paused: 0, failed: 2 })
  expect(w.lines.find(l => l.persona.name === 'Bento')).toMatchObject({ kind: 'failed', message: FAILED_ERROR }) // never the raw error text 'o motor caiu'
  expect(w.lines.find(l => l.persona.name === 'Mia')).toMatchObject({ kind: 'failed', message: FAILED_EMPTY })
  expect(w.lines).toHaveLength(5)
})

it('"Quem tiver algo a dizer": ONE pick call, then only the picked (≤ 5) are asked; the block counts only them', async () => {
  const w = world({ pick: 'Nina, Mia, Fantasma' })
  const result = await runFanout({ fanoutId: 'f4', source: 'relevant', personas: team, message: 'quem cuida do site?', deps: w.deps, coordination: team[0]! })
  expect(result.total).toBe(2)
  expect(result.calls).toBe(3) // 1 pick + 2 answers
  expect(w.asked.sort()).toEqual(['Mia', 'Nina'])
  expect(w.lines.every(l => l.total === 2)).toBe(true)
})

it('nobody picked (or the pick failed): the Coordenação says so once, and nobody else is asked', async () => {
  for (const pick of ['NINGUÉM', new Error('caiu')]) {
    const w = world({ pick })
    const result = await runFanout({ fanoutId: 'f5', source: 'relevant', personas: team, message: 'algo?', deps: w.deps, coordination: team[0]! })
    expect(w.asked).toEqual([])
    expect(w.lines).toHaveLength(1)
    expect(w.lines[0]).toMatchObject({ kind: 'nothing', total: 1 })
    expect(result.total).toBe(1)
  }
})
