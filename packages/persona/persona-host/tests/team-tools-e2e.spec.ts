import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * End to end through the REAL gateway of the host (the one the live CLI uses): the Task's words decide which team tools are OFFERED, the
 * CLI-like turn calls them through the lease the host opens (`productToolsOf`), and the effect is real — the colleague's Task with the
 * bilhete, the asker waiting, the typed lines, the round of opinion. The transport itself (Claude, Codex) is proved by the Rivet's spikes.
 */

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]

function rig(): PersonaHost {
  const before = process.env.PERSONA_PRODUCT_TOOLS
  process.env.PERSONA_PRODUCT_TOOLS = '1' // the product tools are OFF under Vitest unless asked
  onTestFinished(() => { if (before === undefined) delete process.env.PERSONA_PRODUCT_TOOLS; else process.env.PERSONA_PRODUCT_TOOLS = before })
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  for (const id of ['bia', 'teo', 'caio']) h.product.updatePersona({ ...h.product.getPersona(id)!, tools: { bash: 'write' } }, 'pp') // a CLI worker with a write grant
  return h
}

interface Seen { offered: string[]; said: Record<string, Record<string, unknown>> }

/** Bia's turn, like a CLI's: opens the lease the host opens, lists what was offered, calls the tools in `calls` (name → args). */
function biaTurn(h: PersonaHost, calls: Record<string, Record<string, unknown>>): Seen {
  const seen: Seen = { offered: [], said: {} }
  const inner = createFakeRunner()
  let first = true
  const runner: Runner = {
    ensureSession: (...args) => inner.ensureSession(...args),
    deliver: async (session, request, text, mode) => {
      if (first) {
        first = false
        const persona = h.product.getPersona('bia')!
        const set = h.orchestration.productToolsOf?.(persona, 'pp')?.({ personaId: 'bia', ticketId: session.replace(/^worker-/u, ''), assignmentId: request, cwd: '.' })
        seen.offered = (set?.tools ?? []).map(tool => tool.name).sort()
        for (const [name, args] of Object.entries(calls)) {
          const tool = set?.tools.find(item => item.name === name)
          if (tool !== undefined) seen.said[name] = JSON.parse((await tool.handler(args)).content) as Record<string, unknown>
        }
        await set?.close?.()
      }
      await inner.deliver(session, request, text, mode)
    },
    cancel: (...args) => inner.cancel(...args),
    status: id => inner.status(id),
    whenIdle: id => inner.whenIdle(id),
    onEvent: listener => inner.onEvent(listener),
    capabilities: () => inner.capabilities(),
  }
  h.orchestration.warmRunners.set('pp:bia:task', runner)
  return seen
}

const tickets = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string) => tickets(h).find(item => item.execution?.name === name)

it('a request that only asks for work is offered persona_ask AND the three team tools: no keyword needed (D-097)', async () => {
  const h = rig()
  const seen = biaTurn(h, {})
  say(h, 'u1', '@Bia Faça o relatório do dia')
  await h.orchestration.flush('pp')
  expect(seen.offered).toEqual(['ask_colleague', 'ask_team_opinion', 'pass_forward', 'persona_ask'])
})

it('"…e depois passe ao Teo": pass_forward is offered; calling it opens Teo\'s Task with the bilhete and Bia does NOT wait', async () => {
  const h = rig()
  const seen = biaTurn(h, { pass_forward: { colleague: 'Teo', title: 'Arte dos 3 posts', done: ['Texto dos 3 posts pronto'], needed: ['Uma arte por post'], decisions: ['Tom leve'] } })
  say(h, 'u1', '@Bia Escreva os 3 posts da campanha e depois passe ao Teo para a arte')
  await h.orchestration.flush('pp')
  expect(seen.offered).toContain('pass_forward')
  expect(seen.said.pass_forward).toMatchObject({ ok: true })
  const teo = ticketOf(h, 'Teo')
  expect(teo, "Teo's Task").toBeDefined()
  expect(teo?.title).toBe('Arte dos 3 posts')
  expect(teo?.mandate.actor.id).toBe('ana') // the colleague carries the PERSON's scope, never more
  expect(h.events.listProject('pp').some(row => row.type === 'handoff' && row.body.includes('Arte dos 3 posts'))).toBe(true) // ONE typed line
})

it('"peça ao Caio a paleta": ask_colleague is offered; Caio gets a Task, Bia WAITS for what he delivers', async () => {
  const h = rig()
  const seen = biaTurn(h, { ask_colleague: { colleague: 'Caio', title: 'Paleta e formatos de cada rede', needed: ['A paleta da marca'] } })
  say(h, 'u1', '@Bia Faça o texto do cartaz e peça ao Caio a paleta')
  await h.orchestration.flush('pp')
  expect(seen.offered).toContain('ask_colleague')
  expect(seen.said.ask_colleague).toMatchObject({ ok: true })
  expect(ticketOf(h, 'Caio')?.title).toBe('Paleta e formatos de cada rede')
  const bia = ticketOf(h, 'Bia')
  expect(bia).toBeDefined()
  expect(h.handoffs.waitingLine('pp', bia!.id) ?? '').toMatch(/Caio/u) // her Task waits for him (no “Pronto” for her)
})

it('the colleague must exist and not be herself: a refusal is a sentence with the way forward, and nothing is opened', async () => {
  const h = rig()
  const seen = biaTurn(h, { ask_colleague: { colleague: 'Fantasma', title: 'Algo' }, pass_forward: { colleague: 'Bia', title: 'Eu mesma' } })
  say(h, 'u1', '@Bia Faça o texto e peça ao Teo a arte, depois passe ao Caio')
  await h.orchestration.flush('pp')
  expect(seen.said.ask_colleague).toMatchObject({ ok: false })
  expect(seen.said.pass_forward).toMatchObject({ ok: false })
  expect(tickets(h).filter(item => item.execution?.name !== 'Bia')).toHaveLength(0)
})

it('"veja a opinião da equipe": ask_team_opinion is offered; a round runs and the lines reach the thread (the asker needs autonomy `act`)', async () => {
  const h = rig()
  h.setAutonomy({ ...SCOPE, personaId: 'bia', mode: 'act', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
  const seen = biaTurn(h, { ask_team_opinion: { question: 'O que acham deste texto?', draft: { text: 'Compre hoje e leve dois.' } } })
  say(h, 'u1', '@Bia Escreva o texto do cartaz e veja a opinião da equipe')
  await h.orchestration.flush('pp')
  expect(seen.offered).toContain('ask_team_opinion')
  expect(seen.said.ask_team_opinion).toMatchObject({ ok: true })
  const lines = h.events.listProject('pp').filter(row => row.id.startsWith('opinion:'))
  expect(lines.some(row => row.id.endsWith(':request') && row.actorId === 'bia')).toBe(true)
  expect(lines.filter(row => row.id.includes(':reply:')).length).toBeGreaterThanOrEqual(1)
  expect(lines.some(row => row.id.endsWith(':consolidated'))).toBe(true)
})
