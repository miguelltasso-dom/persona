/**
 * D-113, revisão interna (Lumen, 12/11): a tabela `SURFACE_REMOTES` é escrita à mão, por NOME. Um `@Remote` novo cujo corpo toca uma superfície desligada (convite, estação, canais, importação de
 * skills) mas que não está na tabela — e não chama `requireSurface` — passaria pelo funil do RemoteGuard sem ser recusado. Este teste lê o `index.ts` do host, acha cada `@Remote` que usa um dos
 * módulos das superfícies e exige que ele esteja na tabela ou se proteja por dentro. Hoje: verde (a varredura achou 38 chamadas, todas cobertas). Vermelho no dia em que alguém criar uma
 * chamada nova que contorne a tabela.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SURFACE_REMOTES } from '../src/surface-gates.ts'

const SOURCE = readFileSync(resolve(process.cwd(), 'packages/persona/persona-host/src/index.ts'), 'utf8').replace(/\r/gu, '')
/** The members of the host that ARE the surfaces under construction (invite, station, channels, skillImport) plus the persona sheets (invite). */
const SURFACE_MEMBERS = /this\.(?:remoteTeam|station|channelDirectory|skillImport|personaSheets)\b/u
/** The calls that still belong to the core and only READ a surface member to answer "is it connected?": none today; add by name with a reason. */
const CORE_EXCEPTIONS: ReadonlySet<string> = new Set()

interface RemoteBody { readonly name: string; readonly line: number; readonly body: string }

function remoteBodies(): readonly RemoteBody[] {
  const lines = SOURCE.split('\n')
  const found: RemoteBody[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*@Remote\b/u.test(lines[i]!)) continue
    let head = i + 1
    while (head < lines.length && !/^ {2}(?:async\s+)?(?:public\s+)?\w+\s*[(<]/u.test(lines[head]!)) head += 1
    const name = /^ {2}(?:async\s+)?(?:public\s+)?(\w+)/u.exec(lines[head] ?? '')?.[1]
    let end = head + 1
    while (end < lines.length && !/^ {2}\}\s*$/u.test(lines[end]!)) end += 1
    if (name !== undefined) found.push({ name, line: head + 1, body: lines.slice(head, end + 1).join('\n') })
  }
  return found
}

describe('D-113: nenhum @Remote toca uma superfície desligada sem estar na tabela do funil', () => {
  const remotes = remoteBodies()

  it('a varredura enxerga o host (centenas de chamadas) e as das superfícies', () => {
    expect(remotes.length).toBeGreaterThan(300)
    expect(remotes.filter(row => SURFACE_MEMBERS.test(row.body)).length).toBeGreaterThanOrEqual(30)
  })

  it('cada chamada que usa o convite, a estação, os canais ou a importação de skills está em SURFACE_REMOTES ou chama requireSurface por dentro', () => {
    const loose = remotes
      .filter(row => SURFACE_MEMBERS.test(row.body))
      .filter(row => !Object.hasOwn(SURFACE_REMOTES, row.name) && !/this\.requireSurface\(/u.test(row.body) && !CORE_EXCEPTIONS.has(row.name))
      .map(row => `${row.name} (index.ts:${String(row.line)})`)
    expect(loose, `chamada(s) que tocam uma superfície em construção sem passar pela tabela do funil: ${loose.join(', ')}`).toEqual([])
  })

  it('o contrário: toda chamada da tabela existe no host (um nome que sobrou na tabela protege nada)', () => {
    const names = new Set(remotes.map(row => row.name))
    const missing = Object.keys(SURFACE_REMOTES).filter(name => !names.has(name))
    expect(missing, `nome(s) na tabela sem @Remote no host: ${missing.join(', ')}`).toEqual([])
  })
})
