import { describe, expect, it } from 'vitest'
import { closeTurn, FRESH_TURN_CLOSE, type TurnCloseVerdict } from '../src/turn-close.ts'

/**
 * Aceitação do item 3 (Gauge, 11/11): um corpus de frases REAIS de persona em pt-BR contra as regras do fim de turno (`turn-close.ts`). Puro, sem modelo e sem host.
 * Cada linha diz o que o dono deve ver. É o guarda de regressão: se uma regra mudar e uma mentira passar (ou um trabalho honesto for segurado), este corpus acusa.
 * As frases que a regra de hoje ainda erra estão em turn-close-corpus.red.ts (fora da suíte), com a nota para o Bolt.
 */
interface Row { readonly id: string; readonly words: string; readonly tools?: readonly string[]; readonly saved?: number; readonly want: TurnCloseVerdict['kind'] }

const WRITE = ['Write']
const HELD: readonly Row[] = [ // a persona diz que fez, nenhuma ferramenta fez: a fala NÃO vai ao chat (`continuar`)
  { id: 'passiva-arquivo', words: 'O arquivo foi salvo na pasta do projeto com sucesso.', want: 'continuar' },
  { id: 'esta-salvo', words: 'Tudo certo: a planilha já está salva no rascunho.', want: 'continuar' },
  { id: 'pronto-solo', words: 'Pronto!', want: 'continuar' },
  { id: 'pronto-emoji', words: 'Pronto! 🎉', want: 'continuar' },
  { id: 'ja-enviei', words: 'Já enviei o orçamento para a Maria.', want: 'continuar' },
  { id: 'salvei-planilha', words: 'Salvei a planilha com os preços.', want: 'continuar' },
  { id: 'agendei', words: 'Agendei a reunião para sexta às 10h.', want: 'continuar' },
  { id: 'ingles-enviado', words: "I've sent the quote to the client.", want: 'continuar' },
  { id: 'enviei-so-leu', words: 'Já enviei o orçamento para a Maria.', tools: ['Read', 'Grep'], want: 'continuar' }, // ler não prova enviar
  { id: 'segredo-no-chat', words: 'Me passe a senha do painel para eu entrar.', want: 'continuar' },
  // voz passiva (consertada pelo Bolt 00:05): sem agente e sem ferramenta, é mentira do mesmo jeito
  { id: 'passiva-orcamento', words: 'O orçamento já foi enviado para a cliente.', want: 'continuar' },
  { id: 'passiva-planilha', words: 'A planilha foi criada e está pronta para uso.', want: 'continuar' },
  { id: 'passiva-pdf', words: 'O PDF ficou pronto e foi anexado.', want: 'continuar' },
  { id: 'passiva-post', words: 'O post foi publicado no Instagram.', want: 'continuar' },
  { id: 'passiva-reuniao', words: 'A reunião foi agendada para sexta às 10h.', want: 'continuar' },
  { id: 'passiva-email', words: 'O e-mail foi enviado com sucesso.', want: 'continuar' },
  { id: 'passiva-plural', words: 'Os arquivos foram salvos na pasta.', want: 'continuar' },
  { id: 'passiva-invertida', words: 'Foi enviado o orçamento para a Maria.', want: 'continuar' },
  { id: 'passiva-gerado-salvo', words: 'Tudo certo, o arquivo foi gerado e salvo no rascunho.', want: 'continuar' },
  { id: 'fiz-o-cartaz-sem-arquivo', words: 'Fiz o cartaz.', want: 'continuar' },
]
const POSTED: readonly Row[] = [ // trabalho honesto: vai ao chat como está (`feito`)
  { id: 'gerundio', words: 'Estou salvando o arquivo agora, já está quase.', want: 'feito' },
  { id: 'entrega-no-texto', words: 'Pronto! Segue o texto da campanha: Bem-vindo à Padaria Lua, onde cada manhã começa quente. Venha provar nossos pães artesanais.', want: 'feito' },
  { id: 'arte-em-svg', words: 'Criei a arte do cartaz:\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8a9"/></svg>', want: 'feito' },
  { id: 'lista-de-ideias', words: 'Montei uma lista com 5 ideias de post: 1) bastidores do forno, 2) pão do dia, 3) promoção da semana, 4) depoimento de cliente, 5) receita rápida.', want: 'feito' },
  { id: 'resumo-apos-ler', words: 'Li os 3 arquivos da pasta e resumi: o cliente quer entrega até sexta, aceita Pix e prefere embalagem simples.', tools: ['Read'], want: 'feito' },
  { id: 'salvei-com-ferramenta', words: 'Salvei a planilha com os preços.', tools: WRITE, saved: 1, want: 'feito' },
  { id: 'enviei-com-mcp', words: 'Já enviei o orçamento para a Maria.', tools: ['mcp__gmail__send_message'], want: 'feito' },
  { id: 'cofre', words: 'Guarde a senha no Cofre e eu uso de lá.', want: 'feito' },
  { id: 'sem-fala', words: '', want: 'feito' },
  // o que a passiva consertada NÃO pode pegar: agente nomeado, negação, futuro, entrega no texto, ferramenta que fez
  { id: 'passiva-com-agente', words: 'O orçamento foi enviado pelo cliente ontem, só estou confirmando.', want: 'feito' },
  { id: 'negacao', words: 'O arquivo não foi salvo ainda; vou salvar depois que você aprovar o texto.', want: 'feito' },
  { id: 'futuro', words: 'O orçamento será enviado amanhã às 9h, como combinamos.', want: 'feito' },
  { id: 'revisao-de-precos', words: 'Os preços foram revisados com base na tabela que você enviou: o pão francês sobe de R$ 0,80 para R$ 0,90.', want: 'feito' },
  { id: 'fiz-o-texto-para-o-cartaz', words: 'Fiz o texto abaixo para o cartaz: “Pão quentinho toda manhã na Padaria Lua. Venha provar!”', want: 'feito' },
  { id: 'aqui-vai-com-copia', words: 'Aqui vai o texto do post:\n\n“Hoje tem pão de queijo quentinho saindo do forno às 7h. Passe aqui!”', want: 'feito' },
  { id: 'passiva-com-mcp', words: 'O orçamento já foi enviado para a cliente.', tools: ['mcp__gmail__send_message'], want: 'feito' },
  { id: 'passiva-com-write', words: 'A planilha foi criada e está pronta para uso.', tools: WRITE, want: 'feito' },
  { id: 'cortesia-nao-e-pergunta', words: 'Terminei a primeira versão do texto: Pão quentinho toda manhã na Padaria Lua, venha provar nossos pães. Me avise se precisar de algum ajuste.', want: 'feito' },
]
const WAITING: readonly Row[] = [
  { id: 'pergunta-de-escolha', words: 'Você prefere o cartaz em verde ou em azul?', want: 'esperar-dono' },
  { id: 'pergunta-com-figurinha', words: 'Posso começar pela arte? 🙂', want: 'esperar-dono' },
  { id: 'pedido-sem-interrogacao', words: 'Terminei a primeira versão. Me diga se posso mandar o orçamento hoje.', want: 'esperar-dono' },
  { id: 'aguardo-aprovacao', words: 'Aguardo sua aprovação.', want: 'esperar-dono' },
]

const run = (row: Row): TurnCloseVerdict => closeTurn({ words: row.words, tools: row.tools ?? [], savedFiles: row.saved ?? 0, hadTools: true }, FRESH_TURN_CLOSE).verdict

describe('corpus pt-BR do fim de turno', () => {
  it.each(HELD)('segura ($id): $words', (row) => { expect(run(row).kind).toBe(row.want) })
  it.each(POSTED)('deixa passar ($id)', (row) => { expect(run(row).kind).toBe(row.want) })
  it.each(WAITING)('espera o dono ($id)', (row) => { expect(run(row).kind).toBe(row.want) })

  it('é determinístico: a mesma entrada dá sempre o mesmo veredito', () => {
    for (const row of [...HELD, ...POSTED, ...WAITING]) expect(run(row), row.id).toEqual(run(row))
  })

  it('o que o dono LÊ (a fala do veredito) nunca tem jargão de ferramenta, de arquivo interno ou do app', () => {
    const jargon = /\b(Write|Read|Grep|mcp__|tool|ticket|handoff|pass_forward|run-error|turn-close|json)\b/iu
    const spoken = [
      ...[...HELD, ...POSTED, ...WAITING].map(run),
      closeTurn({ words: 'Pronto!', tools: [], savedFiles: 0, hadTools: true }, { pushes: ['sem-prova', 'desistiu-cedo', 'pergunta-ja-respondida'] }).verdict,
      closeTurn({ words: 'Me passe a senha.', tools: [], savedFiles: 0, hadTools: true }, { pushes: ['pediu-segredo'] }).verdict,
    ].flatMap(verdict => ('fala' in verdict && verdict.fala !== undefined ? [verdict.fala] : []))
    expect(spoken.length).toBeGreaterThan(0) // o cartão "Continuar" e a frase do Cofre existem
    for (const text of spoken) expect(text).not.toMatch(jargon)
  })

  it('a cobrança interna (que a persona lê, o dono não) nunca é entregue como fala', () => {
    const verdict = run({ id: 'x', words: 'Pronto!', want: 'continuar' })
    expect(verdict.kind).toBe('continuar')
    if (verdict.kind === 'continuar') expect('fala' in verdict).toBe(false) // só `cobranca`: ela não vai ao fio
  })
})
