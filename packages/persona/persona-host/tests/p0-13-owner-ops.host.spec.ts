import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-13 (Keel 07:44, "o endurecimento de ACL que restou"): the Remotes that change WHO is in the team (invites) and WHICH accounts the machine uses are the owner's. Before: a `member` issued an
 * invite (`issueInvite` asked only to READ the project on the local path), revoked it, and added, changed or removed the account seats of the machine; a `guest` read the invites. Each row is the Remote,
 * the roles that must be refused, written red first.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const WS = { workspaceId: 'ws' } as const
const TEAM = { ...WS, projectId: 'team' } as const

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...WS, projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...WS, projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...WS, projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createProject({ id: 'team', ...WS, name: 'Time', description: '' })
  h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
  h.sessionMemberId = 'ana'
}

async function refusal(attempt: () => unknown): Promise<string> {
  try {
    await Promise.resolve(attempt())
    return 'ran'
  } catch (error) {
    return error instanceof Error ? error.message : 'error'
  }
}

it('the invites and the account seats of the machine are the OWNER\'s: a member and a guest are refused', async () => {
  const h = host()
  seed(h)
  const rows: ReadonlyArray<readonly [string, () => unknown]> = [
    ['issueInvite', () => h.issueInvite({ ...TEAM, inviteId: 'i1', token: 'tok-1', role: 'member' })],
    ['revokeInvite', () => h.revokeInvite({ ...TEAM, inviteId: 'i1' })],
    ['redeemInvite', () => h.redeemInvite({ ...TEAM, token: 'tok-1', memberId: 'mal', displayName: 'Mal', handle: 'mal' })],
    ['listInvites', () => h.listInvites(TEAM)],
    ['addConnectionAccount', () => h.addConnectionAccount({ ...TEAM, provider: 'claude', label: 'Outra' } as never)],
    ['updateConnectionAccount', () => h.updateConnectionAccount({ ...TEAM, accountId: 'claude:pessoal', label: 'Renomeada' } as never)],
    ['removeConnectionAccount', () => h.removeConnectionAccount({ ...TEAM, accountId: 'claude:pessoal' } as never)],
  ]
  h.sessionMemberId = 'ana'
  const ownerSees: Record<string, string> = {}
  for (const [name, attempt] of rows) ownerSees[name] = await refusal(attempt)
  for (const session of ['bia', 'gus']) {
    h.sessionMemberId = session
    for (const [name, attempt] of rows) expect(await refusal(attempt), `${session}: ${name}`).toBe('forbidden')
  }
  // The owner is not refused (control: a different error, or none, never `forbidden`).
  for (const [name, result] of Object.entries(ownerSees)) expect(result, `owner: ${name}`).not.toBe('forbidden')
})

it('the account swaps (which account a stopped Task resumes on) are the OWNER\'s: a member is refused', async () => {
  const h = host()
  seed(h)
  const rows: ReadonlyArray<readonly [string, () => unknown]> = [
    ['confirmAccountSwap', () => h.confirmAccountSwap({ ...TEAM, ticketId: 't1', toAccountId: 'claude:pessoal' } as never)],
    ['declineAccountSwap', () => h.declineAccountSwap({ ...TEAM, ticketId: 't1' } as never)],
    ['undoAccountSwap', () => h.undoAccountSwap({ ...TEAM, swapId: 's1' } as never)],
  ]
  h.sessionMemberId = 'bia'
  for (const [name, attempt] of rows) expect(await refusal(attempt), `member: ${name}`).toBe('forbidden')
  h.sessionMemberId = 'ana'
  for (const [name, attempt] of rows) expect(await refusal(attempt), `owner: ${name}`).not.toBe('forbidden')
})

it('a member writes memories but not the HOUSE RULES (constraint, decision: every turn of the team obeys them): owner or coordination only', async () => {
  const h = host()
  seed(h)
  const record = (kind: 'constraint' | 'decision' | 'memory', id: string): (() => unknown) => () => h.createVaultRecord({ ...TEAM, id, kind, body: `texto ${id}`, authorId: 'bia' })
  h.sessionMemberId = 'bia'
  expect(await refusal(record('constraint', 'r-c')), 'member: constraint').toBe('forbidden')
  expect(await refusal(record('decision', 'r-d')), 'member: decision').toBe('forbidden')
  expect(await refusal(record('memory', 'r-m')), 'control: a member may write a memory').toBe('ran')
  h.sessionMemberId = 'ana'
  expect(await refusal(record('constraint', 'r-c2')), 'owner: constraint').toBe('ran')
})

it('P2-03b (round 2): the connector secret slots take only the KNOWN providers (a made-up name is never a slot of the sealed store)', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  for (const provider of ['qualquer', 'connector:imap', '../x', '', 'default', 'code:123456', 'IMAP ']) {
    expect(await refusal(() => h.saveConnectorSecret({ ...TEAM, provider, secret: 's' } as never)), `save ${JSON.stringify(provider)}`).toBe('invalid-provider')
    expect(await refusal(() => h.connectorSecretState({ ...TEAM, provider } as never)), `state ${JSON.stringify(provider)}`).toBe('invalid-provider')
  }
  for (const provider of ['imap', 'smtp', 'telegram', 'slack', 'discord', 'caldav', 'github.webhook.secret']) {
    expect(await refusal(() => h.connectorSecretState({ ...TEAM, provider } as never)), `control: state ${provider}`).toBe('ran')
    expect(await refusal(() => h.saveConnectorSecret({ ...TEAM, provider, secret: 's' } as never)), `control: save ${provider}`).not.toBe('invalid-provider')
  }
})
