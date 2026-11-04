/**
 * SW-9 / SW-10, ENGINE layer ("Rascunho da tarefa", persona-spec/SIMPLE-WORKSPACE.md): the five scenarios and the
 * cardápio.docx acceptance flow through the real `ReviewDelivery` on real Office files, outside any repository.
 * The host/UI layer (SW-6, SW-8) and the installed app (SW-10) are added when those items land.
 *
 * Opt-in `PERSONA_E2E=1` (~75 s). The scenario runner is `scripts/sw-engine-acceptance.ts`; its JSON is the evidence
 * (`artifacts/sw/engine-acceptance.json`).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR, PACKAGE_ROOT, REPO_ROOT } from '../src/paths.ts'

interface Scenario { id: string; status: 'pass' | 'fail' | 'blocked'; checks: string[]; failed: string[]; detail?: string }

const run = process.env.PERSONA_E2E === '1'
const ACTIONABLE_MESSAGE_CHECK = 'the message tells the person what to do in Portuguese ("feche a planilha …")'

describe.skipIf(!run)('SW-9/SW-10 — engine layer (private history, restore points, conflicts)', () => {
  let scenarios: Scenario[]
  const byId = (id: string): Scenario => scenarios.find(row => row.id === id)!

  beforeAll(() => {
    execFileSync(process.execPath, ['--import', 'tsx/esm', join(PACKAGE_ROOT, 'scripts', 'sw-engine-acceptance.ts')], {
      cwd: REPO_ROOT, stdio: 'ignore', timeout: 240_000,
    })
    scenarios = (JSON.parse(readFileSync(join(ARTIFACTS_DIR, 'sw', 'engine-acceptance.json'), 'utf8')) as { scenarios: Scenario[] }).scenarios
  }, 280_000)

  it('S1 + SW-10 core: pasta sem git, git no PATH — "atualize o cardápio.docx": rascunho → revisar → aplicar → desfazer, pasta sem .git', () => {
    expect(byId('S1').failed).toEqual([])
    expect(byId('S1').status).toBe('pass')
  })

  it('S5: conflito (ficar com o meu / com o da persona / manter os dois) seguido de Desfazer, sem marcadores no arquivo', () => {
    for (const id of ['S5-keep_mine', 'S5-keep_persona', 'S5-keep_both']) {
      expect(byId(id).failed, id).toEqual([])
      expect(byId(id).status, id).toBe('pass')
    }
  })

  it('S4: planilha aberta durante o Aplicar — tudo ou nada (nada pela metade), funciona depois de fechar, Desfazer restaura', () => {
    expect(byId('S4').failed.filter(label => label !== ACTIONABLE_MESSAGE_CHECK)).toEqual([])
  })

  // Promoted from `it.fails` on 04/11 15:27 when Forge's engine fix landed (file_unavailable → "Feche …" with the file name).
  it('S4: o aviso diz o que fazer ("feche a planilha …"), sem esconder o erro do repositório', () => {
    expect(byId('S4').failed).not.toContain(ACTIONABLE_MESSAGE_CHECK)
    expect(byId('S4').status).toBe('pass')
  })

  it.todo('S2: pasta sem git e SEM git no PATH usa o git embutido (SW-4 Rivet: MinGit + injeção do git/fileOps no harness)')
  it.todo('S3: pasta no OneDrive — arquivo só online é hidratado antes de copiar (SW-5 Rivet: simulação do placeholder)')
  it.todo('SW-9 host/UI: os mesmos cenários pelo app real (Revisar em linguagem simples, Aplicar, Desfazer, escolha de conflito) — SW-6 Anvil + SW-8 Lumen')
  it.todo('SW-10: perfil limpo no exe instalado, usuário sem git, pasta de documentos, "atualize o cardápio.docx": nenhuma palavra técnica na tela e a pasta continua sem .git')
})
