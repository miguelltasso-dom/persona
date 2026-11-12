/**
 * H23 / F1 (Entrega 2): the channel key, how it reaches a member and how a message is sealed. Proves: only members holding the key of the epoch read; a payload cannot be
 * moved to another channel, epoch or author; a wrap opens only for its recipient and only from its wrapper; the edge's WebCrypto verifier agrees with the host's;
 * and a member who is removed cannot read the NEXT epoch.
 */
import type { ChannelSealedPayload } from '@deepseek-ai/dsh-persona-core'
import { describe, expect, it } from 'vitest'
import {
  ChannelCryptoError, ChannelKeyring, generateIdentity, newChannelKey, openChannel, publicIdentity, sealChannel, unwrapChannelKey, verifySealedSignature, wrapChannelKey,
  type Identity, type WrapContext,
} from '../src/index.ts'

const WS = 'ws-1'
const CHANNEL = 'channel:marketing'

const ana = generateIdentity() // owner / admin
const bia = generateIdentity()
const caio = generateIdentity()

const seal = (key: Buffer, plaintext: string, epoch = 1, who: Identity = ana, authorId = 'ana', streamId = CHANNEL): ChannelSealedPayload =>
  sealChannel({ workspaceId: WS, streamId, epoch, authorId, key, signingSeed: who.signing.seed, plaintext })
const open = (sealed: ChannelSealedPayload, key: Buffer, author: Identity = ana, streamId = CHANNEL): string =>
  openChannel(sealed, { workspaceId: WS, streamId, key, authorSigningPublic: author.signing.publicKey })
const codeOf = (action: () => unknown): string | undefined => {
  try { action(); return undefined }
  catch (error: unknown) { return error instanceof ChannelCryptoError ? error.code : `OUTRO:${String(error)}` }
}

describe('a message', () => {
  it('opens with the channel key and is signed by its author', () => {
    const key = newChannelKey()
    const sealed = seal(key, 'Bom dia, equipe! 🥐')
    expect(sealed.alg).toBe('channel')
    expect(sealed.ciphertext).not.toContain('Bom dia')
    expect(open(sealed, key)).toBe('Bom dia, equipe! 🥐')
  })

  it('the same text sealed twice never repeats (fresh IV every time)', () => {
    const key = newChannelKey()
    expect(seal(key, 'igual').ciphertext).not.toBe(seal(key, 'igual').ciphertext)
  })

  it('a changed ciphertext, author, epoch or stream is refused: the signature binds the header', () => {
    const key = newChannelKey()
    const sealed = seal(key, 'orçamento aprovado')
    const flipped = Buffer.from(sealed.ciphertext, 'base64')
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1
    expect(codeOf(() => open({ ...sealed, ciphertext: flipped.toString('base64') }, key))).toBe('BAD_SIGNATURE')
    expect(codeOf(() => open({ ...sealed, authorId: 'caio' }, key))).toBe('BAD_SIGNATURE')
    expect(codeOf(() => open({ ...sealed, epoch: 2 }, key))).toBe('BAD_SIGNATURE')
    expect(codeOf(() => open(sealed, key, ana, 'channel:atendimento'))).toBe('BAD_SIGNATURE') // moved to another channel
  })

  it('somebody else\'s key or signature does not pass', () => {
    const key = newChannelKey()
    const sealed = seal(key, 'segredo')
    expect(codeOf(() => open(sealed, key, bia))).toBe('BAD_SIGNATURE') // not signed by who the roster says
    expect(codeOf(() => open(sealed, newChannelKey()))).toBe('BAD_CIPHERTEXT') // signature fine, wrong key: cannot read
    expect(codeOf(() => open({ ...sealed, ciphertext: '###' }, key))).toBe('BAD_CIPHERTEXT')
    expect(codeOf(() => seal(Buffer.alloc(16), 'curta'))).toBe('BAD_KEY')
  })
})

describe('the edge verifies WHO signed, without any key (WebCrypto, same bytes as the host)', () => {
  it('agrees with the host: true for the author, false for everything else, and never throws on garbage', async () => {
    const key = newChannelKey()
    const sealed = seal(key, 'olá')
    const context = { workspaceId: WS, streamId: CHANNEL }
    expect(await verifySealedSignature(sealed, context, ana.signing.publicKey)).toBe(true)
    expect(await verifySealedSignature(sealed, context, bia.signing.publicKey)).toBe(false)
    expect(await verifySealedSignature(sealed, { ...context, streamId: 'channel:outro' }, ana.signing.publicKey)).toBe(false)
    expect(await verifySealedSignature({ ...sealed, epoch: 9 }, context, ana.signing.publicKey)).toBe(false)
    expect(await verifySealedSignature({ ...sealed, sig: 'xx' }, context, ana.signing.publicKey)).toBe(false)
    expect(await verifySealedSignature({ ...sealed, ciphertext: '%%%' }, context, ana.signing.publicKey)).toBe(false)
    expect(await verifySealedSignature(sealed, context, 'nao-e-uma-chave')).toBe(false)
  })
})

describe('the key wrap', () => {
  const context = (recipientId: string, epoch = 1): WrapContext => ({ workspaceId: WS, channelId: CHANNEL, epoch, recipientId, by: 'ana' })
  const wrapFor = (key: Buffer, who: Identity, recipientId: string, epoch = 1) =>
    wrapChannelKey(context(recipientId, epoch), { key, recipientAgreementPublic: who.agreement.publicKey, signingSeed: ana.signing.seed })
  const unwrap = (wrap: ReturnType<typeof wrapFor>, who: Identity, recipientId: string, epoch = 1, wrapper: Identity = ana) =>
    unwrapChannelKey(wrap, context(recipientId, epoch), {
      agreementSecret: who.agreement.secret, agreementPublic: who.agreement.publicKey, wrapperSigningPublic: wrapper.signing.publicKey,
    })

  it('opens for its recipient and gives back the very same channel key', () => {
    const key = newChannelKey()
    expect(unwrap(wrapFor(key, bia, 'bia'), bia, 'bia').equals(key)).toBe(true)
  })

  it('never carries the key in the clear, and two wraps of the same key differ (ephemeral agreement)', () => {
    const key = newChannelKey()
    const first = wrapFor(key, bia, 'bia')
    const second = wrapFor(key, bia, 'bia')
    expect(JSON.stringify(first)).not.toContain(key.toString('base64'))
    expect(JSON.stringify(first)).not.toContain(key.toString('base64url'))
    expect(first.ct).not.toBe(second.ct)
    expect(first.epk).not.toBe(second.epk)
  })

  it('only its recipient opens it; moved to another recipient, channel or epoch, or from another wrapper, it is refused', () => {
    const key = newChannelKey()
    const wrap = wrapFor(key, bia, 'bia')
    expect(codeOf(() => unwrap(wrap, caio, 'bia'))).toBe('BAD_WRAP') // somebody else's private key
    expect(codeOf(() => unwrap(wrap, bia, 'caio'))).toBe('BAD_WRAP') // the recipient id is bound
    expect(codeOf(() => unwrap(wrap, bia, 'bia', 1, caio))).toBe('BAD_WRAP') // not signed by who the roster says is the wrapper
    expect(codeOf(() => unwrap(wrap, bia, 'bia', 2))).toBe('WRONG_EPOCH')
    expect(codeOf(() => unwrapChannelKey(wrap, { ...context('bia'), channelId: 'channel:outro' }, {
      agreementSecret: bia.agreement.secret, agreementPublic: bia.agreement.publicKey, wrapperSigningPublic: ana.signing.publicKey,
    }))).toBe('BAD_WRAP')
    expect(codeOf(() => unwrap({ ...wrap, ct: 'AAAA' }, bia, 'bia'))).toBe('BAD_WRAP')
  })
})

describe('a team over time (the keyring and the epoch)', () => {
  it('a new member reads what is sent while they are in; a removed one cannot read the next epoch', () => {
    const channelKeyV1 = newChannelKey()
    const wrapCtx = (recipientId: string, epoch: number): WrapContext => ({ workspaceId: WS, channelId: CHANNEL, epoch, recipientId, by: 'ana' })

    // epoch 1: Ana creates the channel and admits Bia and Caio
    const keyring = { ana: new ChannelKeyring(), bia: new ChannelKeyring(), caio: new ChannelKeyring() }
    keyring.ana.put(CHANNEL, 1, channelKeyV1)
    for (const [id, who] of [['bia', bia], ['caio', caio]] as const) {
      const wrap = wrapChannelKey(wrapCtx(id, 1), { key: channelKeyV1, recipientAgreementPublic: publicIdentity(who).agreement, signingSeed: ana.signing.seed })
      keyring[id].put(CHANNEL, 1, unwrapChannelKey(wrap, wrapCtx(id, 1), {
        agreementSecret: who.agreement.secret, agreementPublic: who.agreement.publicKey, wrapperSigningPublic: ana.signing.publicKey,
      }))
    }
    const hello = seal(keyring.ana.latest(CHANNEL)!.key, 'Bem-vindos!', 1)
    expect(open(hello, keyring.bia.latest(CHANNEL)!.key)).toBe('Bem-vindos!')
    expect(open(hello, keyring.caio.latest(CHANNEL)!.key)).toBe('Bem-vindos!')

    // Caio leaves: Ana rotates to epoch 2 and wraps the new key ONLY for Bia
    const channelKeyV2 = newChannelKey()
    keyring.ana.put(CHANNEL, 2, channelKeyV2)
    const wrapBia = wrapChannelKey(wrapCtx('bia', 2), { key: channelKeyV2, recipientAgreementPublic: bia.agreement.publicKey, signingSeed: ana.signing.seed })
    keyring.bia.put(CHANNEL, 2, unwrapChannelKey(wrapBia, wrapCtx('bia', 2), {
      agreementSecret: bia.agreement.secret, agreementPublic: bia.agreement.publicKey, wrapperSigningPublic: ana.signing.publicKey,
    }))
    const secret = seal(keyring.ana.latest(CHANNEL)!.key, 'Só para quem ficou.', 2)

    expect(keyring.ana.latest(CHANNEL)?.epoch).toBe(2)
    expect(open(secret, keyring.bia.get(CHANNEL, 2)!)).toBe('Só para quem ficou.')
    expect(keyring.caio.get(CHANNEL, 2)).toBeUndefined() // he never got the key of epoch 2
    expect(codeOf(() => open(secret, keyring.caio.get(CHANNEL, 1)!))).toBe('BAD_CIPHERTEXT') // the old key does not open the new epoch
    expect(open(hello, keyring.caio.get(CHANNEL, 1)!)).toBe('Bem-vindos!') // what he already had stays readable to him
  })

  it('the keyring keeps channels apart, returns the newest epoch and forgets a channel on drop', () => {
    const ring = new ChannelKeyring()
    const one = newChannelKey()
    const two = newChannelKey()
    ring.put('channel:a', 1, one)
    ring.put('channel:a', 3, two)
    ring.put('channel:b', 1, one)
    expect(ring.latest('channel:a')).toMatchObject({ epoch: 3 })
    expect(ring.latest('channel:a')?.key.equals(two)).toBe(true)
    ring.drop('channel:a')
    expect(ring.latest('channel:a')).toBeUndefined()
    expect(ring.latest('channel:b')?.epoch).toBe(1)
  })
})
