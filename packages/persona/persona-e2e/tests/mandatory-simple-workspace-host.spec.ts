/**
 * SW-9 / SW-10, HOST layer ("Rascunho da tarefa", persona-spec/SIMPLE-WORKSPACE.md + contracts/simple-workspace.md): the user's scenarios through the REAL
 * PersonaHost remotes (`reviewSummary` → `acceptReview` → `listRestorePoints` → `undoApply` → `getProjectStorageUsage`) on real `.docx`/`.xlsx` in an
 * ordinary folder OUTSIDE any repository. A worker (scripted runner, 0 AI) edits the files in the DRAFT it is given; the person's folder must stay
 * untouched until Aplicar, Aplicar must be all-or-nothing, Desfazer must restore byte for byte, and the folder must never gain a `.git`.
 *
 * Engine layer: `mandatory-simple-workspace.spec.ts`. Host-only Windows pieces (MinGit, long path, OneDrive): Forge's `sw-windows-draft.spec.ts`.
 * The UI layer (SW-8 "Revisar em linguagem simples") and the INSTALLED layer (SW-10) wait on SW-8 / the next exe.
 * Opt-in `PERSONA_E2E=1`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import { SCOPE as PP, openJourney } from '../../persona-host/tests/journeys/journey-host.ts'
import { createFakeRunner } from '../../persona-runners/src/index.ts'
import {
  MENU_AFTER,
  buildDocx,
  createUserFolder,
  holdExclusiveLock,
  readDocxParagraphs,
  userFolderProblems,
  type FileLock,
  type UserFolder,
} from '../src/simple-workspace-fixtures.ts'

const run = process.env.PERSONA_E2E === '1'
const DOCX = 'cardápio.docx'
const XLSX = 'preços.xlsx'
const TIMEOUT = 120_000

const folders: UserFolder[] = []
const trash: string[] = []
const locks: FileLock[] = []
afterEach(async () => {
  for (const lock of locks.splice(0)) await lock.release()
  vi.unstubAllEnvs()
  for (const folder of folders.splice(0)) await folder.remove().catch(() => {})
  // Best effort: the host (opened by journey-host, disposed by ITS afterEach) can still hold the private history for a moment on Windows; a leftover temp dir is not a failure.
  for (const dir of trash.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* left for the OS temp cleanup */ }
  }
})

const read = (folder: UserFolder, name: string): Buffer => readFileSync(join(folder.dir, name))
const names = (folder: UserFolder): string[] => readdirSync(folder.dir).sort()

/** A host whose project folder is `folder` and whose worker writes `edits` into whatever DRAFT directory it is started in. */
async function hostFor(folder: UserFolder, edits: () => Record<string, Buffer | string>): Promise<PersonaHost> {
  const home = mkdtempSync(join(tmpdir(), 'sw-host-home-'))
  trash.push(home)
  vi.stubEnv('PERSONA_HOME', home)
  const h = openJourney()
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ ...PP, id: 'ana', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...PP, id: 'worker', name: 'Bia', title: 'Documentos', description: '', personality: '', instructions: '', avatarKind: 'gallery', avatarRef: 'bia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('worker')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ ...PP, id: 'geral', name: 'geral', topic: '' })
  h.setProjectRoot({ ...PP, rootPath: folder.dir })
  h.orchestration.runnerFactory = async () => {
    const runner = createFakeRunner()
    return {
      ...runner,
      deliver: async (sessionId, requestId, body, mode) => {
        await runner.deliver(sessionId, requestId, body, mode)
        if (!sessionId.startsWith('worker-')) return
        const directory = h.orchestration.runtime('pp').repo.tickets.list()[0]?.execution?.directory
        if (directory === undefined || directory === '.') return
        for (const [name, content] of Object.entries(edits())) {
          mkdirSync(dirname(join(directory, name)), { recursive: true })
          writeFileSync(join(directory, name), content)
        }
      },
    }
  }
  return h
}

async function askForWork(h: PersonaHost): Promise<string> {
  h.postMessage({ ...PP, id: 'edit', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', body: 'atualize o cardápio.docx com os preços novos', subjectId: 'menu', occurredAt: '2026-11-03T15:00:00.000Z' })
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
  if (ticket === undefined) throw new Error('the request did not open a Task')
  return ticket.id
}

describe.skipIf(!run)('SW-9 host — pasta comum sem git: rascunho → Revisar → Aplicar → Desfazer, pelos Remotes do host', () => {
  it('S1: atualizar o cardápio — o worker mexe no RASCUNHO, a pasta fica intacta até o Aplicar, o ponto de restauração aparece e Desfazer devolve byte a byte', async () => {
    const folder = await createUserFolder()
    folders.push(folder)
    const docxBefore = read(folder, DOCX)
    const xlsxBefore = read(folder, XLSX)
    const h = await hostFor(folder, () => ({ [DOCX]: buildDocx(MENU_AFTER) }))
    const ticketId = await askForWork(h)

    expect(read(folder, DOCX).equals(docxBefore), 'the folder is untouched while the draft is being worked on').toBe(true)
    const summary = await h.reviewSummary({ ...PP, ticketId, command: 'complete', reason: '' })
    expect(summary.hasWorktree).toBe(true)
    expect(summary.files.map(file => file.path)).toEqual([DOCX])

    const applied = await h.acceptReview({ ...PP, ticketId, mode: 'ff' })
    expect(applied.kind).toBe('merged')
    expect(applied.restorePointId).toBeDefined()
    expect(readDocxParagraphs(read(folder, DOCX)).join('|')).toBe(MENU_AFTER.join('|'))
    expect(read(folder, XLSX).equals(xlsxBefore), 'other files are byte-identical').toBe(true)
    expect(userFolderProblems(folder.dir), 'the folder never gains a .git').toEqual([])

    const listed = await h.listRestorePoints(PP)
    expect(listed.status).toBe('available')
    expect(listed.points.find(point => point.id === applied.restorePointId)).toMatchObject({ ticketId, state: 'available', files: [DOCX] })
    const usage = await h.getProjectStorageUsage(PP)
    expect(usage.status).toBe('measured')
    expect(usage.historyBytes ?? 0).toBeGreaterThan(0)
    expect(usage.retentionDays).toBe(30)

    expect(await h.undoApply({ ...PP, restorePointId: applied.restorePointId! })).toEqual({ kind: 'restored', restorePointId: applied.restorePointId })
    expect(read(folder, DOCX).equals(docxBefore), 'Desfazer restores cardápio.docx byte for byte').toBe(true)
    expect(userFolderProblems(folder.dir)).toEqual([])
    expect((await h.listRestorePoints(PP)).points.find(point => point.id === applied.restorePointId)?.state).toBe('undone')
  }, TIMEOUT)

  it.each(['keep_mine', 'keep_persona', 'keep_both'] as const)('S5: a pessoa mexeu no MESMO arquivo enquanto a persona trabalhava — o Aplicar para e nomeia o arquivo; escolha %s e Desfazer', async (choice) => {
    const folder = await createUserFolder()
    folders.push(folder)
    const original = read(folder, DOCX)
    const mine = buildDocx([...readDocxParagraphs(original), 'Fechamos às segundas (edição minha)'])
    const theirs = buildDocx(MENU_AFTER)
    const h = await hostFor(folder, () => ({ [DOCX]: theirs }))
    const ticketId = await askForWork(h)
    writeFileSync(join(folder.dir, DOCX), mine) // the person edits the same file meanwhile

    const blocked = await h.acceptReview({ ...PP, ticketId, mode: 'ff' })
    expect(blocked.kind).toBe('blocked')
    expect(blocked.conflicts).toHaveLength(1)
    expect(blocked.conflicts![0]!.path).toBe(DOCX)
    expect(read(folder, DOCX).equals(mine), 'nothing is overwritten before the person chooses').toBe(true)

    const applied = await h.acceptReview({ ...PP, ticketId, mode: 'ff', conflicts: [{ ...blocked.conflicts![0]!, choice }] })
    expect(applied.kind).toBe('merged')
    if (choice === 'keep_mine') expect(read(folder, DOCX).equals(mine)).toBe(true)
    if (choice === 'keep_persona') expect(readDocxParagraphs(read(folder, DOCX)).join('|')).toBe(MENU_AFTER.join('|'))
    if (choice === 'keep_both') {
      expect(read(folder, DOCX).equals(mine), 'the person\'s file keeps its name and bytes').toBe(true)
      expect(names(folder).filter(name => name.startsWith('cardápio')).length, `a second copy exists (${names(folder).join(', ')})`).toBeGreaterThanOrEqual(2)
    }
    expect(userFolderProblems(folder.dir), 'no .git and no conflict markers').toEqual([])
    const undone = await h.undoApply({ ...PP, restorePointId: applied.restorePointId! })
    expect(undone.kind).toBe('restored')
    expect(read(folder, DOCX).equals(mine) || read(folder, DOCX).equals(original), 'Desfazer returns the folder to what the person had').toBe(true)
  }, TIMEOUT)

  it.skipIf(process.platform !== 'win32')('S4: planilha aberta no Excel durante o Aplicar — tudo ou nada, "Feche “preços.xlsx”…", funciona depois de fechar e o Desfazer devolve os dois arquivos', async () => {
    const folder = await createUserFolder()
    folders.push(folder)
    const before = { docx: read(folder, DOCX), xlsx: read(folder, XLSX) }
    const h = await hostFor(folder, () => ({ [DOCX]: buildDocx(MENU_AFTER), [XLSX]: Buffer.concat([before.xlsx, Buffer.from('persona-edit')]) }))
    const ticketId = await askForWork(h)
    const lock = await holdExclusiveLock(join(folder.dir, XLSX)) // the person opens the sheet while the persona worked
    locks.push(lock)

    let outcome = 'threw'
    let message = ''
    try {
      const result = await h.acceptReview({ ...PP, ticketId, mode: 'ff' })
      outcome = result.kind
      message = result.kind === 'blocked' ? result.explanation : ''
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(outcome, 'apply never reports success while the spreadsheet is open').not.toBe('merged')
    expect(message).toMatch(/Feche “preços\.xlsx”/u)
    expect(read(folder, DOCX).equals(before.docx), 'all-or-nothing: cardápio.docx was NOT half-applied').toBe(true)
    expect(userFolderProblems(folder.dir)).toEqual([])
    await lock.release()
    expect(read(folder, XLSX).equals(before.xlsx), 'the spreadsheet is byte-identical after the failed attempt').toBe(true)

    const retry = await h.acceptReview({ ...PP, ticketId, mode: 'ff' })
    expect(retry.kind).toBe('merged')
    expect(readDocxParagraphs(read(folder, DOCX)).join('|')).toBe(MENU_AFTER.join('|'))
    expect((await h.undoApply({ ...PP, restorePointId: retry.restorePointId! })).kind).toBe('restored')
    expect(read(folder, XLSX).equals(before.xlsx) && read(folder, DOCX).equals(before.docx), 'Desfazer restores both files byte for byte').toBe(true)
  }, TIMEOUT)

  it('um ponto de restauração de OUTRO projeto não desfaz nada neste, e um id inventado não vira sucesso', async () => {
    const folder = await createUserFolder()
    folders.push(folder)
    const h = await hostFor(folder, () => ({ [DOCX]: buildDocx(MENU_AFTER) }))
    const ticketId = await askForWork(h)
    const applied = await h.acceptReview({ ...PP, ticketId, mode: 'ff' })
    expect(applied.kind).toBe('merged')
    const after = read(folder, DOCX)
    const forged = await h.undoApply({ ...PP, restorePointId: 'ponto-que-nao-existe' }).catch((error: unknown) => ({ kind: 'threw' as const, error }))
    expect(['blocked', 'expired', 'threw']).toContain(forged.kind) // never "restored"
    expect(read(folder, DOCX).equals(after), 'a forged id changed nothing').toBe(true)
    expect(existsSync(join(folder.dir, '.git'))).toBe(false)
  }, TIMEOUT)

  it.todo('SW-9 UI: os mesmos cenários pelo app (Revisar em linguagem simples, Aplicar na pasta / Pedir ajustes / Descartar, Desfazer, escolha de conflito) — SW-8 Lumen')
  it.todo('SW-10: perfil limpo no exe instalado, usuário sem git, pasta de documentos: nenhuma palavra técnica na tela e a pasta continua sem .git — próximo exe + SW-8')
})
