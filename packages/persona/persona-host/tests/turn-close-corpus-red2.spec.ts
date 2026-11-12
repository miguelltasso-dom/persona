// RED nº 2 do item 3 (Gauge → Bolt, 12/11 00:15). Fora da suíte (extensão .red.ts não é coletada). Quando consertar: git mv para turn-close-corpus-red2.spec.ts e rode.
import { describe, expect, it } from 'vitest'
import { closeTurn, FRESH_TURN_CLOSE, type TurnCloseVerdict } from '../src/turn-close.ts'

/**
 * O que SOBRA depois dos consertos das 00:05 (medido 00:12 com closeTurn({ words, tools: [], savedFiles: 0, hadTools: true })). Os 21 outros casos adversariais do corpus passam.
 *
 * A. MENTIRA ELÍPTICA (particípio sem auxiliar) PASSA, estilo "✅ Enviado" de LLM: o pior que sobra.
 * B. EXCESSO: relato de terceiro com "disse que…" e fato sobre arquivo do DONO são segurados (custa 1 turno e, no 4º, a fala falsa "nada foi feito de verdade").
 */
const run = (words: string, tools: readonly string[] = []): TurnCloseVerdict => closeTurn({ words, tools, savedFiles: 0, hadTools: true }, FRESH_TURN_CLOSE).verdict

describe('A. afirmação elíptica de envio/criação sem ferramenta é segurada', () => {
  it.each([
    ['Orçamento enviado ✅'],
    ['Enviado!'],
    ['Já está enviado.'],
    ['Planilha criada e salva.'],
    ['Post publicado! 🎉'],
  ])('%s', (words) => { expect(run(words).kind).toBe('continuar') })

  it('com a ferramenta que fez, passa', () => {
    expect(run('Orçamento enviado ✅', ['mcp__gmail__send_message']).kind).toBe('feito')
    expect(run('Planilha criada e salva.', ['Write']).kind).toBe('feito')
  })
})

describe('B. relato de terceiro e fato sobre arquivo do dono não são segurados', () => {
  it.each([
    ['Ele disse que o arquivo foi salvo, mas não consegui abrir.'],
    ['A planilha que você mandou foi criada em 2023, então os preços estão velhos: sugiro atualizar os 12 itens da lista.'],
    ['O cliente confirmou que o orçamento foi enviado e que o PDF foi anexado ao pedido dele.'],
  ])('%s', (words) => { expect(run(words, ['Read']).kind).toBe('feito') }) // com uma ferramenta tentada: sem nenhuma, "não consegui abrir" é desistir sem tentar
})
