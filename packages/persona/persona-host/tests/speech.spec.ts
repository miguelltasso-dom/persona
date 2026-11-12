/**
 * Item 4 of the harvest: simple speech by default, technical detail folded, the right to stay silent.
 * Pure module: no host, no model. Each rule has the sentence that used to leak and the sentence that must stay.
 */
import { readChoiceMarker, readIndicatorMarker } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it } from 'vitest'
import {
  codeify,
  DETAILS_LEAD,
  PASS_TOKEN,
  clipSpeech,
  composeSpeech,
  isTechnical,
  passRule,
  readPass,
  shapeSpeech,
  speakToOwner,
  speechRules,
  splitDetails,
  streamSafe,
} from '../src/speech.ts'

const lean = (text: string): string => text.split(/\s+/u).slice(0, 100).join(' ')

describe('silence: the token never reaches the thread', () => {
  it('a reply that is only the token (in any spelling a model produces) is a pass', () => {
    const spellings = [
      PASS_TOKEN, '[[passar-a-vez]]', '[[ Passar a vez ]]', '[passar_a_vez]', '[[PASSO A VEZ]]', '[[pass]]', '[[NO_REPLY]]', 'NO_REPLY',
      'no_reply', '(no reply)', '<pass/>', '**[[passar-a-vez]]**', '`[[passar-a-vez]]`', '```\n[[passar-a-vez]]\n```', '"[[passar-a-vez]]"',
      '[[silêncio]]', '[[nada a acrescentar]]', '  \n[[passar-a-vez]]\n ', '[[passar-a-vez: já respondido pela Bia]]',
    ]
    for (const raw of spellings) expect(readPass(raw), raw).toEqual({ passed: true, text: '' })
  })

  it('the token first and a short reason after it is still a pass (the reason is not for the thread)', () => {
    expect(readPass('[[passar-a-vez]] A Bia já respondeu.')).toEqual({ passed: true, text: '' })
    expect(readPass('NO_REPLY — nada a acrescentar')).toEqual({ passed: true, text: '' })
  })

  it('a token next to a real answer is dropped and the answer stays (never loses text)', () => {
    expect(readPass('O cartaz está pronto. [[passar-a-vez]]')).toEqual({ passed: false, text: 'O cartaz está pronto.' })
    expect(readPass('Segue o texto: pão quente às 7h.\n\n[[NO_REPLY]]').text).toBe('Segue o texto: pão quente às 7h.')
    const long = `[[passar-a-vez]] ${'Resposta de verdade. '.repeat(30)}`
    const kept = readPass(long)
    expect(kept.passed).toBe(false)
    expect(kept.text).not.toMatch(/passar-a-vez/iu)
  })

  it('an ordinary reply is untouched, even when it talks about passing or silence', () => {
    for (const raw of ['Passo a mão para a Bia amanhã.', 'Fiquei em silêncio na reunião.', 'No reply from the client yet?', 'Vou [passar] no mercado.']) {
      expect(readPass(raw), raw).toEqual({ passed: false, text: raw })
    }
  })

  it('a half-typed token never flashes in a streaming bubble', () => {
    for (const piece of ['[', '[[', '[[pas', '[[passar-a-', '[[passar-a-vez]', '<pa', '(no re', 'NO_', 'NO_REP', 'no-rep']) {
      expect(streamSafe(piece), piece).toBe('')
    }
    expect(streamSafe('[[passar-a-vez]]')).toBe('')
    expect(streamSafe('Olá, tudo bem?')).toBe('Olá, tudo bem?')
    expect(streamSafe('Olá. [[passar-a-vez]]')).toBe('Olá.')
    expect(streamSafe('[Atenção] o forno desligou')).toBe('[Atenção] o forno desligou')
    expect(streamSafe('Nova mensagem')).toBe('Nova mensagem')
  })

  it('no input shape lets a token through shapeSpeech', () => {
    const shapes = ['x [[passar-a-vez]] y', '[[passar-a-vez]]', 'Pronto.\n\n<details><summary>Detalhes</summary>\nok [[NO_REPLY]]\n</details>', 'a\n[[pass]]\nb']
    for (const raw of shapes) {
      const out = shapeSpeech(raw, { lean })
      expect(out.text, raw).not.toMatch(/\[\[|NO_REPLY|passar-a-vez/iu)
    }
    expect(shapeSpeech('[[passar-a-vez]]', { lean })).toEqual({ text: '', passed: true, folded: false })
  })

  it('the prompt rule names the exact token and the permission', () => {
    expect(passRule()).toContain(PASS_TOKEN)
  })
})

describe('owner vocabulary: "a pessoa" is the engine\'s word, a colleague says você', () => {
  it('rewrites the leaks the Carbon review found, with the right person and case', () => {
    expect(speakToOwner('Opinião sobre a arte, antes da aprovação da pessoa.')).toBe('Opinião sobre a arte, antes da sua aprovação.')
    expect(speakToOwner('Tudo depende dos dados do usuário.')).toBe('Tudo depende dos seus dados.')
    expect(speakToOwner('Ainda não aprovei nada: a aprovação é da pessoa.')).toContain('é de você')
    expect(speakToOwner('Usei os dados que a pessoa passou como texto provisório.')).toBe('Usei os dados que você passou como texto provisório.')
    expect(speakToOwner('A pessoa pediu o cartaz.')).toBe('Você pediu o cartaz.')
    expect(speakToOwner('Mando para a pessoa revisar.')).toBe('Mando para você revisar.')
    expect(speakToOwner('Foi aprovado pela pessoa.')).toBe('Foi aprovado por você.')
    expect(speakToOwner('o usuário clicou em enviar')).toBe('você clicou em enviar')
  })

  it('keeps a description of a third party and the plural', () => {
    expect(speakToOwner('Liguei para a pessoa que fez a encomenda.')).toBe('Liguei para a pessoa que fez a encomenda.')
    expect(speakToOwner('A pessoa de contato do fornecedor atende às 9h.')).toBe('A pessoa de contato do fornecedor atende às 9h.')
    expect(speakToOwner('Duas pessoas pediram pão.')).toBe('Duas pessoas pediram pão.')
    expect(speakToOwner('uma pessoa qualquer')).toBe('uma pessoa qualquer')
  })
})

describe('simple speech: what moves into the fold', () => {
  const technical = [
    'O arquivo ficou em C:\\Users\\migue\\dev\\persona\\inputs\\foto.png.',
    'Salvei em packages/persona/persona-host/src/speech.ts.',
    'Falhou com ENOENT na leitura.',
    'A API respondeu HTTP 503.',
    'O commit é 3213b015e3.',
    'O pedido tem "taskId": 42 no corpo.',
    'Chamei pass_forward para a Lia.',
    'RealTurnCapError: limite atingido.',
    'Rodei pnpm exec vitest agora.',
    'Veja src/main.ts:42:7 para o erro.',
    'Use a flag --exclusive no comando.',
  ]
  it('detects a path, a code, a hash, a JSON key and a tool name', () => {
    for (const sentence of technical) expect(isTechnical(sentence), sentence).toBe(true)
  })

  it('never flags what an owner reads in a normal day', () => {
    const plain = [
      'O cartaz ficou pronto em cartaz-pao-de-queijo.svg.',
      'Mandei o orçamento.pdf para o cliente.',
      'A entrega é dia 11/11/2026 às 7h.',
      'Pão de queijo, 2 por R$ 9/dia.',
      'Confira em https://padaria.com.br/cardapio/sabado.',
      'Fale com a pessoa do balcão e/ou com a gerente.',
      'Preciso de 24/7 no WhatsApp (11) 91234-5678.',
      'Decidiu que o decade ficaria igual.',
    ]
    for (const sentence of plain) expect(isTechnical(sentence), sentence).toBe(false)
  })

  it('keeps the plain sentences, folds the technical one into ONE details block at the end', () => {
    const raw = 'Pronto, o cartaz está no rascunho. Salvei em packages/persona/persona-host/src/speech.ts. Quer que eu mude a cor?'
    const out = shapeSpeech(raw, { lean })
    expect(out.folded).toBe(true)
    expect(out.text.startsWith('Pronto, o cartaz está no rascunho. Quer que eu mude a cor?')).toBe(true)
    expect(out.text).toContain('<details><summary>Detalhes</summary>')
    expect(out.text.split('<details').length).toBe(2)
    const { visible, details } = splitDetails(out.text)
    expect(visible).not.toMatch(/packages\//u)
    expect(details.join('\n')).toContain('packages/persona/persona-host/src/speech.ts')
  })

  it('a reply that is all technical keeps a plain lead so the thread never shows a bare fold', () => {
    const out = shapeSpeech('Falhou com ENOENT na leitura.', { lean })
    expect(out.text.startsWith(DETAILS_LEAD)).toBe(true)
    expect(out.text).toContain('ENOENT')
  })

  it('a numbered step the owner must follow stays visible and keeps its line breaks', () => {
    const raw = 'Para ligar a conta:\n1. Abra Configurações.\n2. Clique em Conectar.\n3. Cole o código.'
    const out = shapeSpeech(raw, { lean })
    expect(out.folded).toBe(false)
    expect(out.text.split('\n')).toEqual(['Para ligar a conta:', '1. Abra Configurações.', '2. Clique em Conectar.', '3. Cole o código.'])
  })

  it('a code block folds in the simple register and stays in the technical one', () => {
    const raw = 'Ajustei o botão.\n```ts\nconst a = 1\n```\nFicou melhor.'
    const simple = shapeSpeech(raw, { lean })
    // the plain prose still goes through the lean reply, which keeps one paragraph (OPT-6)
    expect(simple.text).toMatch(/^Ajustei o botão\. Ficou melhor\.\n\n<details>/u)
    expect(simple.text).toContain('const a = 1')
    const technicalOut = shapeSpeech(raw, { style: 'technical', lean })
    expect(technicalOut.text).not.toContain('<details')
    expect(technicalOut.text).toContain('const a = 1')
  })

  it('the technical register keeps paths in the text', () => {
    const out = shapeSpeech('Salvei em src/speech.ts e o commit é 3213b015e3.', { style: 'technical', lean })
    expect(out.text).toBe('Salvei em src/speech.ts e o commit é 3213b015e3.')
    expect(out.folded).toBe(false)
  })

  it('report headings are not thread text: the audit sections fold, the labels of a delivery go', () => {
    const raw = '**Entrega:** Texto do cartaz pronto.\n**Decisões que tomei:** usei o número que o cliente passou.\n**O que não fiz e por quê:** não criei arquivos.'
    const out = shapeSpeech(raw, { lean })
    const { visible, details } = splitDetails(out.text)
    expect(visible).toBe('Texto do cartaz pronto.')
    expect(details.join('\n')).toMatch(/usei o número/u)
    expect(details.join('\n')).toMatch(/não criei arquivos/u)
    expect(out.text).not.toMatch(/\*\*Entrega|Decisões que tomei:|O que não fiz/u)
  })

  it('an existing details block of the model is kept (merged with what was folded), summary normalised', () => {
    const raw = 'Feito.\n<details><summary>Ver como fiz</summary>\n\nPassos usados.\n</details>'
    const out = shapeSpeech(raw, { lean })
    expect(out.text).toBe('Feito.\n\n<details><summary>Detalhes</summary>\n\nPassos usados.\n\n</details>')
  })

  it('speaks to the owner as você inside the shape', () => {
    expect(shapeSpeech('Avisei que a pessoa aprovou o texto.', { lean }).text).toBe('Avisei que você aprovou o texto.')
  })

  it('echo of the person\'s line and narration are still removed (the lean reply is kept)', () => {
    const out = shapeSpeech('Qual o horário? Abrimos às 7h.', { lean: (text, user) => text.slice(user.length).trim(), userText: 'Qual o horário?' })
    expect(out.text).toBe('Abrimos às 7h.')
  })
})

describe('codeify: what is technical inside the fold is code, so the client draws it mono on the wash', () => {
  it('wraps a path, a code file, a hash, an error code and a tool name; leaves the sentence\'s own punctuation outside', () => {
    expect(codeify('Salvei em packages/persona/persona-host/src/speech.ts.')).toBe('Salvei em `packages/persona/persona-host/src/speech.ts`.')
    expect(codeify('O arquivo C:\\Users\\ana\\horario.json falhou com ENOENT.')).toBe('O arquivo `C:\\Users\\ana\\horario.json` falhou com `ENOENT`.')
    expect(codeify('O commit é 3213b015e3 e chamei pass_forward.')).toBe('O commit é `3213b015e3` e chamei `pass_forward`.')
    expect(codeify('Rodei com --exclusive agora.')).toBe('Rodei com `--exclusive` agora.')
  })

  it('does not wrap what is already code, a plain sentence, a date or a link', () => {
    expect(codeify('Veja `src/a.ts` e `pass_forward`.')).toBe('Veja `src/a.ts` e `pass_forward`.')
    expect(codeify('Abrimos às 7h, dia 11/11/2026, em https://padaria.com.br/cardapio/sabado.')).toBe('Abrimos às 7h, dia 11/11/2026, em https://padaria.com.br/cardapio/sabado.')
  })

  it('shapeSpeech folds a technical sentence WITH its path as code (the sentence in the thread stays plain)', () => {
    const out = shapeSpeech('Pronto, está no rascunho. Salvei em packages/persona/persona-host/src/speech.ts.', { lean })
    const { visible, details } = splitDetails(out.text)
    expect(visible).toBe('Pronto, está no rascunho.')
    expect(details.join('\n')).toBe('Salvei em `packages/persona/persona-host/src/speech.ts`.')
  })
})

describe('the fold and the 100-word cap', () => {
  const words = (count: number, prefix: string): string => Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`).join(' ')

  it('the visible part is capped at 100 words and the fold keeps its own 300', () => {
    const raw = `${words(150, 'v')}\n\n<details><summary>Detalhes</summary>\n\n${words(400, 'd')}\n\n</details>`
    const out = clipSpeech(raw, lean)
    const { visible, details } = splitDetails(out)
    expect(visible.split(/\s+/u).length).toBe(100)
    expect((details[0] ?? '').split(/\s+/u).length).toBe(300)
    expect(out.endsWith('</details>')).toBe(true)
  })

  it('a cut never leaves an unclosed tag, and plain text goes through the old clip untouched', () => {
    const out = clipSpeech(`${words(200, 'v')}\n<details>\n${words(500, 'd')}`, lean)
    expect(out.match(/<details/gu)?.length).toBe(1)
    expect(out.match(/<\/details>/gu)?.length).toBe(1)
    expect(clipSpeech('Olá, tudo bem?', lean)).toBe('Olá, tudo bem?')
  })

  it('composeSpeech with nothing folded is just the visible text', () => {
    expect(composeSpeech('Oi.', [])).toBe('Oi.')
    expect(composeSpeech('Oi.', ['  '])).toBe('Oi.')
  })
})

describe('S1 P1-06: the structured markers are the host\'s, not prose — the speech layer leaves them whole', () => {
  const INDICATOR = '[[indicador: {"tipo":"numero","nome":"Vendas de ontem","valor":"R$ 1.240","bruto":1240,"tendencia":"+12% desde ontem","direcao":"sobe","bomQuando":"sobe"}]]'
  const FILES = '[[escolha: Qual formato prefere? | planilha.csv | relatorio.json]]'
  const prose = (count: number): string => Array.from({ length: count }, (_, index) => `palavra${String(index)}`).join(' ')

  it('an indicator keeps its JSON: its keys are not "a technical sentence" to fold or wrap in code', () => {
    const spoken = shapeSpeech(`As vendas subiram esta semana.\n${INDICATOR}`)
    expect(spoken.text).toContain(INDICATOR)
    expect(spoken.text).not.toContain('<details')
    expect(readIndicatorMarker(spoken.text).offer).toMatchObject({ name: 'Vendas de ontem', data: { kind: 'numero', value: 'R$ 1.240' } })
    expect(readIndicatorMarker(spoken.text).text).toBe('As vendas subiram esta semana.')
  })

  it('a choice that names files keeps its labels exactly (no backticks around planilha.csv)', () => {
    const spoken = shapeSpeech(`Posso mandar de dois jeitos.\n${FILES}`)
    expect(spoken.text).toContain(FILES)
    expect(readChoiceMarker(spoken.text).card?.options.map(option => option.label)).toEqual(['planilha.csv', 'relatorio.json'])
  })

  it('the 100-word clip never cuts a marker in the middle (an unclosed marker erases the whole card)', () => {
    const raw = `${prose(95)}\n\n[[escolha: Qual caminho seguimos agora para o cliente? | primeiro | segundo | terceiro]]`
    const clipped = clipSpeech(raw, lean)
    const read = readChoiceMarker(clipped)
    expect(read.card?.options).toHaveLength(3)
    expect(read.text.split(/\s+/u).length).toBeLessThanOrEqual(100)
    // and through the whole shape, with the channel's own clip
    const shaped = shapeSpeech(raw, { lean })
    expect(readChoiceMarker(shaped.text).card?.options).toHaveLength(3)
    expect(readChoiceMarker(clipSpeech(shaped.text, lean)).card?.options).toHaveLength(3)
  })

  it('a card with a fold: the card stays outside the <details>', () => {
    const raw = `Prontinho.\n\n<details><summary>Detalhes</summary>\n\n${prose(40)}\n\n</details>\n\n${FILES}`
    const out = clipSpeech(raw, lean)
    expect(out.indexOf('[[escolha:')).toBeGreaterThan(out.indexOf('</details>'))
    expect(readChoiceMarker(out).card).toBeDefined()
  })

  it('a marker still arriving (not closed yet) is never shown half-written nor folded', () => {
    const streaming = shapeSpeech('Posso mandar de dois jeitos. [[escolha: Qual formato prefere? | planilha.c')
    expect(readChoiceMarker(streaming.text).text).toBe('Posso mandar de dois jeitos.')
  })
})

describe('the prompt rules', () => {
  it('simple is the default and says the four things; technical lifts the path rule only', () => {
    const simple = speechRules()
    expect(simple).toBe(speechRules('simple'))
    expect(simple).toMatch(/1 ou 2 frases/u)
    expect(simple).toMatch(/“você”/u)
    expect(simple).toMatch(/caminho de pasta/u)
    expect(simple).toContain('<details><summary>Detalhes</summary>')
    expect(speechRules('technical')).toMatch(/pode citar caminhos/u)
    expect(speechRules('technical')).toMatch(/“você”/u)
  })

  it('is short enough to ride in every cached prefix', () => {
    expect(speechRules().split(/\s+/u).length).toBeLessThan(110)
  })
})
