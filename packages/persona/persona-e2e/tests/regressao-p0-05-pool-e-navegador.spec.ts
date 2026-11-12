/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-05: o pool de runners devolvia, na 2ª Tarefa, o runner da 1ª com o `PermissionGate` HTTP já
 * FECHADO (a chave do pool não tinha o gate nem o navegador: o hook do CLI recebia ECONNREFUSED, que o Claude trata como erro não-bloqueante, e o porteiro de comandos/rascunho sumia),
 * e revogar o perfil do navegador de uma persona não despejava o runner quente dela (ela seguia com `mcp__browser__*` ligado ao Chrome).
 *
 * ESTADO: CORRIGIDO na árvore depois da auditoria (12/11 ~03:30: a chave do pool passou a levar `gate` e `browser`; `revokeBrowserProfile`/`closeBrowserProfile` passaram a chamar
 * `evictBrowserRunners`). Estes testes foram escritos para reproduzir o bug e ficaram NORMAIS: regressão permanente. Sem IA, sem Chrome, sem CLI:
 *   A  `resolveRunner` com um pool de mentira que só registra a chave pedida: gates diferentes → chaves diferentes; navegador ligado/desligado → chaves diferentes; as MESMAS opções → a
 *      mesma chave (o reuso quente da mesma Tarefa continua valendo);
 *   B  o host em processo: revogar o perfil de uma persona despeja os runners quentes dela em todos os projetos, e só os dela.
 */
import { resolveRunner, type PermissionGate, type ResolveRunnerOptions, type Runner } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it as vitestIt } from 'vitest'
import { SCOPE, it, openJourneyFile, seedJourney } from '../../persona-host/tests/journeys/journey-host.ts'

/** O veredito, PURO, da chave do pool: o que mudou entre as duas Tarefas tem de mudar a chave; o que não mudou não pode (vazio = certo). */
export function poolKeyProblems(first: string, second: string, options: { readonly differs: boolean; readonly what: string }): string[] {
  if (options.differs && first === second) return [`${options.what}: a chave do pool é a MESMA (${first.slice(0, 60)}…): o runner da Tarefa anterior seria devolvido`]
  if (!options.differs && first !== second) return [`${options.what}: as opções são iguais e a chave mudou: o reuso quente da mesma Tarefa foi perdido`]
  return []
}

describe('P0-05 — a chave do pool leva o que o runner foi aberto com (veredito do cenário, puro)', () => {
  it('acusa a chave igual quando devia mudar e a chave diferente quando devia ficar; o certo passa', () => {
    expect(poolKeyProblems('a|gate1', 'a|gate2', { differs: true, what: 'gate' })).toEqual([])
    expect(poolKeyProblems('a|x', 'a|x', { differs: true, what: 'gate' })).toHaveLength(1)
    expect(poolKeyProblems('a|x', 'a|x', { differs: false, what: 'mesma Tarefa' })).toEqual([])
    expect(poolKeyProblems('a|x', 'a|y', { differs: false, what: 'mesma Tarefa' })).toHaveLength(1)
  })
})

const hit = { name: 'runner-em-cache' } as unknown as Runner

/** The key `resolveRunner` asks the pool for, with a pool that answers every key with a hit (nothing is built, no CLI starts). */
async function keyAskedFor(extra: Partial<ResolveRunnerOptions>): Promise<string> {
  const keys: string[] = []
  const pool = { get: (key: string) => { keys.push(key); return hit }, touch: () => undefined, set: () => undefined, delete: () => undefined, disposeAll: () => Promise.resolve() }
  const options = {
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
    permissionMode: 'allow-once',
    personId: 'ana', projectId: 'pp', usageScope: { personaId: 'bia', projectId: 'pp' },
    pool,
    ...extra,
  } as unknown as ResolveRunnerOptions
  const got = await resolveRunner(options)
  expect(got, 'o pool de mentira devolve o runner em cache').toBe(hit)
  expect(keys).toHaveLength(1)
  return keys[0]!
}
const gateAt = (url: string): PermissionGate => ({ url, settings: () => ({}) }) as unknown as PermissionGate

describe('P0-05 A — resolveRunner não devolve o runner de outra Tarefa (pool de mentira, 0 IA)', () => {
  vitestIt('gates diferentes (a 2ª Tarefa abriu o seu servidor de hook) → chaves diferentes', async () => {
    const first = await keyAskedFor({ permissionGate: gateAt('http://127.0.0.1:41001/hook') })
    const second = await keyAskedFor({ permissionGate: gateAt('http://127.0.0.1:41002/hook') })
    expect(poolKeyProblems(first, second, { differs: true, what: 'gate da Tarefa 1 × gate da Tarefa 2' })).toEqual([])
  })
  vitestIt('com e sem o navegador da persona → chaves diferentes (o runner com o Chrome ligado não vai para quem não o tem)', async () => {
    const withoutBrowser = await keyAskedFor({})
    const withBrowser = await keyAskedFor({ carriesBrowser: true })
    expect(poolKeyProblems(withoutBrowser, withBrowser, { differs: true, what: 'sem navegador × com navegador' })).toEqual([])
  })
  vitestIt('as MESMAS opções (a mesma Tarefa, o mesmo gate) → a mesma chave: o reuso quente continua', async () => {
    const first = await keyAskedFor({ permissionGate: gateAt('http://127.0.0.1:41001/hook'), carriesBrowser: true })
    const again = await keyAskedFor({ permissionGate: gateAt('http://127.0.0.1:41001/hook'), carriesBrowser: true })
    expect(poolKeyProblems(first, again, { differs: false, what: 'mesma Tarefa' })).toEqual([])
  })
})

describe('P0-05 B — revogar o perfil do navegador despeja o runner quente da persona (host em processo, 0 IA)', () => {
  it('revogar o perfil da Nina despeja os runners quentes DELA em todos os projetos e não toca os da Bia', () => {
    // A host on a FILE database keeps its browser profiles in its own temp folder; one on a memory database shares a fixed folder of the OS temp dir between every test and every run
    // (a profile created here would be found by the next run and by the browser specs of other owners).
    const h = openJourneyFile()
    seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }, { id: 'bia', name: 'Bia', title: 'Texto' }])
    const profile = h.browser.service.create('Loja')
    h.browser.service.grant('nina', profile.id)
    h.browser.service.grant('bia', profile.id)
    const evicted: string[] = []
    h.orchestration.evictWarmRunners = (projectId: string, personaId: string): number => { evicted.push(`${projectId}:${personaId}`); return 1 }
    h.revokeBrowserProfile({ ...SCOPE, personaId: 'nina', profileId: profile.id })
    expect(evicted, 'o runner quente da Nina ainda tem o Chrome ligado').toEqual(expect.arrayContaining(['pp:nina']))
    expect(evicted.some(entry => entry.endsWith(':bia')), 'a Bia não revogou nada').toBe(false)
    expect(h.browser.service.granted('nina', profile.id)).toBe(false)
    expect(h.browser.service.granted('bia', profile.id)).toBe(true)
  })
})
