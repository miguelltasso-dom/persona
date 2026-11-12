#!/usr/bin/env node
/**
 * SEED LOCAL do Ember (Probe): um host de teste REAL, 0 IA, com (1) o #geral com uma conversa e um GRUPO de 3 mensagens seguidas, (2) uma ENTREGA em revisão com o "Aceitar" pendente e (3) o cartão do 2FA com o SITE.
 *
 *   node scripts/persona/seed-ember.mjs                    semeia em packages/persona/persona-e2e/artifacts/seed-ember/home
 *   node scripts/persona/seed-ember.mjs --out <pasta>      semeia em <pasta>/home (proof.json, ui.json e as capturas ficam em <pasta>)
 *
 * Roda a spec `tests/seed-ember.spec.ts` pela trava build (sobe o host e o Chrome; ~3-5 min) e imprime como o Ember liga. O estado está no BANCO do host (nada de mock de cliente).
 * Como o Ember liga (no lugar de `openRealPersonaApp`, mesmo retorno):
 *   import { openSeededEmberApp, copySeededHome } from '<persona-e2e>/src/seed-ember.ts'
 *   const session = await openSeededEmberApp({ home: copySeededHome('<pasta>/home', '<pasta-do-lote>/home') })   // UMA cópia por lote de capturas: o host muda o banco
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const out = resolve(outIndex >= 0 && args[outIndex + 1] !== undefined ? args[outIndex + 1] : resolve(root, 'packages', 'persona', 'persona-e2e', 'artifacts', 'seed-ember'))
const home = resolve(out, 'home')

const run = spawnSync(process.execPath, [
  resolve(root, 'scripts', 'persona', 'with-lock.mjs'), 'Probe seed Ember', '--lock', 'build', '--wait-max', '3600000', '--',
  // The lock runs the command through a shell WITHOUT quoting: plain `node` and repo-relative paths (cwd = root).
  'node', 'scripts/persona/run-persona-e2e-vitest.mjs', 'packages/persona/persona-e2e/tests/seed-ember.spec.ts',
], { cwd: root, stdio: 'inherit', env: { ...process.env, PERSONA_E2E: '1', PERSONA_SEED: '1', PERSONA_SEED_HOME: home } })

if ((run.status ?? 1) === 0) {
  process.stdout.write(`\nSEED PRONTO em ${home}\n  prova: ${resolve(out, 'proof.json')} · tela: ${resolve(out, 'ui.json')} + geral.png, 2fa.png, entrega.png\n`
    + '  como ligar: openSeededEmberApp({ home: copySeededHome(<home>, <pasta-do-lote>) }) de packages/persona/persona-e2e/src/seed-ember.ts (no lugar de openRealPersonaApp)\n')
}
process.exit(run.status ?? 1)
