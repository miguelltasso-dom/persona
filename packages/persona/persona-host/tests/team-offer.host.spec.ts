import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { TEAM_GUIDANCE_CORE } from '../src/harness-team.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * D-097 (Atlas/Keel 05/11), found by the first REAL round of the team (TEAM-10, attempt 1): (1) the worker was handed the TITLE (cut at ~80 letters, "… da Padaria
 * Lua e…"), never the person's whole message; (2) the personas the product creates have NO file/shell grant (`tools: {}`), and a persona with no grant was
 * offered no tool at all — not even `persona_ask`; (3) the team tools were offered by the words of the request ("peça à Lia"), which a real person never writes.
 * Now: the worker gets the WHOLE request; every persona coordinates (asks the person, a colleague, the team's opinion, passes work on) whatever her grant, and
 * ONLY that; the team tools are offered to every Task of a project with colleagues, by the host's rule.
 */

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Arte' },
]
const COORDINATION = ['ask_colleague', 'ask_team_opinion', 'pass_forward', 'persona_ask']

function rig(team: typeof TEAM = TEAM): PersonaHost {
  const before = process.env.PERSONA_PRODUCT_TOOLS
  process.env.PERSONA_PRODUCT_TOOLS = '1' // the product tools are OFF under Vitest unless asked
  onTestFinished(() => { if (before === undefined) delete process.env.PERSONA_PRODUCT_TOOLS; else process.env.PERSONA_PRODUCT_TOOLS = before })
  const h = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(h, team)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  // what the product creates: persona on a CLI with NO file/shell grant (`tools: {}`)
  for (const row of team) {
    const persona = h.product.getPersona(row.id)!
    h.product.updatePersona({ ...persona, runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, tools: {} }, 'pp')
  }
  return h
}

/** What the opener of the host hands one turn of Bia's Task, like the CLI's session runner asks for it. */
function offered(h: PersonaHost, ticketId: string): string[] {
  const persona = h.product.getPersona('bia')!
  const set = h.orchestration.productToolsOf?.(persona, 'pp')?.({ personaId: 'bia', ticketId, assignmentId: 'a1', cwd: '.' })
  const names = (set?.tools ?? []).map(tool => tool.name).sort()
  void set?.close?.()
  return names
}

const LONG = 'Faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram, com o preço do pão de queijo em destaque e o endereço da loja embaixo'
const ticketOf = (h: PersonaHost, name: string) => h.orchestration.runtime('pp').repo.tickets.list().find(item => item.execution?.name === name)

it('a natural, long request reaches the worker WHOLE (the title stays short, for the screen) — no ellipsis, nothing cut', async () => {
  const h = rig()
  say(h, 'u1', `@Bia ${LONG}`)
  await h.orchestration.flush('pp')
  const turn = h.orchestration.turnInputs.find(row => row.personaId === 'bia')
  expect(turn?.purpose).toBe('task')
  expect(turn?.prompt).toContain(LONG) // the whole message, literally
  expect(turn?.prompt).not.toMatch(/…/u)
  const ticket = ticketOf(h, 'Bia')!
  expect(LONG.length).toBeGreaterThan(120)
  expect(ticket.title.length).toBeLessThanOrEqual(80) // the screen's title is short
  expect(ticket.execution?.assignment).toContain(LONG)
})

it('a persona with NO file/shell grant (tools {}) is offered persona_ask and the three team tools, and NOT ONE tool that writes, whatever the words say', async () => {
  const h = rig()
  say(h, 'u1', '@Bia Mova o cartão do cardápio para Fazendo, crie uma rotina todo dia às 8h e contrate uma nova persona de design')
  await h.orchestration.flush('pp')
  const bia = ticketOf(h, 'Bia')!
  expect(offered(h, bia.id)).toEqual(COORDINATION) // the board, the routines and the hiring answer to the grant: none here
  // …and a persona WITH a write grant keeps what the words ask for, plus the same coordination tools
  h.product.updatePersona({ ...h.product.getPersona('bia')!, tools: { bash: 'write' } }, 'pp')
  const withGrant = offered(h, bia.id)
  expect(withGrant).toEqual(expect.arrayContaining([...COORDINATION, 'board_card_move', 'routine_create', 'persona_hire']))
})

it('a natural request offers the team tools (no keyword), and the turn the host records carries the full prompt, the tools and the paragraph about the team', async () => {
  const h = rig()
  say(h, 'u1', `@Bia ${LONG}`)
  await h.orchestration.flush('pp')
  const turn = h.orchestration.turnInputs.find(row => row.personaId === 'bia')!
  expect(turn.toolNames.sort()).toEqual(COORDINATION)
  expect(turn.prompt).toContain(TEAM_GUIDANCE_CORE)
})

it('the persona\'s own switch "Pode pedir ajuda a colegas" off: persona_ask stays, no team tool and no paragraph', async () => {
  const h = rig()
  h.teamwork.set('pp', { ...SCOPE, personaId: 'bia', canAskColleagues: false })
  say(h, 'u1', `@Bia ${LONG}`)
  await h.orchestration.flush('pp')
  const turn = h.orchestration.turnInputs.find(row => row.personaId === 'bia')!
  expect(turn.toolNames).toEqual(['persona_ask'])
  expect(turn.prompt).not.toContain(TEAM_GUIDANCE_CORE)
  expect(offered(h, ticketOf(h, 'Bia')!.id)).toEqual(['persona_ask'])
})

it('a project without colleagues offers no team tool; with the team switch off neither', async () => {
  const alone = rig([{ id: 'bia', name: 'Bia', title: 'Redação' }])
  say(alone, 'u1', `@Bia ${LONG}`)
  await alone.orchestration.flush('pp')
  expect(alone.orchestration.turnInputs.find(row => row.personaId === 'bia')?.toolNames).toEqual(['persona_ask'])
  expect(alone.orchestration.turnInputs.find(row => row.personaId === 'bia')?.prompt).not.toContain(TEAM_GUIDANCE_CORE)

  const off = rig()
  off.teamworkEnabled = false
  say(off, 'u1', `@Bia ${LONG}`)
  await off.orchestration.flush('pp')
  const turn = off.orchestration.turnInputs.find(row => row.personaId === 'bia')!
  expect(turn.toolNames).toEqual(['persona_ask'])
  expect(turn.prompt).not.toContain(TEAM_GUIDANCE_CORE)
})
