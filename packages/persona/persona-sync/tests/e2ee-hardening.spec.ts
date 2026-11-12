/**
 * Carbon P0-14 (sprint de correção): the E2EE framing and its failure modes.
 *  - the header the encryption and the signature are bound to is LENGTH-PREFIXED, so a "\n" inside an id can never move a boundary: ("a\nb","c") and ("a","b\nc") are different places;
 *  - an invalid or low-order X25519 key is a TYPED refusal (`ChannelCryptoError`), never the raw OpenSSL exception;
 *  - a wrap whose ephemeral key / ciphertext boundary was shifted is refused as `BAD_WRAP`.
 */
import { describe, expect, it } from 'vitest'
import {
  ChannelCryptoError, generateIdentity, newChannelKey, openChannel, sealChannel, unwrapChannelKey, verifySealedSignature, wrapChannelKey,
  type WrapContext,
} from '../src/index.ts'

const ana = generateIdentity()
const bia = generateIdentity()
const codeOf = (action: () => unknown): string | undefined => {
  try { action(); return undefined }
  catch (error: unknown) { return error instanceof ChannelCryptoError ? error.code : `CRU:${error instanceof Error ? error.name : String(error)}` }
}

describe('a message is bound to ONE place: a newline inside an id cannot move a boundary', () => {
  const key = newChannelKey()
  const sealedIn = (workspaceId: string, streamId: string, authorId = 'ana') =>
    sealChannel({ workspaceId, streamId, epoch: 1, authorId, key, signingSeed: ana.signing.seed, plaintext: 'só aqui' })

  it('("a\\nb","c") and ("a","b\\nc") are different places: the payload sealed for one is refused in the other (signature AND decryption)', async () => {
    const sealed = sealedIn('a\nb', 'c')
    expect(open(sealed, 'a\nb', 'c')).toBe('só aqui')
    expect(codeOf(() => open(sealed, 'a', 'b\nc'))).toBe('BAD_SIGNATURE')
    expect(await verifySealedSignature(sealed, { workspaceId: 'a', streamId: 'b\nc' }, ana.signing.publicKey)).toBe(false)
    expect(await verifySealedSignature(sealed, { workspaceId: 'a\nb', streamId: 'c' }, ana.signing.publicKey)).toBe(true)
  })

  it('guard: the stream/author side is already closed by the epoch between them: forging the payload\'s authorId ("d\\nana" -> "ana") on stream "c\\nd" is refused', async () => {
    const sealed = sealedIn('ws', 'c', 'd\nana')
    expect(open(sealed, 'ws', 'c')).toBe('só aqui')
    expect(codeOf(() => open({ ...sealed, authorId: 'ana' }, 'ws', 'c\nd'))).toBe('BAD_SIGNATURE')
    expect(await verifySealedSignature({ ...sealed, authorId: 'ana' }, { workspaceId: 'ws', streamId: 'c\nd' }, ana.signing.publicKey)).toBe(false)
  })

  it('and ids with multi-byte letters still frame exactly (lengths count BYTES)', async () => {
    const acento = sealedIn('equipe-ç', 'canal:atendimento')
    expect(open(acento, 'equipe-ç', 'canal:atendimento')).toBe('só aqui')
    expect(await verifySealedSignature(acento, { workspaceId: 'equipe-ç', streamId: 'canal:atendimento' }, ana.signing.publicKey)).toBe(true)
  })

  function open(sealed: ReturnType<typeof sealedIn>, workspaceId: string, streamId: string, _authorHint?: string): string {
    return openChannel(sealed, { workspaceId, streamId, key, authorSigningPublic: ana.signing.publicKey })
  }
})

describe('a key wrap is bound to ONE place too', () => {
  const key = newChannelKey()
  const wrapIn = (workspaceId: string, channelId: string, recipientId = 'bia', by = 'ana') =>
    wrapChannelKey({ workspaceId, channelId, epoch: 1, recipientId, by }, { key, recipientAgreementPublic: bia.agreement.publicKey, signingSeed: ana.signing.seed })
  const unwrapIn = (wrap: ReturnType<typeof wrapIn>, context: WrapContext) =>
    unwrapChannelKey(wrap, context, { agreementSecret: bia.agreement.secret, agreementPublic: bia.agreement.publicKey, wrapperSigningPublic: ana.signing.publicKey })

  it('a wrap made for ("a\\nb","c") does not open for ("a","b\\nc"), nor for another recipient/wrapper split by a newline', () => {
    const wrap = wrapIn('a\nb', 'c')
    expect(unwrapIn(wrap, { workspaceId: 'a\nb', channelId: 'c', epoch: 1, recipientId: 'bia', by: 'ana' }).equals(key)).toBe(true)
    expect(codeOf(() => unwrapIn(wrap, { workspaceId: 'a', channelId: 'b\nc', epoch: 1, recipientId: 'bia', by: 'ana' }))).toBe('BAD_WRAP')
    // the recipient/wrapper boundary: a wrap made for recipient "bia\nx" by "ana", its declared wrapper rewritten to "x\nana", must not open for recipient "bia"
    const second = wrapIn('ws', 'canal', 'bia\nx', 'ana')
    expect(codeOf(() => unwrapIn({ ...second, by: 'x\nana' }, { workspaceId: 'ws', channelId: 'canal', epoch: 1, recipientId: 'bia', by: 'x\nana' }))).toBe('BAD_WRAP')
  })

  it('moving a character between the ephemeral key and the ciphertext breaks the wrap with a TYPED error (the signature covers each field with its length)', () => {
    const wrap = wrapIn('ws', 'canal')
    const shifted = { ...wrap, epk: wrap.epk + wrap.ct.slice(0, 1), ct: wrap.ct.slice(1) }
    expect(codeOf(() => unwrapIn(shifted, { workspaceId: 'ws', channelId: 'canal', epoch: 1, recipientId: 'bia', by: 'ana' }))).toBe('BAD_WRAP')
  })
})

describe('an invalid or low-order X25519 key is a typed refusal, never a raw OpenSSL exception', () => {
  const key = newChannelKey()
  const context: WrapContext = { workspaceId: 'ws', channelId: 'canal', epoch: 1, recipientId: 'mal', by: 'ana' }
  const wrapFor = (recipientAgreementPublic: string) => () => wrapChannelKey(context, { key, recipientAgreementPublic, signingSeed: ana.signing.seed })
  const b64u = (hex: string): string => Buffer.from(hex, 'hex').toString('base64url')

  it.each([
    ['all zeros (the point at infinity)', 'A'.repeat(43)],
    ['the order-8 point e0eb7a7c…', b64u('e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800')],
    ['the order-8 point 5f9c95bc…', b64u('5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157')],
    ['the point 1 (order 4)', b64u('0100000000000000000000000000000000000000000000000000000000000000')],
    ['too short', 'curta'],
    ['not base64url', 'isto não é uma chave!!'],
  ])('%s', (_name, publicKey) => {
    expect(codeOf(wrapFor(publicKey))).toBe('BAD_KEY')
  })

  it('a healthy key still wraps (the guard refuses only what is unusable)', () => {
    expect(codeOf(wrapFor(bia.agreement.publicKey))).toBeUndefined()
  })
})
