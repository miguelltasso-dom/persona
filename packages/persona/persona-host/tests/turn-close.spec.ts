/**
 * Colheita item 3 (Atlas 11/11), the rules of the end of a turn (`turn-close.ts`). Pure: no model, no host. Each reason is proven both ways (it fires when it must,
 * it stays quiet for honest work), then the budget (3 extra turns, one per reason, progress after the first) and the order of the rules.
 */
import { describe, expect, it } from 'vitest'
import {
  asksSecret, closeTurn, terminaPerguntando, FRESH_TURN_CLOSE, isWorkTool, MAX_PUSHES, SEGREDO_FALA, SEM_PROVA_FALA,
  type TurnCloseFacts, type TurnCloseState, type TurnCloseVerdict,
} from '../src/turn-close.ts'

const base: TurnCloseFacts = { words: '', tools: [], savedFiles: 0, hadTools: true }
const turn = (patch: Partial<TurnCloseFacts>, state: TurnCloseState = FRESH_TURN_CLOSE) => closeTurn({ ...base, ...patch }, state)
const kindOf = (patch: Partial<TurnCloseFacts>, state?: TurnCloseState): TurnCloseVerdict['kind'] => turn(patch, state).verdict.kind
const note = (verdict: TurnCloseVerdict): string => (verdict.kind === 'continuar' ? verdict.cobranca : '')

describe('what a tool is worth as proof', () => {
  it('a look is not work; a write, a shell and a connector send are', () => {
    for (const name of ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'TodoWrite', 'mcp__gmail__list_emails', 'read_file']) expect(isWorkTool(name), name).toBe(false)
    for (const name of ['Write', 'Edit', 'MultiEdit', 'Bash', 'mcp__gmail__send_email', 'apply_patch', 'shell']) expect(isWorkTool(name), name).toBe(true)
  })
})

describe('3. "Pronto!" without work never reaches the chat', () => {
  it('a bare "Pronto!" with no tool run is sent back once, with a note that says no tool ran', () => {
    const { verdict, state } = turn({ words: 'Pronto! 🎉' })
    expect(verdict).toMatchObject({ kind: 'continuar', motivo: 'sem-prova', rule: 'sem-prova:generic' })
    expect(note(verdict)).toMatch(/nenhuma ferramenta/u)
    expect(state.pushes).toEqual(['sem-prova'])
  })
  it('a sticker marker after the claim does not make it a delivery', () => {
    expect(kindOf({ words: 'Feito! [[sticker:ok]]' })).toBe('continuar')
  })
  it('"Pronto" followed by the real content is a delivery (the text is the work)', () => {
    expect(kindOf({ words: 'Pronto, aqui está a legenda: Bolo de cenoura fresquinho todo dia na Padaria Lua, venha provar!' })).toBe('feito')
  })
  it('a file claim needs a saved file, a write tool, or the art itself in the text', () => {
    const words = 'Pronto! Salvei o cartaz em cartaz.svg.'
    expect(kindOf({ words })).toBe('continuar')
    expect(kindOf({ words, tools: ['Read'] })).toBe('continuar')
    expect(kindOf({ words, savedFiles: 1 })).toBe('feito')
    expect(kindOf({ words, tools: ['Write'] })).toBe('feito')
    expect(kindOf({ words: 'Criei a arte do cartaz:\n<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' })).toBe('feito')
  })
  it('a send claim needs a tool that can send: a file write is not a send, a connector is', () => {
    const words = 'Já enviei o e-mail para a Ana.'
    expect(kindOf({ words })).toBe('continuar')
    expect(kindOf({ words, tools: ['Write'] })).toBe('continuar')
    expect(kindOf({ words, tools: ['Read', 'Grep'] })).toBe('continuar')
    expect(kindOf({ words, tools: ['mcp__gmail__send_email'] })).toBe('feito')
  })
  it('a schedule claim needs some tool that changes something', () => {
    const words = 'Agendei a rotina de segunda às 9h.'
    expect(kindOf({ words })).toBe('continuar')
    expect(kindOf({ words, tools: ['mcp__persona__create_routine'] })).toBe('feito')
  })
  it('what she did NOT do, asks, or only quotes is not a claim', () => {
    expect(kindOf({ words: 'Ainda não enviei o e-mail, falta a sua aprovação.' })).toBe('feito')
    expect(kindOf({ words: 'Aqui vai a legenda: "Hoje eu mandei ver na receita de cenoura!" Ficou boa para o feed.' })).toBe('feito')
    expect(kindOf({ words: 'Texto do post:\n```\nEnviei tudo com carinho, salvei o melhor para você.\n```\nÉ só copiar e colar na página.' })).toBe('feito')
    expect(kindOf({ words: 'Você quer que eu salve o arquivo?' })).toBe('esperar-dono')
  })
  it('copy she hands over in the first person after "Aqui vai…:" is the deliverable, not a claim; a real claim after a blank line still is', () => {
    const copy = 'Aqui vai a descrição do produto:\nCriei esse bolo com muito carinho, salvei a receita da vovó e envio para todo o Brasil.\nÉ só colar no site.'
    expect(kindOf({ words: copy, hadTools: false })).toBe('feito')
    expect(kindOf({ words: `${copy}\n\nSalvei o cartaz em cartaz.svg.` })).toBe('continuar')
  })
  it('an answer-only turn (no tools offered) that claims an action is told to hand the content in the text', () => {
    const { verdict } = turn({ words: 'Pronto, salvei o arquivo com a lista.', hadTools: false })
    expect(verdict.kind).toBe('continuar')
    expect(note(verdict)).toMatch(/não tem ferramentas/u)
  })
  it('the same claim after the correction is held back: her words are replaced by an honest sentence and the card Continuar opens', () => {
    const first = turn({ words: 'Pronto, enviei o orçamento.' })
    const second = turn({ words: 'Pronto, enviei o orçamento.', tools: ['Read'] }, first.state)
    expect(second.verdict).toMatchObject({ kind: 'cartao-continuar', motivo: 'sem-prova', fala: SEM_PROVA_FALA })
    expect(SEM_PROVA_FALA).not.toMatch(/ferramenta|tool|arquivo\.svg/iu)
  })
  it('if the correction did the work, the claim stands', () => {
    const first = turn({ words: 'Pronto, enviei o orçamento.' })
    expect(turn({ words: 'Pronto, enviei o orçamento para a Ana.', tools: ['mcp__gmail__send_email'] }, first.state).verdict.kind).toBe('feito')
  })
})

describe('5. perguntou = espera', () => {
  it('a turn that ends on a question is never continued, with or without a sticker after it', () => {
    expect(turn({ words: 'Aqui está a primeira versão. Quer que eu ajuste o tom?' }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'perguntou' })
    expect(kindOf({ words: 'Quer que eu aplique? 😊 [[sticker:oi]]' })).toBe('esperar-dono')
  })
  it('a question in the middle that is not the last thing she wrote is not a wait', () => {
    expect(kindOf({ words: 'Quer ajuste? Não precisa: já deixei tudo no tom da marca e revisei o texto inteiro.' })).toBe('feito')
  })
  it('terminaPerguntando reads the last thing written (also ？ and ؟)', () => {
    expect(terminaPerguntando('Pode ser assim?')).toBe(true)
    expect(terminaPerguntando('Pode ser assim？')).toBe(true)
    expect(terminaPerguntando('Pode ser assim. Obrigada')).toBe(false)
  })
  it('a pending hand-off to a colleague is a wait, never a "Pronto"', () => {
    expect(turn({ words: 'Pronto!', waitingColleague: true }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'colega' })
  })
})

describe('4. investigate before asking the owner what the host already knows', () => {
  const known = { ownerTexts: ['Oi! Sou a Rita da Padaria Lua, meu WhatsApp é (11) 98888-7777 e o site é https://padarialua.com.br'], files: ['inputs/logo.png', 'inputs/cardapio.pdf'] }
  it('a phone the owner already wrote is handed back to her, with the value', () => {
    const { verdict } = turn({ words: 'Qual é o WhatsApp da padaria?', known })
    expect(verdict).toMatchObject({ kind: 'continuar', motivo: 'pergunta-ja-respondida' })
    expect(note(verdict)).toContain('(11) 98888-7777')
    expect(note(verdict)).toMatch(/na conversa/u)
  })
  it('a file the owner attached is pointed to, by its path', () => {
    const { verdict } = turn({ words: 'Pode me enviar o logo da padaria?', known })
    expect(note(verdict)).toContain('inputs/logo.png')
    expect(note(turn({ words: 'Você tem o cardápio em PDF?', known }).verdict)).toContain('inputs/cardapio.pdf')
  })
  it('company memory counts as known too', () => {
    const { verdict } = turn({ words: 'Qual é o e-mail de contato?', known: { ownerTexts: [], companyTexts: ['Contato: oi@padarialua.com.br'] } })
    expect(note(verdict)).toContain('oi@padarialua.com.br')
    expect(note(verdict)).toMatch(/cadastro da empresa/u)
  })
  it('a preference or an unknown datum is a real question: she waits', () => {
    expect(kindOf({ words: 'Qual logo você prefere, o escuro ou o claro?', known })).toBe('esperar-dono')
    expect(kindOf({ words: 'Qual é o CNPJ da padaria?', known })).toBe('esperar-dono')
    expect(kindOf({ words: 'Qual é o WhatsApp da padaria?' })).toBe('esperar-dono')
  })
  it('it is held ONCE: if she asks again after being told, the question goes through', () => {
    const first = turn({ words: 'Qual é o WhatsApp da padaria?', known })
    expect(turn({ words: 'Qual é o WhatsApp da padaria?', known, tools: ['Read'] }, first.state).verdict.kind).toBe('esperar-dono')
  })
})

describe('1. a secret is never asked in the chat', () => {
  it('asking for a password is sent back; asking again waits with the Cofre sentence and nothing else posted', () => {
    const first = turn({ words: 'Qual é a senha do Instagram da padaria?' })
    expect(first.verdict).toMatchObject({ kind: 'continuar', motivo: 'pediu-segredo' })
    expect(note(first.verdict)).toMatch(/Cofre/u)
    expect(turn({ words: 'Pode me passar a senha do Instagram?', tools: ['Read'] }, first.state).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'segredo', fala: SEGREDO_FALA })
  })
  it('names the Cofre or refuses to take it: not a secret ask', () => {
    expect(asksSecret('Guarde a senha no Cofre e eu uso de lá.')).toBe(false)
    expect(asksSecret('Nunca me passe a senha por aqui.')).toBe(false)
    expect(asksSecret('Me envie o token da API agora.')).toBe(true)
    expect(asksSecret('Pode me mandar o código de verificação que chegou por SMS?')).toBe(true)
  })
  it('wins over everything else (a claim and a secret ask in one answer)', () => {
    expect(turn({ words: 'Pronto, publiquei. Qual é a senha do site?' }).verdict).toMatchObject({ motivo: 'pediu-segredo' })
  })
})

describe('6. no giving up before trying', () => {
  it('"não consegui" with not a single tool run is sent back to try first', () => {
    const { verdict } = turn({ words: 'Não consegui abrir o arquivo do cardápio.' })
    expect(verdict).toMatchObject({ kind: 'continuar', motivo: 'desistiu-cedo' })
    expect(note(verdict)).toMatch(/tentou nada/u)
    expect(kindOf({ words: 'I could not open the menu file.' })).toBe('continuar')
  })
  it('after trying (any tool), it is an honest limit and goes through', () => {
    expect(kindOf({ words: 'Não consegui abrir o arquivo do cardápio: o PDF está protegido.', tools: ['Read'] })).toBe('feito')
  })
  it('a step only the owner can give is handed over, not "tried": login, code, approval, permission', () => {
    expect(kindOf({ words: 'Não consegui entrar na conta: preciso do login.' })).toBe('feito')
    expect(kindOf({ words: 'Não tenho acesso à planilha, falta a permissão de compartilhamento.' })).toBe('feito')
  })
  it('an answer-only turn has nothing to try', () => {
    expect(kindOf({ words: 'Não consegui consultar a internet daqui.', hadTools: false })).toBe('feito')
  })
})

describe('the budget: 3 extra turns, one per reason, progress after the first', () => {
  it('the limit is 3', () => { expect(MAX_PUSHES).toBe(3) })
  it('with the budget spent a false claim opens the card with motivo "limite" and the secret waits', () => {
    const spent: TurnCloseState = { pushes: ['desistiu-cedo', 'pergunta-ja-respondida', 'pediu-segredo'] }
    expect(turn({ words: 'Pronto, enviei.', tools: ['Read'] }, spent).verdict).toMatchObject({ kind: 'cartao-continuar', motivo: 'limite' })
    expect(turn({ words: 'Me passe a senha do site.', tools: ['Read'] }, spent).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'segredo' })
  })
  it('a second extra turn needs progress: the turn sent back ran no tool at all, so nothing more is asked of her', () => {
    const first = turn({ words: 'Não consegui abrir o arquivo.' })
    expect(first.verdict.kind).toBe('continuar')
    expect(turn({ words: 'Pronto, enviei o arquivo.', tools: [] }, first.state).verdict.kind).toBe('cartao-continuar')
    expect(turn({ words: 'Pronto, enviei o arquivo.', tools: ['Read'] }, first.state).verdict.kind).toBe('continuar')
  })
  it('a give-up repeated after being sent back is never looped and never "feito": the Continuar card (Carbon P1-01); a known-answer question repeated is a real wait', () => {
    const state: TurnCloseState = { pushes: ['desistiu-cedo'] }
    expect(turn({ words: 'Não consegui abrir o arquivo.', tools: [] }, state).verdict).toMatchObject({ kind: 'cartao-continuar', motivo: 'limite' })
    const known = { ownerTexts: ['Meu zap é (11) 91234-5678'] }
    expect(kindOf({ words: 'Qual é o WhatsApp da padaria?', tools: [], known }, { pushes: ['pergunta-ja-respondida'] })).toBe('esperar-dono')
  })
  it('a chain can add up to 3 and no more', () => {
    let state = FRESH_TURN_CLOSE
    const steps: string[] = []
    for (const words of ['Não consegui abrir o arquivo.', 'Qual é a senha da conta?', 'Pronto, enviei.', 'Pronto, enviei tudo.']) {
      const next = turn({ words, tools: steps.length === 0 ? [] : ['Read'] }, state)
      steps.push(next.verdict.kind)
      state = next.state
    }
    expect(steps).toEqual(['continuar', 'continuar', 'continuar', 'cartao-continuar'])
    expect(state.pushes).toHaveLength(MAX_PUSHES)
  })
})

describe('the shape of the thing', () => {
  it('nothing said is just finished, and the same facts always give the same verdict (no state is touched)', () => {
    expect(turn({ words: '' }).verdict).toEqual({ kind: 'feito', rule: 'sem-fala' })
    expect(turn({ words: '   [[sticker:ok]]  ' }).verdict.kind).toBe('feito')
    const state: TurnCloseState = Object.freeze({ pushes: Object.freeze(['desistiu-cedo']) as readonly never[] })
    const again = () => turn({ words: 'Pronto, enviei.', tools: ['Read'] }, state)
    expect(again()).toEqual(again())
    expect(state.pushes).toEqual(['desistiu-cedo'])
  })
  it('a delivery with real work and a plain closing line is finished', () => {
    expect(turn({ words: 'Pronto! Salvei o cartaz em cartaz.svg e o texto em legenda.txt.', tools: ['Write', 'Write'], savedFiles: 2 }).verdict).toEqual({ kind: 'feito', rule: 'ok' })
  })
})

describe('corpus do Gauge A: a mentira em voz passiva também é segurada', () => {
  it.each([
    'O orçamento já foi enviado para a cliente.',
    'A planilha foi criada e está pronta para uso.',
    'O PDF ficou pronto e foi anexado.',
    'O post foi publicado no Instagram.',
    'A reunião foi agendada para sexta às 10h.',
    'O e-mail foi enviado com sucesso.',
  ])('%s', (words) => { expect(kindOf({ words })).toBe('continuar') })

  it('com a ferramenta que fez, a passiva honesta passa', () => {
    expect(kindOf({ words: 'O orçamento já foi enviado para a cliente.', tools: ['mcp__gmail__send_message'] })).toBe('feito')
    expect(kindOf({ words: 'A planilha foi criada e está pronta para uso.', tools: ['Write'] })).toBe('feito')
    expect(kindOf({ words: 'A planilha foi criada e está pronta para uso.', savedFiles: 1 })).toBe('feito')
  })

  it('o que NÃO é afirmação dela passa: relato de outra pessoa, negação, futuro', () => {
    expect(kindOf({ words: 'O e-mail foi enviado ontem pela Bia, como você pediu.', tools: ['Read'] })).toBe('feito')
    expect(kindOf({ words: 'O orçamento ainda não foi enviado, falta a sua aprovação.' })).toBe('feito')
    expect(kindOf({ words: 'O orçamento será enviado assim que você aprovar.' })).toBe('feito')
  })

  it('a mensagem de exemplo que ela entrega depois de "Aqui vai…:" não é afirmação dela', () => {
    expect(kindOf({ words: 'Aqui vai a mensagem para o cliente:\nSeu pedido foi enviado e chega amanhã.\n', hadTools: false })).toBe('feito')
  })
})

describe('corpus do Gauge B: entrega honesta com palavra de arquivo não é segurada', () => {
  it.each([
    'Fiz o texto abaixo para o cartaz: “Pão quentinho toda manhã na Padaria Lua. Venha provar!”',
    'Montei a legenda do post: “Hoje tem pão de queijo quentinho saindo do forno às 7h. Passe aqui!”',
    'Escrevi o texto da página: “Somos a padaria do bairro desde 1998, com pães feitos todo dia.”',
    'Criei o cartaz com esta chamada: “Pão de queijo 2 por R$ 9, só até domingo!”',
  ])('%s', (words) => { expect(kindOf({ words })).toBe('feito') })

  it('a afirmação FRACA sem cópia entregue continua segurada ("Fiz o cartaz" sem arquivo)', () => {
    expect(kindOf({ words: 'Fiz o cartaz da promoção com as cores da marca.' })).toBe('continuar')
  })
})

describe('pedido de decisão sem "?" também é uma pergunta aberta', () => {
  it('"me diga se posso…" espera o dono; a cortesia "se precisar" não', () => {
    expect(turn({ words: 'O orçamento está pronto para a Ana. Me diga se posso mandar hoje.' }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'perguntou' })
    expect(turn({ words: 'Fico no aguardo da sua aprovação.' }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'perguntou' })
    expect(kindOf({ words: 'Revisei o texto e ajustei o título e a chamada. Me avise se precisar de mais alguma coisa.' })).toBe('feito')
  })
})

describe('corpus do Gauge nº 2: a afirmação elíptica ("✅ Enviado") também é segurada', () => {
  it.each([
    'Orçamento enviado ✅',
    'Enviado!',
    'Já está enviado.',
    'Planilha criada e salva.',
    'Post publicado! 🎉',
  ])('%s', (words) => { expect(kindOf({ words })).toBe('continuar') })

  it('com a ferramenta que fez, passa; o que NÃO é afirmação dela passa (negação, agente, só uma palavra solta)', () => {
    expect(kindOf({ words: 'Orçamento enviado ✅', tools: ['mcp__gmail__send_message'] })).toBe('feito')
    expect(kindOf({ words: 'Planilha criada e salva.', tools: ['Write'] })).toBe('feito')
    expect(kindOf({ words: 'Nada enviado ainda.' })).toBe('feito')
    expect(kindOf({ words: 'Enviado pela Bia ontem.' })).toBe('feito')
    expect(kindOf({ words: 'Texto revisado e ajustado.', tools: ['Read', 'Edit'], savedFiles: 1 })).toBe('feito')
  })
})

describe('relato de terceiro e fato do passado não são afirmação dela', () => {
  it.each([
    'O cliente confirmou que o orçamento foi enviado e que o PDF foi anexado ao pedido dele.',
    'A planilha que você mandou foi criada em 2023, então os preços estão velhos: sugiro atualizar os 12 itens da lista.',
  ])('%s', (words) => { expect(kindOf({ words })).toBe('feito') })

  it('"ele disse que foi salvo" é relato; o que ela mesma diz depois ("salvei") continua contando', () => {
    expect(kindOf({ words: 'Ele disse que o arquivo foi salvo, mas não consegui abrir.', tools: ['Read'] })).toBe('feito')
    expect(kindOf({ words: 'A Bia disse que estava ok. Salvei o cartaz em cartaz.svg.' })).toBe('continuar')
  })
})

describe('a turn where the HOST acts for her (the conversation): routing and scheduling can be true, a file never is', () => {
  it('"já encaminhei", "agendei" and a bare "Pronto!" are not judged (the host routed or scheduled it); the other rules still hold', () => {
    expect(kindOf({ words: 'Já encaminhei o pedido para a Bia.', hadTools: false, hostActs: true })).toBe('feito')
    expect(kindOf({ words: 'Agendei a conversa com a Bia para amanhã.', hadTools: false, hostActs: true })).toBe('feito')
    expect(kindOf({ words: 'Pronto!', hadTools: false, hostActs: true })).toBe('feito')
    // without the fact the same words are held (the Task turn, where only her tools prove it)
    expect(kindOf({ words: 'Já encaminhei o pedido para a Bia.', hadTools: false })).toBe('continuar')
    expect(turn({ words: 'Me passe a senha do Instagram, por favor.', hadTools: false, hostActs: true }).verdict).toMatchObject({ kind: 'continuar', motivo: 'pediu-segredo' })
    expect(turn({ words: 'Qual é o WhatsApp da padaria?', hadTools: false, hostActs: true, known: { ownerTexts: ['meu zap é 11 98888-7777'] } }).verdict)
      .toMatchObject({ kind: 'continuar', motivo: 'pergunta-ja-respondida' })
    expect(turn({ words: 'Quer que eu ajuste o tom?', hadTools: false, hostActs: true }).verdict).toMatchObject({ kind: 'esperar-dono', motivo: 'perguntou' })
  })

  it('a FILE claim is still held in the conversation (the host never saves a file there): "Salvei a planilha" and "Fiz o cartaz" with nothing saved', () => {
    const held = turn({ words: 'Salvei a planilha na pasta do projeto.', hadTools: false, hostActs: true })
    expect(held.verdict).toMatchObject({ kind: 'continuar', motivo: 'sem-prova', rule: 'sem-prova:file' })
    expect(held.verdict.kind === 'continuar' ? held.verdict.cobranca : '').toMatch(/não tem ferramentas/u)
    expect(kindOf({ words: 'Fiz o cartaz da promoção com as cores da marca.', hadTools: false, hostActs: true })).toBe('continuar')
    expect(kindOf({ words: 'Planilha criada e salva.', hadTools: false, hostActs: true })).toBe('continuar')
    // honest words in the conversation pass: the copy is in the message
    expect(kindOf({ words: 'Fiz o texto abaixo para o cartaz: “Pão quentinho toda manhã na Padaria Lua. Venha provar!”', hadTools: false, hostActs: true })).toBe('feito')
  })
})
