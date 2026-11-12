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
import type { FakeCliOptions } from './fake-cli.ts'
import { hostRpcOk } from './gauge-sb-ges.ts'
import { openRealPersonaApp, type RealPersonaSession } from './real-app-session.ts'
import { openV11Session } from './v11-app.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type HostMessage, type PersonaRow, type V11Tenant } from './v11-helpers.ts'

/** O texto que cada pedido leva: o stub reconhece estes marcadores (e só eles) para responder o que o Ember precisa ver. */
export const EMBER_TEXT = {
  hello: 'Oi, tudo bem?',
  group: ['Pode.', 'Preciso de ajuda com a loja hoje', 'Principalmente com os pedidos do WhatsApp'] as const,
  delivery: 'monte o cartaz da promoção do pão de queijo da Padaria Lua: 2 por R$ 9 de sexta a domingo',
  twoFactor: 'entre no site da loja e veja os pedidos de hoje; ele vai pedir o código 2FA que chega por WhatsApp',
} as const

/** O site que o cartão do 2FA mostra no rótulo. */
export const EMBER_SITE = 'Mercado da Lia'

/** As regras do CLI de mentira do seed: o que a equipe responde e o que a persona do 2FA FAZ (chamar `ask_vault_code`, a ferramenta do produto). */
export const EMBER_ENGINE: FakeCliOptions = {
  turnMs: 700,
  rules: [
    { match: 'código 2FA que chega por WhatsApp', reply: 'Abri o pedido do código. Quando você preencher, eu sigo.' },
    { match: 'cartaz da promoção do pão de queijo', reply: 'Cartaz pronto: título "Pão de queijo em dobro!", destaque "2 por R$ 9", de sexta a domingo, pedidos pelo WhatsApp. Segue para a sua revisão.' },
    { match: 'Oi, tudo bem\\?', reply: 'Oi! Tudo bem por aqui. Como posso ajudar?' },
    { match: 'Principalmente com os pedidos', reply: 'Entendi. Posso cuidar dos pedidos do WhatsApp e do cartaz da promoção. Por onde quer começar?' },
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
  const v11 = await openV11Session({ hireTeam: true, home: options.home, engine: EMBER_ENGINE, ...(options.viewport === undefined ? {} : { viewport: options.viewport }) })
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
    const code = await until(page, async () => (await hostRpcOk<Array<{ id: string; state: string; site?: string }>>(page, 'listCofreCodes', scope)).find(row => row.state === 'pending'), 120_000, 1_000)

    const thread = lines(await channelMessages(page, tenant))
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
 * @param options - `home` (de preferência uma cópia, ver {@link copySeededHome}), `engine` (extra do CLI de mentira) e o viewport.
 */
export async function openSeededEmberApp(options: { readonly home: string; readonly engine?: FakeCliOptions; readonly viewport?: { width: number; height: number } }): Promise<RealPersonaSession> {
  if (!existsSync(options.home)) throw new Error(`o home semeado não existe: ${options.home}`)
  return openRealPersonaApp({
    engine: { kind: 'fake', ...EMBER_ENGINE, ...(options.engine ?? {}) },
    liveRunner: true,
    dismissOnboardingViaStorage: true,
    home: options.home,
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
  })
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
