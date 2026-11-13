/**
 * D-116 regra 1 (Tally): no computador da EQUIPE o motor e um VINCULO LOCAL, nunca a reescrita da ficha. Quem nao assina a ficha dela escolhe o motor e a ficha (e a assinatura) ficam como o criador assinou;
 * o executor le o motor EFETIVO (o vinculo local por cima do `runner` da ficha); quem assina a ficha escolhe como sempre (a ficha muda, o vinculo local velho cai).
 */
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { effectiveRunner, readEngineLocal, writeEngineLocal } from '../src/engine-local.ts'
import { teamConnectPorts } from '../src/team-connect-host.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['bia', 'Bia'], ['cris', 'Cris']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: id === 'bia' ? 'Coordenação' : 'Pesquisa', description: 'Ajuda.', personality: 'Calma.', instructions: 'Ajude.',
      avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', ...(id === 'bia' ? { systemRoles: ['coordination'] as const } : {}),
    })
  }
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }, { id: 'codex', kind: 'codex', phase: 'ready', available: true, loggedIn: true }] as never)
}

function ports(h: PersonaHost, ownSheet: (personaId: string) => boolean) {
  return teamConnectPorts({
    product: h.product, accounts: h.accounts, usage: h.usage, screens: h.screens.screens, orchestration: h.orchestration,
    connections: () => [], recheck: () => Promise.resolve([]), loginStatus: () => 'logged_out', ownSheet,
  })
}

it('ENG-0 (puro): sem vinculo o motor efetivo e o da ficha (a mesma referencia); com vinculo vale o motor local e o resto da ficha fica', () => {
  const sheet = { kind: 'cli', cli: 'claude', model: 'haiku', effort: 'high' }
  expect(effectiveRunner(sheet, undefined)).toBe(sheet)
  expect(effectiveRunner(sheet, { cli: 'codex', model: 'default', at: CLOCK })).toEqual({ kind: 'cli', cli: 'codex', model: 'default', effort: 'high' })
})

it('ENG-1 (regra 1): num computador que NAO assina a ficha, escolher o motor grava o vinculo local; a ficha nao muda e ninguem a reescreve', () => {
  const h = host()
  seed(h)
  const update = vi.spyOn(h.product, 'updatePersona')
  const before = h.product.getPersona('bia')!.runner
  ports(h, id => id !== 'bia').applyEngine('pp', 'bia', 'codex')
  expect(update).not.toHaveBeenCalled()
  expect(h.product.getPersona('bia')!.runner).toEqual(before) // a ficha assinada intacta
  expect(readEngineLocal(h.screens.screens, 'pp', 'bia')).toMatchObject({ cli: 'codex' })
  expect(ports(h, id => id !== 'bia').team('pp').find(row => row.id === 'bia')!.runner).toMatchObject({ kind: 'cli', cli: 'codex' }) // a tela mostra o motor que vale AQUI
})

it('ENG-2 (controle): quem assina a ficha escolhe como sempre: a ficha muda e um vinculo local velho cai', () => {
  const h = host()
  seed(h)
  writeEngineLocal(h.screens.screens, 'pp', 'cris', { cli: 'claude', model: 'haiku', at: CLOCK })
  const update = vi.spyOn(h.product, 'updatePersona')
  ports(h, () => true).applyEngine('pp', 'cris', 'codex')
  expect(update).toHaveBeenCalledTimes(1)
  expect(h.product.getPersona('cris')!.runner).toMatchObject({ kind: 'cli', cli: 'codex' })
  expect(readEngineLocal(h.screens.screens, 'pp', 'cris')).toBeUndefined()
})

async function settle(h: PersonaHost): Promise<void> {
  await h.orchestration.flush('pp')
  await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
  await h.orchestration.flush('pp')
}

async function engineOfTurn(h: PersonaHost): Promise<string[]> {
  const seen: string[] = []
  h.orchestration.runnerFactory = async (request) => {
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    if (request?.purpose === 'task' && request.spec.kind === 'cli') seen.push(request.spec.cli)
    return createFakeRunner()
  }
  h.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Monte o cardápio da semana com preços', actorId: 'ana', subjectId: 's-m1', occurredAt: CLOCK })
  await settle(h)
  return seen
}

it('ENG-3 (executor): o turno da persona roda no motor EFETIVO: com o vinculo local, o dele', async () => {
  const h = host()
  seed(h)
  for (const id of ['bia', 'cris']) writeEngineLocal(h.screens.screens, 'pp', id, { cli: 'codex', model: 'default', at: CLOCK }) // a Tarefa pode cair em qualquer uma das duas
  const seen = await engineOfTurn(h)
  expect(seen.length).toBeGreaterThan(0)
  expect(new Set(seen)).toEqual(new Set(['codex']))
})

it('ENG-4 (controle): sem vinculo local o turno roda no motor da ficha', async () => {
  const h = host()
  seed(h)
  const seen = await engineOfTurn(h)
  expect(seen.length).toBeGreaterThan(0)
  expect(new Set(seen)).toEqual(new Set(['claude']))
})
