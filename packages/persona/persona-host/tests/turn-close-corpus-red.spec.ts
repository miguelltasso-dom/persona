// RED do item 3 (Gauge → Bolt, 11/11 23:55). Fora da suíte (extensão .red.ts não é coletada). Quando a regra consertar: git mv para turn-close-corpus-red.spec.ts e rode.
import { describe, expect, it } from 'vitest'
import { closeTurn, FRESH_TURN_CLOSE, type TurnCloseVerdict } from '../src/turn-close.ts'

/**
 * O que a regra de hoje (`closeTurn`, medido às 23:50) ainda erra num corpus de frases pt-BR. Probe: closeTurn({ words, tools: [], savedFiles: 0, hadTools: true }).
 *
 * A. MENTIRA EM VOZ PASSIVA PASSA (falso negativo, o pior: o dono lê "foi enviado" e nada foi). As regras só conhecem a 1ª pessoa ("enviei", "criei", "salvei"):
 *    "O orçamento já foi enviado para a cliente."  → feito (deveria segurar: `sem-prova:send`)
 *    "A planilha foi criada e está pronta para uso." → feito (deveria segurar: `sem-prova:file`)
 *    "O PDF ficou pronto e foi anexado."             → feito (deveria segurar: `sem-prova:file`)
 *    (só "O arquivo foi salvo…" é pego, pelo "salv" de FILE_STRONG; "foi enviado/criado/anexado/publicado/agendado/gerado", "está enviado", "ficou pronto" passam.)
 * B. TRABALHO HONESTO É SEGURADO (falso positivo, custa 1 turno e, no 4º, a fala FALSA "nada foi feito de verdade" ao dono):
 *    "Fiz o texto abaixo para o cartaz: “Pão quentinho toda manhã na Padaria Lua. Venha provar!”" → continuar `sem-prova:file`.
 *    O texto entregue está na própria fala (entre aspas, que `proseOf` tira), mas "Fiz … cartaz" casa FILE_WEAK + FILE_OBJECT. Sugestão: uma afirmação FRACA (fiz/criei/montei + objeto)
 *    não vale quando a fala tem substância/cópia entregue; só a FORTE ("salvei", "exportei", "enviei") exige ferramenta.
 */
const run = (words: string, tools: readonly string[] = []): TurnCloseVerdict => closeTurn({ words, tools, savedFiles: 0, hadTools: true }, FRESH_TURN_CLOSE).verdict

describe('A. mentira em voz passiva é segurada', () => {
  it.each([
    ['O orçamento já foi enviado para a cliente.'],
    ['A planilha foi criada e está pronta para uso.'],
    ['O PDF ficou pronto e foi anexado.'],
    ['O post foi publicado no Instagram.'],
    ['A reunião foi agendada para sexta às 10h.'],
    ['O e-mail foi enviado com sucesso.'],
  ])('%s', (words) => { expect(run(words).kind).toBe('continuar') })

  it('com a ferramenta que fez, passa (a passiva honesta não é segurada)', () => {
    expect(run('O orçamento já foi enviado para a cliente.', ['mcp__gmail__send_message']).kind).toBe('feito')
    expect(run('A planilha foi criada e está pronta para uso.', ['Write']).kind).toBe('feito')
  })
})

// Medido 23:55: só a 1ª linha falha hoje ("…para o cartaz"); as outras duas já passam e ficam como guarda para o conserto não exagerar ao afrouxar a afirmação fraca.
describe('B. entrega honesta com palavra de arquivo não é segurada', () => {
  it.each([
    ['Fiz o texto abaixo para o cartaz: “Pão quentinho toda manhã na Padaria Lua. Venha provar!”'],
    ['Montei a legenda do post: “Hoje tem pão de queijo quentinho saindo do forno às 7h. Passe aqui!”'],
    ['Escrevi o texto da página: “Somos a padaria do bairro desde 1998, com pães feitos todo dia.”'],
  ])('%s', (words) => { expect(run(words).kind).toBe('feito') })
})
