/**
 * P0-1 "ARTE VIRA ARQUIVO" (D-099), with NO model. Real attempt 3: the onboarding personas had `tools = {}`, so the CLI started with NO tool at all and the art went
 * into the text of the message. Now a persona saves files — only INTO THE DRAFT of the project's folder, never with a shell — by default, with a switch per persona.
 * The grant is the persona's own `tools.files = 'write'`; it takes effect per Task, and only when the Task has a draft folder.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import { canSaveFiles, gatewayLevelOf, toolsForTask, withFilesSaving, withoutFileTools } from '../src/file-tools.ts'
import type PersonaHost from '../src/index.ts'
import { readImageUri, withReviewImages } from '../src/review-images.ts'
import { toolLevelOf, type HostRunnerRequest } from '../src/runner.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const exec = promisify(execFile)

function team(h: PersonaHost): void {
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.sessionMemberId = 'ana'
}
const roster = (h: PersonaHost, id: string) => h.listPersonas(SCOPE).find(row => row.id === id)!

it('(1) pure: the file grant is its own thing — it never raises the gateway level of her OWN tools, and a Task without a draft is text-only', () => {
  expect(canSaveFiles({ files: 'write' })).toBe(true)
  expect(canSaveFiles({ files: 'read' })).toBe(false)
  expect(canSaveFiles({})).toBe(false)
  expect(toolLevelOf({ files: 'write' })).toBe('write') // the CLI policy still reads it as a write grant...
  expect(gatewayLevelOf({ files: 'write' })).toBe('none') // ...but it opens nothing of the world (browser, e-mail, computer…): D-081/083
  expect(gatewayLevelOf({ files: 'write', shell: 'read' })).toBe('read')
  expect(withoutFileTools({ files: 'write', write: 'write', web: 'read' })).toEqual({ web: 'read' })
  expect(withFilesSaving({ web: 'read', files: 'read' }, true)).toEqual({ web: 'read', files: 'write' })
  expect(withFilesSaving({ web: 'read', files: 'write' }, false)).toEqual({ web: 'read' })
  expect(toolsForTask({ files: 'write', web: 'read' }, '.', true)).toEqual({ web: 'read' }) // no draft folder: text-only
  expect(toolsForTask({ files: 'write', web: 'read' }, undefined, true)).toEqual({ web: 'read' })
  expect(toolsForTask({ files: 'write' }, 'C:/drafts/a1', true)).toEqual({ files: 'write' }) // a draft folder: saving is effective
  expect(toolsForTask({ files: 'write' }, '.', false)).toEqual({ files: 'write' }) // the built-in engine keeps its own tools
})

it('(2) a persona the product creates saves files by default; the person turns it off and on, per persona, and only the Responsável or the owner can', () => {
  const h = openJourney()
  team(h)
  expect(h.product.getPersona('nina')!.tools).toEqual({ files: 'write' })
  expect(roster(h, 'nina')).toMatchObject({ canSaveFiles: true, canSaveFilesAvailable: false }) // no folder in this project yet
  expect(h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'nina', canSaveFiles: false })).toMatchObject({ canSaveFiles: false })
  expect(h.product.getPersona('nina')!.tools).toEqual({})
  expect(roster(h, 'guia').canSaveFiles).toBe(true) // each persona has her own
  expect(h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'nina', canSaveFiles: true }).canSaveFiles).toBe(true)
  expect(() => h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'ghost', canSaveFiles: true })).toThrow(/persona-not-found|não existe/iu)
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.sessionMemberId = 'bia'
  expect(() => h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'nina', canSaveFiles: false })).toThrow('forbidden')
})

/** A real git folder for the project (the draft is a copy of it) and a home for the drafts. */
async function gitFolder(): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), 'persona-home-'))
  const previous = process.env.PERSONA_HOME
  process.env.PERSONA_HOME = home
  const root = mkdtempSync(join(tmpdir(), 'persona-files-'))
  onTestFinished(() => {
    if (previous === undefined) delete process.env.PERSONA_HOME
    else process.env.PERSONA_HOME = previous
    rmSync(home, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })
  await exec('git', ['init', '-b', 'main', root])
  await exec('git', ['-C', root, 'config', 'user.email', 'anvil@persona.test'])
  await exec('git', ['-C', root, 'config', 'user.name', 'Anvil'])
  writeFileSync(join(root, 'README'), 'base\n')
  await exec('git', ['-C', root, 'add', '.'])
  await exec('git', ['-C', root, 'commit', '-m', 'init'])
  return root
}

/** An ORDINARY folder (no git): the typical folder of a person, served by the private-history draft. */
function plainFolder(): string {
  const home = mkdtempSync(join(tmpdir(), 'persona-home-'))
  const previous = process.env.PERSONA_HOME
  process.env.PERSONA_HOME = home
  const root = mkdtempSync(join(tmpdir(), 'persona-plain-'))
  onTestFinished(() => {
    if (previous === undefined) delete process.env.PERSONA_HOME
    else process.env.PERSONA_HOME = previous
    rmSync(home, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })
  writeFileSync(join(root, 'LEIA-ME.txt'), 'base')
  return root
}

/** Run one Task of Nina through the real orchestration; return what the host asked the runner for. */
async function taskRequests(h: PersonaHost): Promise<HostRunnerRequest[]> {
  const seen: HostRunnerRequest[] = []
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const t = said; said = undefined; return t }, set: () => undefined })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    if (request !== undefined) seen.push(request)
    const listeners = new Set<(event: RunnerEvent) => void>()
    const fake: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: (sessionId) => {
        said = 'Feito.'
        for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() })
        return Promise.resolve()
      },
      cancel: () => Promise.resolve(),
      status: () => 'idle',
      whenIdle: () => Promise.resolve(),
      onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
    }
    return Promise.resolve(fake)
  }
  say(h, 'u1', '@Nina escreva um texto curto de boas-vindas')
  await h.orchestration.flush('pp')
  return seen.filter(request => request.purpose === 'task' && request.personaName === 'Nina')
}

it('(3) a Task in a project WITHOUT a folder is text-only (no file grant reaches the runner), even though the persona has the grant', async () => {
  const h = openJourney()
  team(h)
  const requests = await taskRequests(h)
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) expect(request.tools ?? {}).not.toHaveProperty('files')
})

it('(4) a Task in a project WITH a folder saves files: the grant reaches the runner (the Task runs in its draft); with the switch off it does not', async () => {
  const h = openJourney()
  team(h)
  h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: await gitFolder() })
  expect(roster(h, 'nina').canSaveFilesAvailable).toBe(true)
  const on = await taskRequests(h)
  expect(on.length).toBeGreaterThan(0)
  for (const request of on) expect(request.tools).toMatchObject({ files: 'write' })
  h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'nina', canSaveFiles: false })
  say(h, 'u2', '@Nina agora escreva outro texto curto')
  await h.orchestration.flush('pp')
  expect(roster(h, 'nina').canSaveFiles).toBe(false)
})

it('(5) a Task a colleague asked for (hand-off, part of a plan) gets a draft when its persona saves files; the first delivery and a persona who does not stay without', async () => {
  const h = openJourney()
  team(h)
  h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: await gitFolder() })
  const stamp = '2026-11-07T15:00:00.000Z'
  const ticket = (id: string, over: Record<string, unknown> = {}) => h.orchestration.runtime('pp').repo.tickets.save({
    id, title: id, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: `t-${id}`, triggerIds: [`t-${id}`] },
    execution: { name: 'Nina', directory: '.', assignment: id }, ...over,
  } as never)
  const route = (id: string, executorId: string, mode?: 'task' | 'first-delivery') => h.screens.screens.put('pp', 'first_delivery_route', `t-${id}`, { executorId, title: id, ...(mode === undefined ? {} : { mode }) })
  ticket('arte'); route('arte', 'nina', 'task')
  ticket('primeira'); route('primeira', 'nina', 'first-delivery')
  ticket('revisora'); route('revisora', 'guia', 'task')
  h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'guia', canSaveFiles: false })
  expect(await h.orchestration.prepareReview('pp', 'arte', 'a-arte')).toBeDefined() // her art becomes a file of a draft
  expect(await h.orchestration.prepareReview('pp', 'primeira', 'a-primeira')).toBeUndefined() // the first delivery stays text-only
  expect(await h.orchestration.prepareReview('pp', 'revisora', 'a-revisora')).toBeUndefined() // a persona who does not save files gets no draft for a colleague's request
})

it('(6) a persona hired by another never has more access than the one who hires her: she saves files only if the hirer does', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'chefe', name: 'Chefe', title: 'Coordenação', coordination: true, canRecruit: true }])
  h.sessionMemberId = 'ana'
  const hire = (id: string, name: string) => {
    h.proposeHire({ ...SCOPE, id, creatorPersonaId: 'chefe', name, title: 'Suporte', description: 'Atende.' })
    h.decideApproval({ ...SCOPE, id, kind: 'hire', accept: true })
    return h.product.getPersona(`hire:${id}`)!
  }
  expect(hire('ap-a', 'Alice').tools).toEqual({ files: 'write' }) // the hirer saves files: so may she
  h.setPersonaCanSaveFiles({ ...SCOPE, personaId: 'chefe', canSaveFiles: false })
  expect(hire('ap-b', 'Bia').tools).toEqual({}) // the hirer does not: she gets no more than her
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>'

it('(7) pictures of Revisar: only the known types, only INSIDE the folder, never bigger than the screen draws; anything else is left out, never guessed', () => {
  const root = mkdtempSync(join(tmpdir(), 'persona-img-'))
  const outside = mkdtempSync(join(tmpdir(), 'persona-out-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }) })
  writeFileSync(join(root, 'cartaz.png'), PNG)
  writeFileSync(join(root, 'cartaz.svg'), SVG)
  writeFileSync(join(root, 'notas.txt'), 'texto')
  writeFileSync(join(root, 'enorme.png'), Buffer.alloc(300_000, 1))
  writeFileSync(join(outside, 'segredo.png'), PNG)
  expect(readImageUri(root, 'cartaz.png')).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
  expect(readImageUri(root, 'cartaz.svg')?.startsWith('data:image/svg+xml;base64,')).toBe(true) // sent as a picture (the screen draws it with <img>), never as markup
  expect(readImageUri(root, 'notas.txt')).toBeUndefined() // not a picture
  expect(readImageUri(root, 'enorme.png')).toBeUndefined() // bigger than the address the screen draws: "Prévia indisponível"
  expect(readImageUri(root, 'nao-existe.png')).toBeUndefined()
  expect(readImageUri(root, `../${basename(outside)}/segredo.png`)).toBeUndefined() // leaves the folder
  expect(readImageUri(root, join(outside, 'segredo.png'))).toBeUndefined() // absolute path
  expect(readImageUri('.', 'cartaz.png')).toBeUndefined() // the placeholder "no draft"
  expect(readImageUri(undefined, 'cartaz.png')).toBeUndefined()
  let linked = false
  try { symlinkSync(join(outside, 'segredo.png'), join(root, 'atalho.png')); linked = true } catch { /* no right to make a link on this machine */ }
  if (linked) expect(readImageUri(root, 'atalho.png')).toBeUndefined() // a link out of the folder is not followed
  const plain = { path: 'notas.txt', added: 1, deleted: 0 }
  expect(withReviewImages(plain, root, root)).toBe(plain) // a file that is not a picture is returned as it is
  const draft = mkdtempSync(join(tmpdir(), 'persona-draft-'))
  onTestFinished(() => { rmSync(draft, { recursive: true, force: true }) })
  writeFileSync(join(draft, 'cartaz.png'), Buffer.concat([PNG, Buffer.from([0])]))
  const both = withReviewImages({ path: 'cartaz.png', added: 0, deleted: 0 }, draft, root)
  expect(both.afterImage).toBe(`data:image/png;base64,${Buffer.concat([PNG, Buffer.from([0])]).toString('base64')}`) // what the persona made
  expect(both.beforeImage).toBe(`data:image/png;base64,${PNG.toString('base64')}`) // what the folder has now
  expect(both.folderImage).toBe(both.beforeImage)
  const fresh = withReviewImages({ path: 'novo.png', added: 0, deleted: 0 }, draft, root)
  expect(fresh).not.toHaveProperty('beforeImage') // a new file has nothing in the folder
})

it('(8) Revisar shows the ART: a draft with cartaz.svg and cartaz.png => the summary carries afterImage for both', async () => {
  const h = openJourney()
  team(h)
  h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: plainFolder() })
  const stamp = '2026-11-07T16:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 'arte', title: 'Arte do cartaz', decisionId: 'd-arte',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a-arte', state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: 't-arte', triggerIds: ['t-arte'] },
    execution: { name: 'Nina', directory: '.', assignment: 'arte' },
  } as never)
  h.screens.screens.put('pp', 'first_delivery_route', 't-arte', { executorId: 'nina', title: 'Arte do cartaz', mode: 'task' })
  const tree = await h.orchestration.prepareReview('pp', 'arte', 'a-arte')
  expect(tree).toBeDefined()
  writeFileSync(join(tree!.path, 'cartaz.svg'), SVG)
  writeFileSync(join(tree!.path, 'cartaz.png'), PNG)
  const summary = await h.reviewSummary({ ...SCOPE, ticketId: 'arte' })
  const byPath = new Map(summary.files.map(file => [file.path, file]))
  expect(byPath.get('cartaz.png')?.afterImage).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
  expect(byPath.get('cartaz.svg')?.afterImage?.startsWith('data:image/svg+xml;base64,')).toBe(true)
  expect(byPath.get('cartaz.png')).not.toHaveProperty('beforeImage') // new files: nothing in the folder to compare with
})
