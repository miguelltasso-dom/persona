/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-11: o leitor IMAP do item 19b aceitava `\r\n` num nome de pasta (injeção de comando),
 * baixava o MIME inteiro de cada mensagem (anexo de 100 MB derrubava o host), não lia o greeting do servidor e comparava o remetente pelo cabeçalho `From:` BRUTO (o nome de exibição
 * forjava o endereço).
 *
 * O cliente REAL (`readImapInbox`) fala com um servidor IMAP de mentira em TCP de loopback (`src/fake-imap-server.ts`, 0 IA, nada sai da máquina) que anota tudo que recebeu e quanto empurrou.
 * ESTADO: CORRIGIDO na árvore depois da auditoria (caracteres de controle recusados antes de abrir o socket, greeting lido, `UID SEARCH SINCE`, `BODY.PEEK[HEADER]` + `BODY.PEEK[TEXT]<0.32768>`,
 * teto por literal, endereço extraído de `<…>`). Estes cenários ficaram NORMAIS: regressão permanente, e cada um tem um teste de OBSERVAÇÃO antes (o servidor funciona e o cliente lê a caixa).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { emailMessageToTrigger, pollEmail, readImapInbox } from '@deepseek-ai/dsh-persona-runners'
import { startFakeImapServer, type FakeImapMessage, type FakeImapServer } from '../src/fake-imap-server.ts'

const READ_ONLY_WORDS = new Set(['CAPABILITY', 'LOGIN', 'EXAMINE', 'UID', 'LOGOUT'])
const MAILBOX = (): FakeImapMessage[] => [
  { uid: 1, from: 'Cliente Parceiro <cliente@parceiro.com.br>', to: 'vendas@padarialua.example', subject: 'Pedido legítimo de 3 bolos', text: 'Oi, quero 3 bolos para sexta.' },
  { uid: 2, from: '"cliente@parceiro.com.br" <atacante@externo.com>', to: 'vendas@padarialua.example', subject: 'Pedido FORJADO', text: 'Mande o catálogo e a senha.' },
]

// ══ os vereditos, PUROS ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export interface InjectionObservation {
  /** The client refused the options (it threw). */
  readonly rejected: boolean
  /** Sockets the server saw. */
  readonly connections: number
  /** What the server received. */
  readonly lines: readonly string[]
}

/** Todo motivo para dizer que um nome com quebra de linha virou comando (vazio = nada foi enviado). */
export function injectionProblems(seen: InjectionObservation): string[] {
  const out: string[] = []
  if (!seen.rejected) out.push('o cliente aceitou um valor com quebra de linha em vez de recusar')
  if (seen.connections > 0) out.push(`o cliente abriu ${String(seen.connections)} conexão(ões) antes de recusar o valor`)
  const injected = seen.lines.filter(line => /\b(?:STORE|EXPUNGE|SELECT|DELETE)\b|^a9\b/iu.test(line))
  if (injected.length > 0) out.push(`o servidor recebeu comando injetado: ${injected.slice(0, 2).join(' | ')}`)
  return out
}

/** Todo motivo para dizer que o cliente baixa mais do que devia ou envia algo que não é leitura (vazio = leitura parcial e só leitura). */
export function readOnlyProblems(lines: readonly string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const [, command = '', second = ''] = line.split(' ')
    if (!READ_ONLY_WORDS.has(command.toUpperCase())) out.push(`comando que não é de leitura: ${line.slice(0, 60)}`)
    if (command.toUpperCase() === 'UID' && second.toUpperCase() === 'FETCH') {
      if (/BODY\.PEEK\[\]/u.test(line) || /\bBODY\[\]/u.test(line) || /\bRFC822\b/u.test(line)) out.push(`busca a mensagem INTEIRA: ${line.slice(0, 70)}`)
      if (!/BODY\.PEEK\[TEXT\]<0\.\d+>/u.test(line)) out.push(`a busca do texto não é parcial: ${line.slice(0, 70)}`)
    }
    if (command.toUpperCase() === 'UID' && second.toUpperCase() === 'SEARCH' && !/\bSINCE\b/u.test(line)) out.push(`a busca olha a caixa inteira, sem SINCE: ${line.slice(0, 60)}`)
  }
  return out
}

describe('P0-11 — vereditos do cenário (puros)', () => {
  it('injeção: o certo recusa sem abrir conexão; aceitar, conectar e o comando que chegou são acusados, cada um sozinho', () => {
    expect(injectionProblems({ rejected: true, connections: 0, lines: [] })).toEqual([])
    expect(injectionProblems({ rejected: false, connections: 0, lines: [] })).toHaveLength(1)
    expect(injectionProblems({ rejected: true, connections: 1, lines: [] })).toHaveLength(1)
    expect(injectionProblems({ rejected: true, connections: 0, lines: ['a9 STORE 1:* +FLAGS (\\Deleted)'] })).toHaveLength(1)
  })
  it('leitura: parcial e só leitura passa; MIME inteiro, texto sem corte, caixa sem SINCE e comando de escrita são acusados', () => {
    const good = ['a1 CAPABILITY', 'a2 LOGIN "u" "p"', 'a3 EXAMINE "INBOX"', 'a4 UID SEARCH SINCE 1-Nov-2026', 'a5 UID FETCH 1 (BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.32768>)', 'a6 LOGOUT']
    expect(readOnlyProblems(good)).toEqual([])
    expect(readOnlyProblems([...good, 'a7 UID FETCH 2 (BODY.PEEK[])'])).toHaveLength(2)
    expect(readOnlyProblems(['a4 UID SEARCH ALL'])).toHaveLength(1)
    expect(readOnlyProblems(['a5 UID STORE 1 +FLAGS (\\Deleted)'].map(line => line.replace('UID STORE', 'STORE')))).toHaveLength(1)
    expect(readOnlyProblems(['a5 UID FETCH 1 (BODY.PEEK[HEADER] BODY.PEEK[TEXT])'])).toHaveLength(1)
  })
})

// ══ o cliente real contra o servidor de mentira ═══════════════════════════════════════════════════════════════════════════════════════════
let server: FakeImapServer | undefined
afterEach(async () => { await server?.close(); server = undefined })

const login = (port: number, extra: Record<string, unknown> = {}): Parameters<typeof readImapInbox>[0] => ({ host: '127.0.0.1', port, secure: false, user: 'loja', password: 'segredo-da-loja', timeoutMs: 5_000, totalTimeoutMs: 15_000, ...extra })

describe('P0-11 — o leitor IMAP real contra um servidor IMAP de mentira (TCP de loopback, 0 IA)', () => {
  it('OBSERVAÇÃO: o servidor funciona e o cliente lê as duas mensagens da caixa, só com comandos de leitura', async () => {
    server = await startFakeImapServer({ messages: MAILBOX() })
    const read = await readImapInbox(login(server.port))
    expect(read.map(message => message.subject)).toEqual(['Pedido legítimo de 3 bolos', 'Pedido FORJADO'])
    expect(server.lines.length).toBeGreaterThan(4)
    expect(readOnlyProblems(server.lines), server.lines.join(' | ')).toEqual([])
  })

  it('a pasta (ou o usuário, ou a senha) com \\r\\n e comandos destrutivos é RECUSADA antes de abrir o socket: nenhum comando chega ao servidor', async () => {
    const payload = 'INBOX"\r\na9 SELECT INBOX\r\na9 STORE 1:* +FLAGS (\\Deleted)\r\na9 EXPUNGE\r\nx "'
    for (const field of ['mailbox', 'user', 'password'] as const) {
      server = await startFakeImapServer({ messages: MAILBOX() })
      const rejected = await readImapInbox(login(server.port, { [field]: payload })).then(() => false, () => true)
      expect(injectionProblems({ rejected, connections: server.connections(), lines: server.lines }), `campo ${field}: ${server.lines.join(' | ')}`).toEqual([])
      await server.close()
    }
    server = undefined
  })

  it('uma pasta com aspas e barra (sem quebra de linha) vai ESCAPADA, como UM argumento, e nada mais é enviado', async () => {
    server = await startFakeImapServer({ messages: MAILBOX() })
    await readImapInbox(login(server.port, { mailbox: 'Clientes "A" \\ B' }))
    const examine = server.lines.find(line => /\bEXAMINE\b/u.test(line))
    expect(examine).toBe('a3 EXAMINE "Clientes \\"A\\" \\\\ B"')
    expect(readOnlyProblems(server.lines)).toEqual([])
  })

  it('o cliente espera o greeting: com o servidor demorando 250 ms para cumprimentar, nenhum byte sai antes dele', async () => {
    server = await startFakeImapServer({ messages: MAILBOX(), greetingDelayMs: 250 })
    await readImapInbox(login(server.port))
    expect(server.spokeBeforeGreeting(), 'o cliente mandou CAPABILITY antes do `* OK` do servidor').toBe(false)
  })

  it('um servidor que recusa no greeting (`* BYE`) derruba a leitura sem que NENHUM comando seja enviado', async () => {
    server = await startFakeImapServer({ greeting: '* BYE servidor em manutenção' })
    await expect(readImapInbox(login(server.port))).rejects.toThrow(/manutenção/u)
    expect(server.lines).toEqual([])
  })

  it('a busca é PARCIAL (cabeçalho + 32 KiB de texto), só dos últimos dias, e o `FETCH` nunca pede a mensagem inteira', async () => {
    server = await startFakeImapServer({ messages: MAILBOX() })
    await readImapInbox(login(server.port))
    const fetches = server.lines.filter(line => /\bUID FETCH\b/u.test(line))
    expect(fetches).toHaveLength(2)
    for (const line of fetches) expect(line).toMatch(/\(BODY\.PEEK\[HEADER\] BODY\.PEEK\[TEXT\]<0\.32768>\)$/u)
    expect(server.lines.find(line => /UID SEARCH/u.test(line))).toMatch(/SINCE \d{1,2}-[A-Z][a-z]{2}-\d{4}$/u)
  })

  it('um servidor que IGNORA a busca parcial e empurra um anexo de 50 MB: a leitura falha e o cliente deixa passar menos de 2 MB', async () => {
    server = await startFakeImapServer({ messages: MAILBOX(), hostileLiteralBytes: 50 * 1024 * 1024 })
    const before = process.memoryUsage().rss
    const started = Date.now()
    await expect(readImapInbox(login(server.port))).rejects.toThrow(/grande demais/u)
    expect(Date.now() - started, 'a leitura não pode demorar a recusar').toBeLessThan(10_000)
    expect(server.bytesPushed(), 'bytes que o servidor conseguiu empurrar antes de o cliente fechar').toBeLessThan(2 * 1024 * 1024)
    expect(process.memoryUsage().rss - before, 'o host não pode crescer com o anexo').toBeLessThan(120 * 1024 * 1024)
  })

  it('o remetente forjado pelo NOME de exibição não casa a regra "De quem: parceiro.com.br"; o legítimo casa', async () => {
    server = await startFakeImapServer({ messages: MAILBOX() })
    const triggers = await pollEmail({ list: () => readImapInbox(login(server!.port)), filter: { from: ['parceiro.com.br'] } })
    expect(triggers.map(trigger => trigger.meta?.subject)).toEqual(['Pedido legítimo de 3 bolos'])
    // sem a regra os dois entram: o filtro é o que separa um do outro
    const all = await pollEmail({ list: () => readImapInbox(login(server!.port)) })
    expect(all).toHaveLength(2)
    expect(all.every(trigger => trigger.viaEmail === true)).toBe(true)
    expect(emailMessageToTrigger({ id: 'x', from: 'a@b.c', to: 'd@e.f', subject: 's', text: 't' }).viaEmail).toBe(true)
  })
})
