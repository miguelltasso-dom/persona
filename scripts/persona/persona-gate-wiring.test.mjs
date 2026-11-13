// node --test scripts/persona/persona-gate-wiring.test.mjs
// O gate e o pre-push não rodam em teste (levam minutos); este teste prende a FIAÇÃO: se alguém tirar um passo, o teste reprova (Carbon P2-01: os gates de conteúdo tinham ficado de fora).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const gate = readFileSync(join(HERE, 'persona-gate.mjs'), 'utf8')
const prePush = readFileSync(join(HERE, 'pre-push.mjs'), 'utf8')
const at = (text, needle) => { const index = text.indexOf(needle); assert.ok(index >= 0, `não achei: ${needle}`); return index }

test('persona-gate: fecho do HEAD, sala limpa (nomes estritos) e lint com baseline rodam ANTES do selo, e o selo diz que rodaram', () => {
  const closure = at(gate, "'scripts/persona/check-head-closure.mjs'")
  const cleanroom = at(gate, "contentGate('cleanroom', 'scripts/persona/check-cleanroom.mjs', ['--strict-names'], true)")
  const lint = at(gate, "contentGate('lint', 'scripts/persona/check-lint-staged.mjs', ['--baseline', 'scripts/persona/lint-baseline.json']")
  const stamp = at(gate, 'persona-gate-ok.json\'), JSON.stringify')
  assert.ok(closure < cleanroom && cleanroom < lint && lint < stamp, 'a ordem é: fecho, sala limpa, lint, selo')
  assert.match(gate, /content: true/u)
  // o lint só deixa de bloquear com PERSONA_LINT_GATE=warn (escolha explícita); a sala limpa SEMPRE bloqueia
  assert.match(gate, /process\.env\.PERSONA_LINT_GATE !== 'warn'/u)
  assert.match(gate, /if \(blocking\) failing\.add\(name\)/u)
  // a base é o que já foi publicado, nunca "HEAD" (um diff contra o próprio HEAD é vazio e não checa nada)
  assert.match(gate, /origin\/persona-dev/u)
  assert.doesNotMatch(gate, /PERSONA_GATE_BASE \?\? 'HEAD'\)/u)
})

test('persona-gate: o typecheck COMPLETO (agregado do host na raiz, que cobre os specs do host) roda em TODA execução, antes do selo; só PERSONA_GATE_FULL_TYPECHECK=0 o desliga (paridade com o pack)', () => {
  // TS2551 em tests/boot-recovery-waits-engine.host.spec.ts chegou ao pack do S3 porque o check-pkg não olha os specs do host e o gate só rodava o agregado com --installer (Keel 12/11 19:31).
  assert.match(gate, /const fullTypecheck = installerMode \|\| process\.env\.PERSONA_GATE_FULL_TYPECHECK !== '0'/u)
  assert.match(gate, /if \(fullTypecheck && failing\.size === 0\)/u)
  assert.doesNotMatch(gate, /if \(installerMode && failing\.size === 0\)/u, 'o agregado não pode voltar a depender só do --installer')
  assert.match(gate, /run\('pnpm', \['run', 'typecheck'\]/u)
  assert.ok(at(gate, "run('pnpm', ['run', 'typecheck']") < at(gate, "persona-gate-ok.json'), JSON.stringify"), 'o typecheck completo vem antes do selo')
})

test('pre-push: roda o fecho do HEAD sempre e só aceita selo com `content: true` (selo antigo não vale)', () => {
  assert.ok(at(prePush, 'check-head-closure.mjs') < at(prePush, 'persona-gate-ok.json'), 'o fecho vem antes de olhar o selo')
  assert.match(prePush, /stamp\.content === true/u)
})

test('o baseline do lint existe, é um JSON com `allow` por arquivo e regra, e a dívida só tem erros com número positivo', () => {
  const baseline = JSON.parse(readFileSync(join(HERE, 'lint-baseline.json'), 'utf8'))
  assert.equal(typeof baseline.allow, 'object')
  for (const [file, rules] of Object.entries(baseline.allow)) {
    assert.ok(file.length > 0)
    for (const [rule, count] of Object.entries(rules)) assert.ok(rule.length > 0 && Number.isInteger(count) && count > 0, `${file} ${rule}`)
  }
})
