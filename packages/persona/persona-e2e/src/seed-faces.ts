/**
 * SEED LOCAL das CARAS DAS MENSAGENS (pedido do Ember via Keel 21:37, 12/11: a Muse aceita o #21 "rosto vivo" olhando o rosto de MENSAGEM piscando e mudando de humor, claro e escuro): um home LIMPO (só onboarding +
 * equipe sugerida, sem o conteúdo do seed do 2FA) com
 *   1  o #geral onde VÁRIAS personas escrevem (cada uma responde a uma pergunta da pessoa, com humores diferentes: alegre, preocupada, pensativa, pergunta de volta);
 *   2  uma DM da pessoa com a Atendimento, com mensagens dos dois lados (agradecimento, desabafo, resposta acolhedora).
 * Tudo no BANCO do host (CLI de mentira, 0 IA paga); nada de mock de cliente. Reabrir: `openSeededEmberApp({ home: copySeededHome(<home>, <nova>), renewCode: false })` (de `seed-ember.ts`).
 * Só conversa, nunca pedido de trabalho (um pedido abriria Tarefa e a linha "X assume este pedido" no meio do fio): as frases da pessoa são PERGUNTAS ou conversa.
 */
import type { FakeCliOptions } from './fake-cli.ts'
import { hostRpcOk } from './gauge-sb-ges.ts'
import { openV11Session } from './v11-app.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type PersonaRow, type V11Tenant } from './v11-helpers.ts'

/** Uma troca: a pessoa diz, a persona responde (o stub responde pelo trecho `key`, que só existe na frase daquela troca). */
export interface FaceExchange {
  /** Parte do nome/título da persona que recebe (o #geral usa @menção; a DM é com a Atendimento). */
  readonly persona: RegExp
  readonly key: string
  readonly say: string
  readonly reply: string
}

export const FACES_CHANNEL: readonly FaceExchange[] = [
  { persona: /coordena/iu, key: 'como estamos hoje', say: 'bom dia, como estamos hoje?', reply: 'Bom dia! Estamos muito bem: a equipe está de pé e tudo organizado. Que bom começar o dia com você!' },
  { persona: /atendimento/iu, key: 'cliente esperando', say: 'tem algum cliente esperando?', reply: 'Tem dois clientes esperando resposta desde ontem e isso me deixa preocupada. Posso começar por eles?' },
  { persona: /cria[cç][aã]o/iu, key: 'gostou da ideia', say: 'gostou da ideia do cartaz?', reply: 'Adorei! Ficou lindo, parabéns pela escolha. Já estou animada para ver pronto.' },
  { persona: /m[ií]dia/iu, key: 'post de ontem', say: 'o post de ontem deu certo?', reply: 'Hmm, ainda não sei dizer. O alcance caiu um pouco e vou conferir os números antes de te responder.' },
]

export const FACES_DM: readonly FaceExchange[] = [
  { persona: /atendimento/iu, key: 'tudo certo por aí', say: 'oi, tudo certo por aí?', reply: 'Oi! Tudo certo por aqui, e que bom te ver. Como foi a sua manhã?' },
  { persona: /atendimento/iu, key: 'ajudou muito hoje', say: 'obrigada, você ajudou muito hoje', reply: 'Imagina, foi um prazer! Fico feliz de verdade em poder ajudar. Conte comigo sempre.' },
  { persona: /atendimento/iu, key: 'dia difícil', say: 'tive um dia difícil, mas valeu a pena', reply: 'Poxa, sinto muito pelo dia difícil. Que bom que valeu a pena. Descansa um pouco, tá? Estou por aqui.' },
]

/**
 * As regras do CLI de mentira: o MAIS NOVO primeiro (o primeiro que casar vence; se o prompt trouxer a conversa anterior, a frase mais nova ainda ganha).
 */
export const FACES_ENGINE: FakeCliOptions = {
  turnMs: 1_200,
  rules: [...FACES_CHANNEL, ...FACES_DM].reverse().map(exchange => ({ match: exchange.key, reply: exchange.reply })),
}

/** Uma linha lida do fio (só o que o veredito precisa). */
export interface FaceLine { readonly actorId: string; readonly body: string }

/**
 * O veredito PURO do seed: o #geral tem a fala de ao menos 3 personas DIFERENTES e a DM tem fala dos dois lados (≥ 2 e ≥ 2); nenhuma linha é erro do motor. Vazio = certo.
 * @param channel - As linhas do #geral.
 * @param dm - As linhas da DM.
 * @param personId - O membro (a pessoa).
 */
export function facesProblems(channel: readonly FaceLine[], dm: readonly FaceLine[], personId: string): string[] {
  const out: string[] = []
  const speakers = new Set(channel.filter(line => line.actorId !== personId).map(line => line.actorId))
  if (speakers.size < 3) out.push(`o #geral tem fala de ${String(speakers.size)} persona(s) diferentes, esperava ao menos 3`)
  const mine = dm.filter(line => line.actorId === personId).length
  const theirs = dm.filter(line => line.actorId !== personId).length
  if (mine < 2 || theirs < 2) out.push(`a DM tem ${String(mine)} fala(s) da pessoa e ${String(theirs)} da persona, esperava ao menos 2 de cada`)
  for (const line of [...channel, ...dm]) {
    if (/\[\[run-error|não está disponível neste computador/iu.test(line.body)) out.push(`há um erro do motor no fio: "${line.body.slice(0, 60)}"`)
  }
  return out
}

/** O que o seed leu do host quando terminou (vai para o `proof.json`). */
export interface FacesSeedProof {
  readonly channel: { readonly lines: number; readonly speakers: string[] }
  readonly dm: { readonly id: string; readonly withPersona: string; readonly lines: number }
}

interface DmLine { readonly actorId: string; readonly body: string; readonly type: string }

async function dmLines(page: Parameters<typeof channelMessages>[0], tenant: V11Tenant, dmId: string): Promise<DmLine[]> {
  const got = await hostRpcOk<{ events: DmLine[] }>(page, 'listMessages', { workspaceId: tenant.workspaceId, projectId: tenant.projectId, streamKind: 'dm', ownerId: dmId, actorId: tenant.memberId, afterSeq: 0, limit: 200 })
  return got.events.filter(event => event.type === 'message' || event.type === 'runner')
}

const personaOf = (team: readonly PersonaRow[], pattern: RegExp): PersonaRow => {
  const found = team.find(row => pattern.test(`${row.title ?? ''} ${row.name}`))
  if (found === undefined) throw new Error(`a equipe contratada não tem a persona ${String(pattern)}`)
  return found
}

/**
 * Semeia o `home` (banco real do host) com o #geral falado e a DM, PROVA no host e fecha deixando o `home` pronto.
 * @param options - `home`: a pasta que fica com o estado.
 */
export async function seedFacesHome(options: { readonly home: string }): Promise<FacesSeedProof> {
  const v11 = await openV11Session({ hireTeam: true, home: options.home, engine: FACES_ENGINE })
  try {
    const { page } = v11
    const tenant = await v11Tenant(page)
    const team = await personasOf(page, tenant)

    // 1) o #geral: uma pergunta por persona, UMA de cada vez (espera a resposta antes da próxima: as 4 vozes ficam alternadas com a da pessoa)
    for (const exchange of FACES_CHANNEL) {
      const persona = personaOf(team, exchange.persona)
      const before = (await channelMessages(page, tenant)).length
      await postAsPerson(page, tenant, `@${persona.name} ${exchange.say}`)
      const answered = await until(page, async () => ((await channelMessages(page, tenant)).slice(before).some(message => message.actorId === persona.id && message.body.trim() !== '') ? true : undefined), 90_000, 700)
      if (answered === undefined) throw new Error(`${persona.name} não respondeu "${exchange.say}" no #geral`)
    }

    // 2) a DM com a Atendimento
    const attendant = personaOf(team, /atendimento/iu)
    const dmId = 'dm-faces'
    await hostRpcOk(page, 'createDm', { id: dmId, workspaceId: tenant.workspaceId, projectId: tenant.projectId, participantA: tenant.memberId, participantB: attendant.id })
    for (const exchange of FACES_DM) {
      const before = (await dmLines(page, tenant, dmId)).length
      await postAsPerson(page, tenant, exchange.say, { streamKind: 'dm', ownerId: dmId, subjectId: '' })
      const answered = await until(page, async () => ((await dmLines(page, tenant, dmId)).slice(before).some(line => line.actorId !== tenant.memberId && line.body.trim() !== '') ? true : undefined), 90_000, 700)
      if (answered === undefined) throw new Error(`a Atendimento não respondeu "${exchange.say}" na DM`)
    }

    const channel = (await channelMessages(page, tenant)).filter(message => message.type === 'message' || message.type === 'runner').map(message => ({ actorId: message.actorId, body: message.body }))
    const dm = (await dmLines(page, tenant, dmId)).map(line => ({ actorId: line.actorId, body: line.body }))
    const problems = facesProblems(channel, dm, tenant.memberId)
    if (problems.length > 0) throw new Error(`o seed das caras não chegou ao que o Ember precisa: ${problems.join('; ')}`)
    return {
      channel: { lines: channel.length, speakers: [...new Set(channel.filter(line => line.actorId !== tenant.memberId).map(line => line.actorId))] },
      dm: { id: dmId, withPersona: attendant.name, lines: dm.length },
    }
  } finally {
    await v11.close()
  }
}
