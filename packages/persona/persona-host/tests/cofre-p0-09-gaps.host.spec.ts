import { VAULT_IMAP, VAULT_TELEGRAM } from '@deepseek-ai/dsh-persona-vault'
import { expect } from 'vitest'
import { GITHUB_WEBHOOK_FACT } from '../src/cofre-migrate.ts'
import { readZipTexts } from '../src/export-md.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-09 (Gauge, review of Anvil's fix): the export filter (`export-md.ts`, SECRET_FACT_KEYS) is a SECOND line of defence, independent of the boot migration. Anvil's regression
 * (persona-e2e regressao-p0-09-segredos) exports only AFTER the migration purged the rows, so it would stay green with the filter deleted. Here a connector token row that appears AFTER the
 * migration (an older client, an import, a restore) still never leaves in the `.zip`; the control proves the archive really carries record bodies, so "not found" means "filtered".
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
const TOKEN = 'tg-DEPOIS-DA-MIGRACAO-8a1c-555555555'
const WEBHOOK = 'whsec-DEPOIS-DA-MIGRACAO-2e7f-666666666'
const IMAP = 'imap-DEPOIS-DA-MIGRACAO-9b4d-777777777'
const NOTE = 'nota-normal-da-equipe-sobre-o-lancamento'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
}

function record(h: PersonaHost, id: string, body: string, factKey?: string): void {
  h.vault.createRecord({ id, ...SCOPE, kind: 'memory', body, authorId: 'ana', visibility: { kind: 'workspace' }, sourceIds: [], ...(factKey === undefined ? {} : { factKey }) })
}

function zipText(h: PersonaHost, scope: 'project' | 'workspace'): string {
  const archive = scope === 'project' ? h.exportProject({ ...SCOPE, includeDmIds: [] }) : h.exportWorkspace({ ...SCOPE, includeDmIds: [] })
  return [...readZipTexts(Buffer.from(archive.base64, 'base64')).values()].join('\n')
}

it('CONTROLE: a record that is NOT a connector secret travels in the .zip (so the absence below is the filter, not an empty export)', () => {
  const h = host()
  seed(h)
  record(h, 'nota', NOTE)
  record(h, 'tg-sem-chave', TOKEN) // the same body as a token, but with no secret fact key: the archive carries it
  const text = zipText(h, 'project')
  expect(text).toContain(NOTE)
  expect(text, 'the control record with the token text and no fact key must travel; otherwise this suite proves nothing').toContain(TOKEN)
})

it('a connector secret row (Telegram, webhook, IMAP) that shows up AFTER the migration never leaves in the project .zip', () => {
  const h = host()
  seed(h)
  record(h, 'nota', NOTE)
  record(h, 'tg', TOKEN, VAULT_TELEGRAM)
  record(h, 'hook', WEBHOOK, GITHUB_WEBHOOK_FACT)
  record(h, 'imap', IMAP, VAULT_IMAP)
  const text = zipText(h, 'project')
  expect(text, 'the export still works').toContain(NOTE)
  for (const secret of [TOKEN, WEBHOOK, IMAP]) expect(text, secret).not.toContain(secret)
})

it('the same for the workspace .zip', () => {
  const h = host()
  seed(h)
  record(h, 'nota', NOTE)
  record(h, 'tg', TOKEN, VAULT_TELEGRAM)
  record(h, 'hook', WEBHOOK, GITHUB_WEBHOOK_FACT)
  record(h, 'imap', IMAP, VAULT_IMAP)
  const text = zipText(h, 'workspace')
  expect(text, 'the export still works').toContain(NOTE)
  for (const secret of [TOKEN, WEBHOOK, IMAP]) expect(text, secret).not.toContain(secret)
})

it('the connectors are the OWNER\'s: only the owner\'s own words count as a request that authorizes one (the wiring of `isHuman` in the host, not a stub)', () => {
  const h = host()
  seed(h)
  h.createMember({ id: 'bia', ...SCOPE, displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...SCOPE, displayName: 'Gus', handle: 'gus', role: 'guest' })
  // `humanAuthoredRequests` is tested with a stub elsewhere (connector-policy.spec); this is the closure the host really hands to ConnectorGrantsHost (the grants host keeps it in `deps`).
  const { isHuman } = (h.connectorGrants as unknown as { deps: { isHuman: (workspaceId: string, actorId: string) => boolean } }).deps
  expect(isHuman('ws', 'ana'), 'the owner').toBe(true)
  expect(isHuman('ws', 'bia'), 'an invited member').toBe(false)
  expect(isHuman('ws', 'gus'), 'a guest').toBe(false)
  expect(isHuman('ws', 'ghost'), 'a stranger').toBe(false)
  expect(isHuman('w2', 'ana'), 'the owner of ANOTHER workspace is not this workspace\'s owner').toBe(false)
})
