import { describe, expect, it } from 'vitest'
import {
  avatarUploadHostReady,
  messageAttachmentsHostReady,
} from '../src/client/chat/resolve-composer-host-ready.ts'

describe('resolveComposerHostReady', () => {
  it('detects Anvil attachment RPC on the remote client', () => {
    expect(messageAttachmentsHostReady({})).toBe(false)
    expect(messageAttachmentsHostReady({ attachFile: () => {} })).toBe(true)
    expect(avatarUploadHostReady({ uploadPersonaAvatar: async () => ({}) })).toBe(true)
  })
})
