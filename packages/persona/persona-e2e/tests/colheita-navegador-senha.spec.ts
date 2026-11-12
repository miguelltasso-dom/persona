/**
 * COLHEITA itens 17 e 15b, cenário RED pelo HOST (0 IA, sem Chrome): "persona sem grant não abre o navegador" e "a senha nunca aparece no resultado".
 *
 *   A (item 17)  o serviço do navegador (`BrowserService`) com um lançador de mentira: a persona SEM grant leva `BrowserDeniedError('sem-perfil')` e NENHUM Chrome é lançado; a que tem
 *                grant abre, e enquanto ela segura o perfil a sem grant continua de fora.
 *   B (item 15b) a porta `browser_login` (`BrowserLoginPorts`) com um Cofre de mentira: sem navegador aberto a senha nem é LIDA; com ele, a resposta é uma frase e a máscara fica armada.
 *
 * ACEITE do Keel (12/11 01:11): o cenário REPROVA num stub defeituoso e PASSA no produto. Defeituosos: um serviço que libera o perfil para qualquer persona (A) e uma digitação
 * descuidada que escreve a senha na frase que devolve (B). A lacuna que o Probe achou em B (a porta devolvia a frase da digitação sem filtrar e `SecretMask.redact` não era chamado em
 * nenhuma saída do host) foi fechada no P0-02: o teste da defesa em profundidade é normal e passa no produto.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SecretMask } from '../../persona-host/src/browser/blind-typing.ts'
import type { ChromeInstall } from '../../persona-host/src/browser/chrome.ts'
import type { ChromeSession } from '../../persona-host/src/browser/launch.ts'
import { BrowserLoginPorts } from '../../persona-host/src/browser/login-port.ts'
import type { CofreLoginEntry } from '../../persona-host/src/browser/login-tool.ts'
import { BrowserDeniedError, BrowserService, type BrowserDenial } from '../../persona-host/src/browser/service.ts'
import type { HarnessIdentity } from '../../persona-host/src/harness-routines.ts'

const scratch = mkdtempSync(join(tmpdir(), 'colheita-navegador-'))
afterAll(() => { rmSync(scratch, { recursive: true, force: true }) })

// ══ A — sem grant, sem navegador ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
interface BrowserObservation {
  /** What happened to the persona WITHOUT a grant: `undefined` = the browser opened for her. */
  readonly deniedWith: BrowserDenial | undefined
  readonly opened: boolean
  /** How many Chromes were launched in all. */
  readonly launches: number
  /** The persona WITH a grant could open it. */
  readonly grantedOpened: boolean
}

/** O veredito, PURO: todo motivo para dizer que o navegador abriu para quem não podia (vazio = o produto está certo). */
export function browserProblems(seen: BrowserObservation): string[] {
  const out: string[] = []
  if (seen.opened) out.push('a persona SEM grant abriu o navegador')
  if (seen.deniedWith !== 'sem-perfil') out.push(`a recusa devia ser "sem-perfil" e foi ${JSON.stringify(seen.deniedWith ?? null)}`)
  if (seen.launches !== 1) out.push(`só a persona com grant devia lançar um Chrome (1) e foram ${String(seen.launches)}`)
  if (!seen.grantedOpened) out.push('a persona COM grant não conseguiu abrir o navegador')
  return out
}

/** Um serviço que libera qualquer perfil para qualquer persona: o defeito que o cenário tem de acusar. */
class OpenToEveryoneService extends BrowserService {
  override granted(): boolean { return true }
}

async function personaWithoutGrantTriesTheBrowser(Service: typeof BrowserService = BrowserService): Promise<BrowserObservation> {
  const launches: string[] = []
  const service = new Service({
    dataRoot: scratch,
    chrome: (): ChromeInstall => ({ path: 'C:\\chrome-de-mentira\\chrome.exe', version: '1' }),
    launch: (input): Promise<ChromeSession> => { launches.push(input.profileDir); return Promise.resolve({ port: 9222, pid: 1, version: 'fake', close: () => Promise.resolve() }) },
  })
  const profile = service.create('Loja')
  service.grant('teo', profile.id) // só o Téo recebeu o perfil
  // the persona WITHOUT a grant asks FIRST, while nobody holds the profile: only the grant can stop her (once someone holds it, the turn lock stops her too, which would hide a broken grant)
  let deniedWith: BrowserDenial | undefined
  let opened = false
  try {
    await service.sessionFor('bia', 'Loja')
    opened = true
  } catch (error) {
    if (!(error instanceof BrowserDeniedError)) throw error
    deniedWith = error.why
  }
  // the persona WITH the grant opens it. With a broken grant she may find the profile already held: she then does not open it, and that is not what the scenario measures.
  await service.closeAll()
  const granted = await service.sessionFor('teo', 'Loja').then(() => true, () => false)
  await service.closeAll()
  return { deniedWith, opened, launches: launches.length, grantedOpened: granted }
}

describe('17 — persona sem grant não abre o navegador (cenário pelo host, 0 IA)', () => {
  it('PRODUTO: a sem grant leva "sem-perfil" e nenhum Chrome sobe por ela; a com grant abre', async () => {
    const seen = await personaWithoutGrantTriesTheBrowser()
    expect(browserProblems(seen)).toEqual([])
    expect(seen).toMatchObject({ deniedWith: 'sem-perfil', opened: false, launches: 1, grantedOpened: true })
  })

  it('STUB DEFEITUOSO (um serviço que libera o perfil para qualquer persona): a sem grant ABRE e o veredito do cenário ACUSA', async () => {
    const seen = await personaWithoutGrantTriesTheBrowser(OpenToEveryoneService)
    expect(seen.opened, 'o defeito é real: a persona sem grant abriu').toBe(true)
    const reasons = browserProblems(seen)
    expect(reasons.length).toBeGreaterThanOrEqual(1)
    expect(reasons.join('\n')).toMatch(/SEM grant abriu/u)
  })

  it('o veredito acusa cada defeito sozinho e não acusa o certo', () => {
    const ok: BrowserObservation = { deniedWith: 'sem-perfil', opened: false, launches: 1, grantedOpened: true }
    expect(browserProblems(ok)).toEqual([])
    expect(browserProblems({ ...ok, opened: true, deniedWith: undefined, launches: 2 })).toHaveLength(3)
    expect(browserProblems({ ...ok, deniedWith: 'sem-vez' })).toHaveLength(1)
    expect(browserProblems({ ...ok, grantedOpened: false })).toHaveLength(1)
  })
})

// ══ B — a senha nunca aparece ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const PASSWORD = 'Padaria#Lua-2026'
const ENTRY: CofreLoginEntry = { id: 'login-gmail', title: 'Gmail da loja', site: 'https://mail.example.test', username: 'loja@example.test' }
const WHO = { personaId: 'bia', projectId: 'pp', ticketId: 't1' } as unknown as HarnessIdentity

interface PasswordObservation {
  /** How many times the sealed password was READ from the Cofre. */
  readonly reads: number
  /** What the model gets back, as JSON. */
  readonly result: string
  /** The host's mask is armed for the password after a read. */
  readonly masked: boolean
}

/** O veredito, PURO: todo motivo para dizer que a senha vazou ou foi lida à toa (vazio = certo). */
export function passwordProblems(seen: PasswordObservation, options: { readonly browserOpen: boolean }): string[] {
  const out: string[] = []
  if (seen.result.includes(PASSWORD)) out.push('a senha apareceu no resultado devolvido ao modelo')
  if (!options.browserOpen && seen.reads > 0) out.push('a senha foi lida do Cofre sem navegador aberto')
  if (options.browserOpen && !seen.masked) out.push('a senha foi lida e a máscara do host não ficou armada')
  return out
}

async function loginThroughThePort(options: { readonly live: boolean; readonly line: (secret: string) => string }): Promise<PasswordObservation> {
  let reads = 0
  const mask = new SecretMask()
  const ports = new BrowserLoginPorts({
    liveSessionOf: () => (options.live ? { port: 9222 } : undefined),
    loginsOf: () => [ENTRY],
    secretOf: () => { reads += 1; return Promise.resolve(PASSWORD) },
    mask,
    now: () => 1_000,
    type: ({ password }) => Promise.resolve({ typed: true, line: options.line(password) }),
  })
  const result = await ports.open(WHO, { login: 'Gmail da loja', ticketId: 't1' })
  return { reads, result: JSON.stringify(result), masked: mask.redact(`a senha é ${PASSWORD}`, 2_000) !== `a senha é ${PASSWORD}` }
}

/** The sentence the product's own typing answers with (`blindLogin`): words only, never the value. */
const PRODUCT_LINE = (): string => `digitei a senha de ${ENTRY.title} na página; confira e conclua o login`

describe('15b — a senha nunca aparece no resultado e nem é lida sem navegador (cenário pelo host, 0 IA)', () => {
  it('sem navegador aberto (persona sem grant não tem sessão) a porta recusa e a senha NEM É LIDA', async () => {
    const seen = await loginThroughThePort({ live: false, line: PRODUCT_LINE })
    expect(seen.reads).toBe(0)
    expect(seen.result).toMatch(/"ok":false.*unavailable/u)
    expect(passwordProblems(seen, { browserOpen: false })).toEqual([])
  })

  it('PRODUTO: com o navegador aberto a resposta é uma frase, sem a senha, e a máscara do host fica armada', async () => {
    const seen = await loginThroughThePort({ live: true, line: PRODUCT_LINE })
    expect(seen.reads).toBe(1)
    expect(seen.result).toMatch(/digitei a senha de Gmail da loja/u)
    expect(passwordProblems(seen, { browserOpen: true })).toEqual([])
  })

  it('STUB DEFEITUOSO (uma porta que devolve a frase da digitação como veio, com a senha dentro) mostra o que o veredito acusa', () => {
    // Depois do P0-02 a porta do produto não deixa mais a frase da digitação passar; o veredito continua provado contra uma observação feita à mão, de uma porta que a deixasse.
    const seen: PasswordObservation = { reads: 1, result: JSON.stringify({ ok: true, typed: true, message: `digitei ${PASSWORD} na página` }), masked: true }
    const reasons = passwordProblems(seen, { browserOpen: true })
    expect(reasons.join('\n')).toMatch(/senha apareceu no resultado/u)
  })

  // LACUNA fechada (Carbon P0-02, Lumen, 12/11): a porta monta a frase ela mesma (nunca repassa o texto da digitação) e passa o que sobra pela máscara. Era `it.fails`; agora é teste normal.
  it('DEFESA EM PROFUNDIDADE: mesmo com uma digitação descuidada o resultado devolvido ao modelo não leva a senha', async () => {
    const seen = await loginThroughThePort({ live: true, line: secret => `digitei ${secret} na página` })
    expect(passwordProblems(seen, { browserOpen: true })).toEqual([])
  })
})
