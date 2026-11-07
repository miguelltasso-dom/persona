/**
 * P0-C2 (EQUIPE-REAL-SPEC §(e)) in the real host: a persona that SAVES files in the draft of her Task leaves ONE typed line in the thread ("Guia salvou 2 arquivos no
 * rascunho") with the files, a thumbnail for the images and the PNG of the SVG; Revisar lists the files (the PNG too). A scripted fake runner writes into the draft the way
 * a CLI's file tool would; there is no model.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
const previousHome = process.env.PERSONA_HOME
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  if (previousHome === undefined) delete process.env.PERSONA_HOME
  else process.env.PERSONA_HOME = previousHome
})
const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const poster = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="100%" height="100%" fill="#1e63b5"/><circle cx="300" cy="150" r="75" fill="#e02020"/></svg>'

/** A plain folder (no Git): the delivery keeps a private history outside it. */
function folder(): string {
  const home = mkdtempSync(join(tmpdir(), 'persona-home-'))
  dirs.push(home)
  process.env.PERSONA_HOME = home
  const root = mkdtempSync(join(tmpdir(), 'persona-saved-'))
  dirs.push(root)
  writeFileSync(join(root, 'README.md'), 'base\n')
  return root
}

function seed(h: PersonaHost, root: string, teamwork = true): void {
  h.teamworkEnabled = teamwork
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'coord', name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.setProjectRoot({ ...SCOPE, rootPath: root })
  // The review step is not what this spec is about.
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
}

/** The fake runner writes `files` into the draft of the Task the way a CLI's Write tool does. */
function writing(h: PersonaHost, files: Readonly<Record<string, string>>): void {
  h.orchestration.runnerFactory = async () => {
    const inner = createFakeRunner()
    return {
      ...inner,
      deliver: async (sessionId, requestId, text, mode) => {
        await inner.deliver(sessionId, requestId, text, mode)
        const cwd = h.orchestration.runtime('pp').repo.tickets.list()[0]?.execution?.directory
        if (cwd === undefined || cwd === '.') return
        for (const [name, content] of Object.entries(files)) {
          mkdirSync(dirname(join(cwd, name)), { recursive: true })
          writeFileSync(join(cwd, name), content)
        }
      },
    }
  }
}

const ask = (h: PersonaHost): void => {
  h.postMessage({ id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', body: 'preciso do cartaz da promoção', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-07T15:00:00.000Z' })
}
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

it('ONE typed line per turn: the persona that saved, the files in the order written, a thumbnail for the images and the PNG of the SVG (which is a file of the draft, not a second item)', async () => {
  const root = folder()
  const h = host()
  seed(h, root)
  writing(h, { 'cartaz.svg': poster, 'texto.md': '# Padaria Lua\n' })
  ask(h)
  await h.orchestration.flush('pp')
  const lines = thread(h).filter(row => row.filesSaved !== undefined)
  expect(lines).toHaveLength(1)
  const line = lines[0]!
  expect(line.actorId).toBe('coord')
  expect(line.body).toBe('Guia salvou 2 arquivos no rascunho')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  const files = line.filesSaved!.files
  expect(files.map(file => file.path).sort()).toEqual(['cartaz.svg', 'texto.md'])
  const svg = files.find(file => file.name === 'cartaz.svg')!
  expect(svg).toMatchObject({ mime: 'image/svg+xml', taskId: ticket.id, personaId: 'coord', pngPath: 'cartaz.png' })
  expect(svg.thumb?.startsWith('data:image/png;base64,')).toBe(true)
  expect(files.find(file => file.name === 'texto.md')).toMatchObject({ mime: 'text/markdown' })
  expect(files.find(file => file.name === 'texto.md')?.thumb).toBeUndefined()
  // The PNG exists in the draft and Revisar lists it together with the files.
  expect(existsSync(join(ticket.execution!.directory, 'cartaz.png'))).toBe(true)
  const summary = await h.reviewSummary({ ...SCOPE, ticketId: ticket.id })
  expect(summary.files.map(file => file.path).sort()).toEqual(['cartaz.png', 'cartaz.svg', 'texto.md'])
  // The line comes BEFORE the delivery line ("Pronto").
  const rows = thread(h)
  const doneAt = rows.findIndex(row => row.id.endsWith('-done') || row.id.includes('-done'))
  const lineAt = rows.findIndex(row => row.filesSaved !== undefined)
  if (doneAt !== -1) expect(lineAt).toBeLessThan(doneAt)
}, 60_000)

it('a turn that saved nothing leaves no line, and a file that was already in the folder is not "saved"', async () => {
  const root = folder()
  const h = host()
  seed(h, root)
  writing(h, {})
  ask(h)
  await h.orchestration.flush('pp')
  expect(thread(h).filter(row => row.filesSaved !== undefined)).toHaveLength(0)
}, 60_000)

it('without the team layer there is no typed line (and nothing in the message view)', async () => {
  const root = folder()
  const h = host()
  seed(h, root, false)
  writing(h, { 'cartaz.svg': poster })
  ask(h)
  await h.orchestration.flush('pp')
  expect(thread(h).filter(row => row.filesSaved !== undefined)).toHaveLength(0)
}, 60_000)
