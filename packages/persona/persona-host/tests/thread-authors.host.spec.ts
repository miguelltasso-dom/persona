/**
 * Muse (bundle 3, "Um dia da equipe" in the app): in a request done in parts WITH its plan card, what each persona says when she finishes her part is a
 * STATE the cards carry (the plan card per part, the delivery card at the end) — it is typed as a state line and the thread does not show it twice — and
 * NO line may reach the client without an author a person can name: every item of the thread is written by a member or by a persona.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const GOAL = 'Monte um time para a campanha de Natal: texto, arte e posts'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  const make = (id: string, name: string, title: string, description: string, roles: readonly ('coordination' | 'team_manager')[] = []) => h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id, name, title, description, personality: 'Clara.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    ...(roles.length === 0 ? {} : { systemRoles: roles }),
  })
  make('atlas', 'Atlas', 'Coordenação', 'Coordena.', ['coordination', 'team_manager'])
  make('bia', 'Bia', 'Redação', 'Escreve textos e legendas.')
  make('teo', 'Teo', 'Design', 'Cria artes, cartazes e identidade visual.')
  make('caio', 'Caio', 'Mídia social', 'Cuida de posts e redes sociais.')
}

const thread = (h: PersonaHost) => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

it('a campaign done in parts: every line has an author a person can name, and the words each persona said finishing her part are absorbed by the cards (typed state lines)', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  try {
    script(h, ['Texto da campanha pronto.', 'Arte final dos posts pronta.', 'Posts da campanha prontos.'])
    h.proposeGestorAssemble({ ...scope, gestorId: 'atlas', id: 'campanha', goal: GOAL })
    h.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha' })
    await settle(h)
    const known = new Set<string>()
    for (const member of h.product.listMembers('ws')) known.add(member.id)
    for (const persona of [...h.product.listPersonas('pp'), ...h.product.listRetiredPersonas('pp')]) known.add(persona.id)
    const lines = thread(h)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(known.has(line.actorId), `author "${line.actorId}" of "${line.body.slice(0, 40)}"`).toBe(true)
    // the plan card exists and the cards stand for the parts: what each persona said on finishing is a state, not a second telling
    expect(lines.some(line => line.teamPlan !== undefined || line.deliveryCard !== undefined)).toBe(true)
    for (const said of ['Texto da campanha pronto.', 'Arte final dos posts pronta.', 'Posts da campanha prontos.']) {
      expect(lines.filter(line => line.body === said), `"${said}" must not be a line of its own next to the cards`).toEqual([])
    }
  } finally {
    h.teamworkEnabled = false
  }
})
