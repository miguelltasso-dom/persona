import { expect } from 'vitest'
import { readZipTexts } from '../src/export-md.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-13 (Keel 08:11, the class that was left out): what an EXPORT hands a member or a guest. `exportMarkdown` listed every project of the workspace, every Cofre record of each (whatever its
 * visibility) and the governance audit, for whoever asked. Written red first: the whole-workspace export is the owner's; a member's project export carries only the records that member may read, no other
 * person's DM and no governance.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const WS = { workspaceId: 'ws' } as const

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...WS, projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...WS, projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...WS, projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createProject({ id: 'team', ...WS, name: 'Time', description: '' })
  h.createPersona({
    ...WS, projectId: 'team', id: 'coord', name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  h.createDm({ id: 'secret', ...WS, projectId: 'team', participantA: 'ana', participantB: 'coord' })
  h.postMessage({ id: 'd1', ...WS, projectId: 'team', streamKind: 'dm', ownerId: 'secret', body: 'SEGREDO-DM da Ana com a Guia', actorId: 'ana', subjectId: 'd1' })
  const base = { workspaceId: 'ws', kind: 'memory' as const, authorId: 'ana' }
  h.vault.createRecord({ ...base, id: 'r-pub', projectId: 'team', body: 'PUBLICO-TIME', visibility: { kind: 'workspace' } })
  h.vault.createRecord({ ...base, id: 'r-ana', projectId: 'team', body: 'SEGREDO-ANA', visibility: { kind: 'members', memberIds: ['ana'] } })
  h.vault.createRecord({ ...base, id: 'r-pessoal', projectId: 'pp', body: 'SEGREDO-PESSOAL', visibility: { kind: 'project', projectId: 'pp' } })
}

async function exported(attempt: () => { readonly base64: string }): Promise<{ readonly refused: string | undefined; readonly files: Map<string, string> }> {
  try {
    return { refused: undefined, files: readZipTexts(Buffer.from(attempt().base64, 'base64')) }
  } catch (error) {
    return { refused: error instanceof Error ? error.message : 'error', files: new Map() }
  }
}

const textOf = (files: Map<string, string>): string => [...files.entries()].map(([name, body]) => `${name}\n${body}`).join('\n')

it('the whole-workspace export is the owner\'s; a member\'s project export carries only what that member may read', async () => {
  const h = host()
  seed(h)
  const asOwner = await exported(() => h.exportWorkspace({ ...WS, projectId: 'pp', includeDmIds: ['secret'] }))
  expect(asOwner.refused, 'control: the owner exports everything').toBeUndefined()
  expect(textOf(asOwner.files)).toContain('SEGREDO-ANA')
  expect(textOf(asOwner.files)).toContain('SEGREDO-PESSOAL')

  h.sessionMemberId = 'gus'
  expect((await exported(() => h.exportWorkspace({ ...WS, projectId: 'pp', includeDmIds: ['secret'] }))).refused, 'guest: whole workspace').toBe('forbidden')
  h.sessionMemberId = 'bia'
  expect((await exported(() => h.exportWorkspace({ ...WS, projectId: 'pp', includeDmIds: ['secret'] }))).refused, 'member: whole workspace').toBe('forbidden')

  const project = await exported(() => h.exportProject({ ...WS, projectId: 'team', includeDmIds: ['secret'] }))
  expect(project.refused, 'control: a member exports the shared project').toBeUndefined()
  const text = textOf(project.files)
  expect(text, 'control: the record every member may read is there').toContain('PUBLICO-TIME')
  expect(text, 'a record private to the owner').not.toContain('SEGREDO-ANA')
  expect(text, 'the owner\'s personal project').not.toContain('SEGREDO-PESSOAL')
  expect(text, 'a DM the member is not in, even when listed').not.toContain('SEGREDO-DM')
  expect([...project.files.keys()].some(name => name.includes('governanca')), 'the governance audit').toBe(false)
})
