/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-14, a parte de CRIPTOGRAFIA de `persona-sync` (E2EE, H23/F1):
 *   - `sealHeader`/`wrapHeader` juntavam campos variáveis com `\n`, sem tamanho nem validação: ("a\nb", "c") e ("a", "b\nc") davam o MESMO cabeçalho (o AAD da cifra e o que se assina);
 *   - `wrapSigned` concatenava `epk + ct` sem separador;
 *   - uma chave pública X25519 de ordem baixa (ex.: 43 × "A") lançava `ERR_CRYPTO_OPERATION_FAILED` CRU do OpenSSL em vez de um erro tipado.
 * (O outro ponto do P0-14, o sync que ainda mandava `{ clear }`, e "o removido não lê a época nova" têm o cenário com DOIS hosts reais e o worker de verdade em
 * `apps/persona-edge/tests/e2ee-remote.spec.ts`, escrito no sprint de correção: não se duplica aqui; ele roda na reauditoria.)
 *
 * ESTADO: CORRIGIDO na árvore depois da auditoria (`frameFields`: cada campo com o seu tamanho em bytes; `agreeOrBadKey`: `ChannelCryptoError('BAD_KEY')`). Os cenários ficaram NORMAIS:
 * regressão permanente, puros (sem host, sem rede, sem IA), cada um com a observação do caminho feliz antes.
 */
import { ChannelCryptoError, generateIdentity, newChannelKey, openChannel, sealChannel, unwrapChannelKey, wrapChannelKey, type WrapContext } from '@deepseek-ai/dsh-persona-sync'
import { describe, expect, it } from 'vitest'

/** O que uma tentativa que DEVIA ser recusada fez: abriu, recusou com erro TIPADO, ou estourou uma exceção crua. */
export type Outcome = { readonly kind: 'opened' } | { readonly kind: 'typed'; readonly code: string } | { readonly kind: 'raw'; readonly message: string }

export function attempt(run: () => unknown): Outcome {
  try {
    run()
    return { kind: 'opened' }
  } catch (error: unknown) {
    if (error instanceof ChannelCryptoError) return { kind: 'typed', code: error.code }
    return { kind: 'raw', message: error instanceof Error ? error.message.slice(0, 80) : String(error).slice(0, 80) }
  }
}

/** O veredito, PURO: uma tentativa que devia ser recusada tem de ser recusada com erro TIPADO (vazio = certo). */
export function refusalProblems(what: string, outcome: Outcome): string[] {
  if (outcome.kind === 'opened') return [`${what}: foi ACEITO (devia ser recusado)`]
  if (outcome.kind === 'raw') return [`${what}: estourou uma exceção crua em vez de erro tipado (${outcome.message})`]
  return []
}

describe('P0-14 criptografia — vereditos do cenário (puros)', () => {
  it('aceitar e exceção crua são acusados; o erro tipado passa', () => {
    expect(refusalProblems('x', { kind: 'typed', code: 'BAD_KEY' })).toEqual([])
    expect(refusalProblems('x', { kind: 'opened' })).toHaveLength(1)
    expect(refusalProblems('x', { kind: 'raw', message: 'ERR_CRYPTO_OPERATION_FAILED' })).toHaveLength(1)
  })
})

const author = generateIdentity()
const owner = generateIdentity()
const member = generateIdentity()

describe('P0-14 — o selo da mensagem amarra o canal por TAMANHO, não por separador', () => {
  it('OBSERVAÇÃO: uma mensagem selada abre no SEU contexto e só nele', () => {
    const key = newChannelKey()
    const sealed = sealChannel({ workspaceId: 'ws', streamId: 'geral', epoch: 1, authorId: 'ana', key, signingSeed: author.signing.seed, plaintext: 'a promoção é 2 por R$ 9' })
    expect(openChannel(sealed, { workspaceId: 'ws', streamId: 'geral', key, authorSigningPublic: author.signing.publicKey })).toBe('a promoção é 2 por R$ 9')
    expect(sealed).not.toHaveProperty('plaintext')
    expect(JSON.stringify(sealed)).not.toContain('promoção')
  })

  it('("a\\nb", "c") e ("a", "b\\nc") são contextos DIFERENTES: a mensagem selada num não abre no outro', () => {
    const key = newChannelKey()
    const sealed = sealChannel({ workspaceId: 'a\nb', streamId: 'c', epoch: 1, authorId: 'ana', key, signingSeed: author.signing.seed, plaintext: 'segredo do canal c' })
    const moved = attempt(() => openChannel(sealed, { workspaceId: 'a', streamId: 'b\nc', key, authorSigningPublic: author.signing.publicKey }))
    expect(refusalProblems('a mensagem selada em (a\\nb, c) aberta em (a, b\\nc)', moved)).toEqual([])
    const home = attempt(() => openChannel(sealed, { workspaceId: 'a\nb', streamId: 'c', key, authorSigningPublic: author.signing.publicKey }))
    expect(home.kind, 'no SEU contexto ela abre').toBe('opened')
  })

  it('o autor e a época também entram no selo: trocar o autor (mesmo com ":" e dígitos) ou a época não abre', () => {
    const key = newChannelKey()
    const sealed = sealChannel({ workspaceId: 'ws', streamId: 'geral', epoch: 1, authorId: 'ana', key, signingSeed: author.signing.seed, plaintext: 'oi' })
    const open = { workspaceId: 'ws', streamId: 'geral', key, authorSigningPublic: author.signing.publicKey }
    expect(refusalProblems('autor trocado', attempt(() => openChannel({ ...sealed, authorId: 'bia' }, open)))).toEqual([])
    expect(refusalProblems('época trocada', attempt(() => openChannel({ ...sealed, epoch: 2 }, open)))).toEqual([])
    expect(refusalProblems('texto cifrado adulterado', attempt(() => openChannel({ ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + 'AAAA' }, open)))).toEqual([])
  })
})

const WRAP: WrapContext = { workspaceId: 'ws', channelId: 'geral', epoch: 1, recipientId: 'caio', by: 'ana' }

describe('P0-14 — o embrulho da chave do canal amarra o destino por TAMANHO e recusa chave pública inválida com erro TIPADO', () => {
  it('OBSERVAÇÃO: a chave embrulhada para o Caio abre para o Caio, e só com o contexto certo', () => {
    const key = newChannelKey()
    const wrap = wrapChannelKey(WRAP, { key, recipientAgreementPublic: member.agreement.publicKey, signingSeed: owner.signing.seed })
    const opened = unwrapChannelKey(wrap, WRAP, { agreementSecret: member.agreement.secret, agreementPublic: member.agreement.publicKey, wrapperSigningPublic: owner.signing.publicKey })
    expect(Buffer.compare(opened, Buffer.from(key))).toBe(0)
    expect(wrap.ct).not.toContain(Buffer.from(key).toString('base64'))
  })

  it('("a\\nb", "c") e ("a", "b\\nc") no embrulho: o embrulho feito para um canal não abre no outro', () => {
    const key = newChannelKey()
    const here: WrapContext = { ...WRAP, workspaceId: 'a\nb', channelId: 'c' }
    const there: WrapContext = { ...WRAP, workspaceId: 'a', channelId: 'b\nc' }
    const wrap = wrapChannelKey(here, { key, recipientAgreementPublic: member.agreement.publicKey, signingSeed: owner.signing.seed })
    const input = { agreementSecret: member.agreement.secret, agreementPublic: member.agreement.publicKey, wrapperSigningPublic: owner.signing.publicKey }
    expect(refusalProblems('embrulho de (a\\nb, c) aberto em (a, b\\nc)', attempt(() => unwrapChannelKey(wrap, there, input)))).toEqual([])
    expect(attempt(() => unwrapChannelKey(wrap, here, input)).kind, 'no SEU contexto ele abre').toBe('opened')
  })

  it('destinatário e quem embrulhou não trocam caracteres entre si ("ca"+"io:ana" × "caio"+":ana")', () => {
    const key = newChannelKey()
    const real: WrapContext = { ...WRAP, recipientId: 'ca', by: 'io:ana' }
    const forged: WrapContext = { ...WRAP, recipientId: 'caio', by: ':ana' }
    const wrap = wrapChannelKey(real, { key, recipientAgreementPublic: member.agreement.publicKey, signingSeed: owner.signing.seed })
    const input = { agreementSecret: member.agreement.secret, agreementPublic: member.agreement.publicKey, wrapperSigningPublic: owner.signing.publicKey }
    expect(refusalProblems('destinatário/quem embrulhou trocados', attempt(() => unwrapChannelKey({ ...wrap, by: ':ana' }, forged, input)))).toEqual([])
  })

  it.each([
    ['43 × "A" (o ponto no infinito, ordem baixa)', 'A'.repeat(43)],
    ['vazia', ''],
    ['não é base64url', '!!!não-é-chave!!!'],
    ['curta demais', 'AAAA'],
    ['longa demais', 'A'.repeat(200)],
  ])('chave pública do destinatário %s → ChannelCryptoError tipado (BAD_KEY), nunca a exceção crua do OpenSSL', (_name, bad) => {
    const outcome = attempt(() => wrapChannelKey(WRAP, { key: newChannelKey(), recipientAgreementPublic: bad, signingSeed: owner.signing.seed }))
    expect(refusalProblems(`chave ${_name}`, outcome)).toEqual([])
    expect(outcome).toEqual({ kind: 'typed', code: 'BAD_KEY' })
  })

  it('a chave do canal com o tamanho errado também é recusada com erro tipado', () => {
    expect(attempt(() => wrapChannelKey(WRAP, { key: new Uint8Array(16), recipientAgreementPublic: member.agreement.publicKey, signingSeed: owner.signing.seed }))).toEqual({ kind: 'typed', code: 'BAD_KEY' })
  })
})
