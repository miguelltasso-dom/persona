import { expect, it } from 'vitest'
import { can } from '../src/index.ts'
import type { AclAction, AclResource, Actor } from '../src/index.ts'

/**
 * Marco dogfood M3 (Tally, ACL por projeto): "uma responsavel nao mexe no quadro da outra". Uma persona pertence a UM projeto, e a Coordenacao e unica POR PROJETO (a responsavel do quadro dele). O core dizia
 * `hasRole(actor, 'coordination')` para ler/escrever/criar/decidir um cartao, escrever a rotina e decidir no canal SEM olhar o projeto: a responsavel de A mexia no quadro de B. O papel vale no projeto dela.
 * O vigia (watchdog) continua LENDO entre projetos (um alarme, nao um ator); quem recebeu o cartao fica com ele; o dono nao e cercado.
 */
const coordA: Actor = { kind: 'persona', id: 'lia-a', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['A'], systemRoles: ['coordination'], canRecruit: true }
const watch: Actor = { kind: 'persona', id: 'watch', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['A'], systemRoles: ['watchdog'] }
const worker: Actor = { kind: 'persona', id: 'bento', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['A'] }
const owner: Actor = { kind: 'user', id: 'miguel', workspaceId: 'ws', workspaceRole: 'owner', projectIds: ['A', 'B'] }

const ticket = (projectId: string, assigneeId?: string): AclResource => ({ type: 'ticket', workspaceId: 'ws', projectId, ...(assigneeId === undefined ? {} : { assigneeId }) })
const TICKET_ACTIONS: readonly AclAction[] = ['read', 'follow', 'write', 'create', 'decide']

it('a responsavel (coordenacao) do projeto A conduz o quadro de A e NADA do quadro de B', () => {
  for (const action of TICKET_ACTIONS) {
    expect(can(coordA, action, ticket('A', 'nina')), `A: ${action}`).toBe(true)
    expect(can(coordA, action, ticket('B', 'nina')), `B: ${action}`).toBe(false)
  }
})

it('o vigia le entre projetos (e um alarme) mas nunca escreve nem decide em projeto que nao e o dela', () => {
  expect(can(watch, 'read', ticket('B'))).toBe(true)
  for (const action of ['write', 'create', 'decide'] as const) expect(can(watch, action, ticket('B')), action).toBe(false)
})

it('quem recebeu o cartao fica com ele onde ele estiver; um par nao ganha o cartao do outro', () => {
  expect(can(worker, 'write', ticket('B', 'bento'))).toBe(true)
  expect(can(worker, 'write', ticket('B', 'nina'))).toBe(false)
  expect(can(worker, 'read', ticket('B', 'nina'))).toBe(false)
})

it('o dono nao e cercado no quadro (ler, seguir, escrever, criar, apagar)', () => {
  for (const action of ['read', 'follow', 'write', 'create', 'delete'] as const) expect(can(owner, action, ticket('B', 'nina')), action).toBe(true)
})

it('a decisao no canal e a rotina tambem sao do projeto da responsavel', () => {
  expect(can(coordA, 'decide', { type: 'channel', workspaceId: 'ws', projectId: 'A' })).toBe(true)
  expect(can(coordA, 'decide', { type: 'channel', workspaceId: 'ws', projectId: 'B' })).toBe(false)
  for (const action of ['write', 'create', 'delete'] as const) {
    expect(can(coordA, action, { type: 'routine', workspaceId: 'ws', projectId: 'A' }), `routine A ${action}`).toBe(true)
    expect(can(coordA, action, { type: 'routine', workspaceId: 'ws', projectId: 'B' }), `routine B ${action}`).toBe(false)
  }
})

it('o cofre: a regra da casa de um projeto so quem esta nele escreve (o registro SEM projeto continua do dono e da coordenacao)', () => {
  const rule = (projectId: string | undefined, kind: 'constraint' | 'decision' | 'memory'): AclResource => ({
    type: 'vault', workspaceId: 'ws', ...(projectId === undefined ? {} : { projectId }), visibility: { kind: 'workspace' }, status: 'active', kind,
  })
  expect(can(coordA, 'write', rule('A', 'constraint'))).toBe(true)
  expect(can(coordA, 'write', rule('B', 'constraint'))).toBe(false)
  expect(can(coordA, 'write', rule(undefined, 'decision'))).toBe(true)
  expect(can(worker, 'write', rule('A', 'memory'))).toBe(true)
  expect(can(worker, 'write', rule('B', 'memory'))).toBe(false) // a persona de A nao escreve memoria no projeto B
  expect(can(owner, 'write', rule('B', 'constraint'))).toBe(true)
})
