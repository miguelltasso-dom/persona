/**
 * SEED LOCAL para o Ember (pedido do Atlas/Ember via Keel 12:01, 12/11): um host de teste REAL, 0 IA (CLI de mentira), com os três estados que o Ember precisa provar no app real — todos no BANCO do host,
 * nada de mock de cliente (`persona.devSeed.v1` é só do cliente):
 *   1  o #geral com uma CONVERSA de várias mensagens, incluindo um GRUPO de 3 mensagens seguidas da pessoa (o fio da §23: balão v5, Geist, rosto R2);
 *   2  uma ENTREGA real: a Tarefa pedida à equipe termina e fica em REVISÃO, com o cartão de entrega e o "Aceitar" ainda pendentes (a pessoa decide);
 *   3  o cartão "Precisa de um código" (2FA) com o SITE no rótulo: uma Tarefa cuja persona chamou `ask_vault_code` e espera os 6 dígitos.
 *
 * Duas funções (reutilizáveis):
 *   `seedEmberHome({ home })`        abre o app real (onboarding concluído, equipe contratada), posta como a pessoa pelo mesmo RPC do composer, ESPERA cada estado de verdade, PROVA os três e FECHA deixando o `home`
 *                                  (banco + worktrees) pronto;
 *   `openSeededEmberApp({ home })`   reabre o MESMO home (host real + CLI de mentira + Chrome com o onboarding dispensado) para o Ember rodar as receitas dele em cima do estado semeado. O host muda o banco:
 *                                  use uma CÓPIA da pasta semeada por lote de capturas (`copySeededHome`).
 * Como o Ember liga: `import { openSeededEmberApp } from '<persona-e2e>/src/seed-ember.ts'` no lugar de `openRealPersonaApp` (mesmo retorno: `{ host, page, tripwire, fakeCli, close }`), com `home: copySeededHome(<pasta semeada>, <pasta nova>)`.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Page } from 'playwright'
import type { FakeCliOptions } from './fake-cli.ts'
import { hostRpcOk } from './gauge-sb-ges.ts'
import { openRealPersonaApp, type RealPersonaSession } from './real-app-session.ts'
import { openV11Session } from './v11-app.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type HostMessage, type PersonaRow, type V11Tenant } from './v11-helpers.ts'

/** O texto que cada pedido leva: o stub reconhece estes marcadores (e só eles) para responder o que o Ember precisa ver. */
export const EMBER_TEXT = {
  hello: 'Oi, tudo bem?',
  // Conversa, não pedido: um pedido ("preciso de ajuda com…") faz a Coordenação abrir cartão e postar a linha "X assume este pedido" NO MEIO do grupo (1ª rodada, 12/11 14:51), e aí as 3 falas deixam de ser seguidas.
  group: ['Bom dia, pessoal!', 'Acordei cedo hoje por causa do frio', 'A padaria já está cheirando a pão de queijo'] as const,
  delivery: 'monte o cartaz da promoção do pão de queijo da Padaria Lua: 2 por R$ 9 de sexta a domingo',
  // "Preciso que você…": the host reads it as WORK (`wantsWork`), so the persona gets a Task turn WITH the product's tools; "entre no site…" was only chat (no Task, "no mcp server in --mcp-config", 3rd round 12/11 15:10).
  twoFactor: 'preciso que você entre no site da loja e veja os pedidos de hoje; ele vai pedir o código 2FA que chega por WhatsApp',
} as const

/** O site que o cartão do 2FA mostra no rótulo. */
export const EMBER_SITE = 'Mercado da Lia'

/** As regras do CLI de mentira do seed: o que a equipe responde e o que a persona do 2FA FAZ (chamar `ask_vault_code`, a ferramenta do produto). */
export const EMBER_ENGINE: FakeCliOptions = {
  // Um turno leva ≥ 1,5 s: as 3 falas do grupo são postadas em < 1 s e NENHUMA resposta de modelo cabe entre elas.
  turnMs: 1_500,
  rules: [
    { match: 'código 2FA que chega por WhatsApp', reply: 'Abri o pedido do código. Quando você preencher, eu sigo.' },
    { match: 'cartaz da promoção do pão de queijo', reply: 'Cartaz pronto: título "Pão de queijo em dobro!", destaque "2 por R$ 9", de sexta a domingo, pedidos pelo WhatsApp. Segue para a sua revisão.' },
    { match: 'Oi, tudo bem\\?', reply: 'Oi! Tudo bem por aqui. Como posso ajudar?' },
    // The last rule: the chat of the group (nothing above matches it) gets a short, human answer instead of the stub's default delivery text.
    { match: 'padaria já está cheirando', reply: 'Que cheirinho bom! Quando quiser me passar um pedido, é só falar.' },
  ],
  toolCalls: [
    { match: 'código 2FA que chega por WhatsApp', once: true, calls: [{ tool: 'ask_vault_code', args: { reason: 'o site da loja mandou um código de 6 dígitos por WhatsApp', login: EMBER_SITE } }] },
  ],
}

/** O que o seed leu do host quando terminou (vai para o `proof.json` e para o relato). */
export interface EmberSeedProof {
  readonly conversation: { readonly messages: number; readonly groupOfThree: string[]; readonly personaReplies: number }
  readonly delivery: { readonly personaName: string; readonly taskId: string; readonly title: string; readonly stage: string }
  readonly twoFactor: { readonly personaName: string; readonly requestId: string; readonly site: string | undefined; readonly state: string }
}

/** O veredito, PURO, do GRUPO de 3: as três falas da pessoa aparecem SEGUIDAS no fio (nenhuma linha de outro autor no meio). Vazio = certo. */
export function groupOfThreeProblems(thread: ReadonlyArray<{ readonly actorId: string; readonly body: string }>, personId: string, bodies: readonly string[]): string[] {
  const at = thread.findIndex(line => line.actorId === personId && line.body === bodies[0])
  if (at < 0) return [`a 1ª fala do grupo ("${bodies[0] ?? ''}") não está no fio`]
  const out: string[] = []
  bodies.forEach((body, index) => {
    const line = thread[at + index]
    if (line === undefined || line.actorId !== personId || line.body !== body) out.push(`a fala ${String(index + 1)} do grupo não vem logo depois da anterior (achei "${line?.body.slice(0, 40) ?? 'nada'}" de ${line?.actorId ?? 'ninguém'})`)
  })
  return out
}

/** O veredito, PURO, da entrega: a Tarefa da persona espera a REVISÃO da pessoa (nem fechada, nem andando). Vazio = certo. */
export function deliveryProblems(task: { readonly stage: string } | undefined): string[] {
  if (task === undefined) return ['a Tarefa pedida à equipe não existe']
  return task.stage === 'review' ? [] : [`a Tarefa está em "${task.stage}", não em "review" (esperando o Aceitar da pessoa)`]
}

/** O veredito, PURO, do 2FA: o pedido de código está PENDENTE e carrega o site. Vazio = certo. */
export function twoFactorProblems(request: { readonly state: string; readonly site?: string | undefined } | undefined, site: string): string[] {
  if (request === undefined) return ['nenhum pedido de código foi aberto (a persona não chamou ask_vault_code)']
  const out: string[] = []
  if (request.state !== 'pending') out.push(`o pedido de código está "${request.state}", não "pending"`)
  if (!(request.site ?? '').includes(site)) out.push(`o pedido não leva o site no rótulo (veio "${request.site ?? ''}", esperava "${site}")`)
  return out
}

interface SeededHostTask { readonly id: string; readonly title: string; readonly stage: string; readonly executor?: string }

/**
 * Opens the app with the vault's TEST cipher on: the web host has no DPAPI channel, so without it the Cofre is "not sealable" and `ask_vault_code` REFUSES (1st round, 12/11 14:51: no request was ever opened).
 * The variable is read by the host child at its start; it is put back as soon as the open returns.
 */
async function withVaultCipher<T>(open: () => Promise<T>): Promise<T> {
  const saved = process.env.PERSONA_VAULT_TEST_CIPHER
  process.env.PERSONA_VAULT_TEST_CIPHER = '1'
  try {
    return await open()
  } finally {
    if (saved === undefined) delete process.env.PERSONA_VAULT_TEST_CIPHER
    else process.env.PERSONA_VAULT_TEST_CIPHER = saved
  }
}

const SCOPE_OF = (tenant: V11Tenant): { workspaceId: string; projectId: string } => ({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })

/** Nome → persona do time sugerido (Coordenação, Atendimento, Criação, Mídia): quem recebe o cartaz e quem recebe o 2FA. */
function pickPersonas(team: readonly PersonaRow[]): { readonly maker: PersonaRow; readonly attendant: PersonaRow } {
  const byTitle = (pattern: RegExp): PersonaRow | undefined => team.find(row => pattern.test(`${row.title ?? ''} ${row.name}`))
  const maker = byTitle(/cria[cç][aã]o/iu) ?? team.find(row => !/coordena/iu.test(row.title ?? '')) ?? team[0]
  const attendant = byTitle(/atendimento/iu) ?? team.find(row => row.id !== maker?.id && !/coordena/iu.test(row.title ?? '')) ?? maker
  if (maker === undefined || attendant === undefined) throw new Error('o seed precisa de uma equipe contratada (nenhuma persona no host)')
  return { maker, attendant }
}

const lines = (messages: readonly HostMessage[]): Array<{ actorId: string; body: string }> => messages.filter(message => message.type === 'message' || message.type === 'runner').map(message => ({ actorId: message.actorId, body: message.body }))

/** Espera uma resposta de PERSONA depois da posição `after` do fio. */
async function waitReply(page: Parameters<typeof channelMessages>[0], tenant: V11Tenant, after: number, personId: string, ms = 90_000): Promise<boolean> {
  const got = await until(page, async () => (await channelMessages(page, tenant)).slice(after).some(message => message.actorId !== personId && message.body.trim() !== '' ? true : false), ms, 700)
  return got === true
}

/**
 * Semeia o `home` (banco real do host) com os três estados e os PROVA. Fecha o app e o host no fim: o `home` fica pronto para `openSeededEmberApp`.
 * @param options - `home`: a pasta que fica com o estado.
 * @returns O que foi lido do host (a prova).
 */
export async function seedEmberHome(options: { readonly home: string; readonly viewport?: { width: number; height: number } }): Promise<EmberSeedProof> {
  mkdirSync(options.home, { recursive: true })
  const v11 = await withVaultCipher(() => openV11Session({ hireTeam: true, home: options.home, engine: EMBER_ENGINE, ...(options.viewport === undefined ? {} : { viewport: options.viewport }) }))
  try {
    const { page } = v11
    const tenant = await v11Tenant(page)
    const scope = SCOPE_OF(tenant)
    const { maker, attendant } = pickPersonas(await personasOf(page, tenant))

    // 1) a conversa: "Oi", a resposta, e o GRUPO de 3 mensagens seguidas (postadas sem esperar: a resposta do stub leva ≥ 700 ms, então nada se mete no meio)
    let mark = (await channelMessages(page, tenant)).length
    await postAsPerson(page, tenant, EMBER_TEXT.hello)
    if (!await waitReply(page, tenant, mark, tenant.memberId)) throw new Error('ninguém respondeu o "Oi" no #geral')
    mark = (await channelMessages(page, tenant)).length
    for (const body of EMBER_TEXT.group) await postAsPerson(page, tenant, body)
    if (!await waitReply(page, tenant, mark + EMBER_TEXT.group.length, tenant.memberId)) throw new Error('ninguém respondeu ao grupo de 3 mensagens')

    // 2) a entrega: a equipe termina e a Tarefa espera a REVISÃO da pessoa (o Aceitar fica pendente)
    await postAsPerson(page, tenant, `@${maker.name} ${EMBER_TEXT.delivery}`)
    const review = await until(page, async () => (await hostRpcOk<SeededHostTask[]>(page, 'listTasks', scope)).find(task => /cartaz/iu.test(task.title) && task.stage === 'review'), 180_000, 1_000)

    // 3) o 2FA: a persona chama `ask_vault_code` e o pedido fica PENDENTE com o site
    await postAsPerson(page, tenant, `@${attendant.name} ${EMBER_TEXT.twoFactor}`)
    const code = await until(page, async () => (await hostRpcOk<Array<{ id: string; state: string; site?: string }>>(page, 'listCofreCodes', scope)).find(row => row.state === 'pending'), 75_000, 1_000)

    const thread = lines(await channelMessages(page, tenant))
    // Diagnosis (1st round, 12/11 14:51: no request was ever opened and nothing said why): what the stub did with the tool and what the host kept.
    if (code === undefined) {
      const stub = v11.session.fakeCli.invocations().filter(call => call.event === 'toolcall' || call.event === 'turn').slice(-12).map(call => `${call.event}${call.toolName === undefined ? '' : `:${call.toolName}`}${call.ok === undefined ? '' : `:${String(call.ok)}`}${call.text === undefined ? '' : ` "${call.text.slice(0, 160)}"`}`)
      const tasks = (await hostRpcOk<SeededHostTask[]>(page, 'listTasks', scope)).map(task => `${task.title.slice(0, 40)} [${task.stage}]`)
      throw new Error(`o pedido de código não abriu. Stub: ${stub.join(' | ') || 'nenhum evento'}. Tarefas: ${tasks.join(' | ')}. Fim do fio: ${thread.slice(-4).map(line => `${line.actorId}: ${line.body.slice(0, 70)}`).join(' | ')}`)
    }
    const problems = [
      ...groupOfThreeProblems(thread, tenant.memberId, EMBER_TEXT.group),
      ...deliveryProblems(review),
      ...twoFactorProblems(code, EMBER_SITE),
    ]
    if (problems.length > 0) throw new Error(`o seed não chegou aos três estados: ${problems.join('; ')}`)
    return {
      conversation: { messages: thread.length, groupOfThree: [...EMBER_TEXT.group], personaReplies: thread.filter(line => line.actorId !== tenant.memberId).length },
      delivery: { personaName: maker.name, taskId: review!.id, title: review!.title, stage: review!.stage },
      twoFactor: { personaName: attendant.name, requestId: code!.id, site: code!.site, state: code!.state },
    }
  } finally {
    await v11.close()
  }
}

/**
 * Reabre o app real em cima de um `home` já semeado (o estado está no banco; o onboarding do CLIENTE é dispensado pelo storage).
 * O pedido de código do 2FA VENCE em 10 min (`CODE_REQUEST_TTL_MS` do host) e o relógio do host é o de verdade: um home semeado horas antes volta com o cartão vencido. Por isso, por padrão, a abertura
 * RENOVA o pedido quando não há nenhum pendente (a persona abre outro, ~1 min); `renewCode: false` abre o home como ele está.
 * @param options - `home` (de preferência uma cópia, ver {@link copySeededHome}), `engine` (extra do CLI de mentira), o viewport e `renewCode`.
 */
export async function openSeededEmberApp(options: { readonly home: string; readonly engine?: FakeCliOptions; readonly viewport?: { width: number; height: number }; readonly renewCode?: boolean }): Promise<RealPersonaSession> {
  if (!existsSync(options.home)) throw new Error(`o home semeado não existe: ${options.home}`)
  const session = await withVaultCipher(() => openRealPersonaApp({
    engine: { kind: 'fake', ...EMBER_ENGINE, ...(options.engine ?? {}) },
    liveRunner: true,
    dismissOnboardingViaStorage: true,
    home: options.home,
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
  }))
  if (options.renewCode === false) return session
  try {
    await renewTwoFactor(session.page)
  } catch (error) {
    await session.close().catch(() => undefined)
    throw error
  }
  return session
}

/**
 * Garante UM pedido de código pendente (o cartão "Precisa de um código · Mercado da Lia"): se o do seed venceu (ou foi preenchido/cancelado), a persona do Atendimento abre outro, como no seed.
 * Chame de novo no meio de um lote longo de capturas (o cartão dura 10 min). Devolve o pedido pendente.
 * @param page - A página do app já aberto (o shell montado).
 */
export async function renewTwoFactor(page: Page): Promise<{ readonly id: string; readonly state: string; readonly site?: string }> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  const tenant = await until(page, async () => v11Tenant(page).catch(() => undefined), 60_000, 500)
  if (tenant === undefined) throw new Error('o app não gravou o tenant (persona.tenant.v1): não sei de que projeto renovar o código')
  const scope = SCOPE_OF(tenant)
  const pendingNow = async (): Promise<{ id: string; state: string; site?: string } | undefined> => (await hostRpcOk<Array<{ id: string; state: string; site?: string }>>(page, 'listCofreCodes', scope)).find(row => row.state === 'pending')
  const fresh = await pendingNow()
  if (fresh !== undefined) return fresh
  const { attendant } = pickPersonas(await personasOf(page, tenant))
  await postAsPerson(page, tenant, `@${attendant.name} ${EMBER_TEXT.twoFactor}`)
  const renewed = await until(page, pendingNow, 90_000, 1_000)
  if (renewed === undefined) throw new Error('a persona não abriu o pedido de código de novo (renovação do 2FA)')
  return renewed
}

/**
 * Uma CÓPIA da pasta semeada para um lote de capturas (o host muda o banco; a original fica intacta).
 * @param seeded - A pasta que o `seedEmberHome` deixou.
 * @param target - A pasta nova (criada).
 * @returns `target`.
 */
export function copySeededHome(seeded: string, target: string): string {
  mkdirSync(dirname(target), { recursive: true })
  cpSync(seeded, target, { recursive: true })
  return target
}
