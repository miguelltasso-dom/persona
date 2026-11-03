/** Persona host service and authenticated Remote controller. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { PingResult } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persona Remote controller. */
    personaHost: PersonaHost
  }
}

/** Remote protocol revision; bump on incompatible Remote changes. */
export const PERSONA_PROTOCOL = 1

/** Persona domain methods for the authenticated owner and invited peers. */
export default class PersonaHost extends TypertRemoteService {
  static inject = ['typert']

  constructor(ctx: Context) {
    super(ctx, 'personaHost', { namespace: 'persona' })
  }

  /**
   * Probe that the Persona host half is mounted.
   * @returns the product marker and protocol revision.
   */
  @Remote
  ping(): PingResult {
    return { ok: true, product: 'persona', protocol: PERSONA_PROTOCOL }
  }
}
