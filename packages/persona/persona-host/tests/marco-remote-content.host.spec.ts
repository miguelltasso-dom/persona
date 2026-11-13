import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { OWNER_DEVICE_ONLY, PHONE_PLANNED, PHONE_READS, PHONE_WITHHELD, PHONE_WRITES } from '../src/remote-web/phone-allow.ts'

/**
 * M5 e2e remoto, R2c (Gauge 16:1x, em staging): NENHUMA leitura permitida ao celular devolve identidade de conta, segredo ou corpo de Cofre. Leitura ESTÁTICA do contrato de cada Remote permitido:
 * o tipo de retorno (e os tipos que ele carrega, até 4 níveis) não pode ter campo com nome de identidade/segredo, e um `body` só pode estar num tipo de CONVERSA (mensagem), nunca num tipo de Cofre/contexto.
 * Nasceu de 2 achados reais do R1/R2 (getOfficialQuota: e-mail da conta do dono; getTurnContext: corpo do Cofre), que o Bolt retirou da lista (PHONE_WITHHELD). Qualquer campo novo do mesmo tipo entra aqui sozinho.
 * Heurística de NOMES de campo (não prova o conteúdo): o que ela aponta é lista de revisão para o dono do Remote e o Lumen, cada exceção com motivo em EXPECTED.
 */
const HOST_SRC = resolve(__dirname, '../src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => { const full = join(dir, name); return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [] })
}

interface Field { readonly name: string; readonly type: string }
function interfacesOf(text: string, into: Map<string, Field[]>): void {
  const head = /export (?:interface|type) (\w+)(?:<[^>{]*>)?(?: extends ([^{]+))? ?=? ?\{/gu
  for (let match = head.exec(text); match !== null; match = head.exec(text)) {
    let depth = 1
    let at = head.lastIndex
    while (at < text.length && depth > 0) { const char = text[at]; if (char === '{') depth += 1; else if (char === '}') depth -= 1; at += 1 }
    const body = text.slice(head.lastIndex, at - 1)
    const fields: Field[] = []
    for (const line of body.split(/\r?\n/u)) {
      const field = /^\s*(?:readonly )?(\w+)\??:\s*(.+?)[;,]?\s*$/u.exec(line)
      if (field?.[1] !== undefined && field[2] !== undefined) fields.push({ name: field[1], type: field[2] })
    }
    const parents = (match[2] ?? '').match(/[A-Z]\w+/gu) ?? []
    for (const parent of parents) fields.push({ name: `...${parent}`, type: parent })
    into.set(match[1] ?? '', [...(into.get(match[1] ?? '') ?? []), ...fields])
  }
}

const SKIP_TYPES = new Set(['Promise', 'AsyncIterable', 'AsyncGenerator', 'Readonly', 'Array', 'Record', 'Partial', 'Omit', 'Pick', 'ReadonlyArray', 'Date', 'Map', 'Set', 'String', 'Number', 'Boolean'])
const SENSITIVE_NAME = /^(email|e-?mail|accountId|accountLabel|accessToken|refreshToken|idToken|token|secret|password|passphrase|credential|credentials|cookie|apiKey|authorization|bearer|login)$|(Secret|Password|ApiKey|Token|Cookie)$/iu
const VAULT_TYPE = /UsedContext|Cofre|Vault|Memory|Secret|Credential/iu

it('R2c: nenhuma leitura PERMITIDA ao celular devolve campo de identidade de conta, de segredo ou o CORPO de um tipo de Cofre/contexto (lista de revisão; cada exceção com motivo)', () => {
  const types = new Map<string, Field[]>()
  const sources = files(HOST_SRC)
  for (const file of sources) interfacesOf(readFileSync(file, 'utf8'), types)
  expect(types.size, 'a leitura dos tipos do host veio vazia: o teste não prova nada').toBeGreaterThan(300)

  const index = readFileSync(join(HOST_SRC, 'index.ts'), 'utf8').split(/\r?\n/u)
  const returns = new Map<string, string>()
  for (let line = 1; line < index.length; line += 1) {
    if (index[line - 1]?.trim() !== '@Remote') continue
    const sig = /^\s*(?:async )?(\w+)\((.*)\)(?:: (.+?))? \{$/u.exec(index[line] ?? '')
    if (sig?.[1] !== undefined) returns.set(sig[1], sig[3] ?? '')
  }
  expect(returns.size, 'achou os Remotes de index.ts').toBeGreaterThan(300)

  const allowed = [...PHONE_READS, ...PHONE_WRITES, ...OWNER_DEVICE_ONLY].filter(name => !PHONE_PLANNED.includes(name) && !(name in PHONE_WITHHELD))
  const flagged: string[] = []
  const walk = (typeName: string, via: string, seen: Set<string>, depth: number): void => {
    if (depth > 4 || seen.has(typeName) || SKIP_TYPES.has(typeName)) return
    seen.add(typeName)
    for (const field of types.get(typeName) ?? []) {
      const here = `${via} > ${typeName}.${field.name}`
      if (field.name.startsWith('...')) { walk(field.type, via, seen, depth + 1); continue }
      if (SENSITIVE_NAME.test(field.name)) flagged.push(here)
      if (field.name === 'body' && VAULT_TYPE.test(typeName)) flagged.push(here)
      for (const inner of field.type.match(/[A-Z]\w+/gu) ?? []) walk(inner, via, seen, depth + 1)
    }
  }
  const unseen: string[] = []
  for (const name of allowed) {
    const ret = returns.get(name)
    if (ret === undefined) { unseen.push(name); continue }
    const seen = new Set<string>()
    for (const typeName of ret.match(/[A-Z]\w+/gu) ?? []) walk(typeName, name, seen, 0)
  }
  // Allowed names that are not (yet) found as `@Remote` in index.ts are the planned ones (checked by the R2 specs); here only a quick sanity:
  expect(unseen.length, `nomes permitidos sem assinatura encontrada: ${unseen.join(', ')}`).toBeLessThan(allowed.length / 2)

  // campo apontado -> motivo (cada exceção revisada por leitura do código; o `login` é o login do Tailscale de quem pareia, que o Bolt acrescentou ao pareamento)
  const EXPECTED: Readonly<Record<string, string>> = {
    'listComputers > ComputerRequestRow.login': 'o login de quem PEDE para entrar é o do dono, no PC: para um aparelho pareado a resposta sai com `requests: []` (index.ts, resposta de listComputers com currentCaller()?.kind === "paired")',
    'listDevices > DeviceView.login': 'listDevices só é permitida ao aparelho do DONO (OWNER_DEVICE_ONLY): é o dono vendo os próprios aparelhos pareados e o login do tailnet de cada um (perdi o celular: reviso pelo notebook)',
  }
  const unexplained = [...new Set(flagged)].filter(item => !Object.keys(EXPECTED).some(key => item.includes(key)))
  expect(unexplained, 'leituras permitidas ao celular cujo retorno tem campo de identidade/segredo/corpo de Cofre (revisar com o dono do Remote e o Lumen; se for legítimo, entra em EXPECTED com o motivo)').toEqual([])
})

it('R2c CONTROLE: o detector funciona: as leituras que o Bolt retirou (PHONE_WITHHELD) SÃO apontadas pela mesma varredura (senão "nada achado" não prova nada)', () => {
  const types = new Map<string, Field[]>()
  for (const file of files(HOST_SRC)) interfacesOf(readFileSync(file, 'utf8'), types)
  const index = readFileSync(join(HOST_SRC, 'index.ts'), 'utf8').split(/\r?\n/u)
  const returns = new Map<string, string>()
  for (let line = 1; line < index.length; line += 1) {
    if (index[line - 1]?.trim() !== '@Remote') continue
    const sig = /^\s*(?:async )?(\w+)\((.*)\)(?:: (.+?))? \{$/u.exec(index[line] ?? '')
    if (sig?.[1] !== undefined) returns.set(sig[1], sig[3] ?? '')
  }
  const hits: string[] = []
  const walk = (typeName: string, via: string, seen: Set<string>, depth: number): void => {
    if (depth > 4 || seen.has(typeName) || SKIP_TYPES.has(typeName)) return
    seen.add(typeName)
    for (const field of types.get(typeName) ?? []) {
      if (field.name.startsWith('...')) { walk(field.type, via, seen, depth + 1); continue }
      if (SENSITIVE_NAME.test(field.name) || (field.name === 'body' && VAULT_TYPE.test(typeName))) hits.push(`${via} > ${typeName}.${field.name}`)
      for (const inner of field.type.match(/[A-Z]\w+/gu) ?? []) walk(inner, via, seen, depth + 1)
    }
  }
  for (const name of ['getOfficialQuota', 'getTurnContext']) for (const typeName of (returns.get(name) ?? '').match(/[A-Z]\w+/gu) ?? []) walk(typeName, name, new Set(), 0)
  expect(hits.some(item => item.startsWith('getOfficialQuota') && /accountLabel|accountId/u.test(item)), `getOfficialQuota deveria apontar accountLabel/accountId; achou: ${hits.join(' | ')}`).toBe(true)
  expect(hits.some(item => item.startsWith('getTurnContext') && /UsedContextRecord\.body/u.test(item)), `getTurnContext deveria apontar UsedContextRecord.body; achou: ${hits.join(' | ')}`).toBe(true)
})
