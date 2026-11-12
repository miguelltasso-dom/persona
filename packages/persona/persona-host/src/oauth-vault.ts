/**
 * Item 26, wave B (host): the OAuth credentials of MCP servers live in the Cofre, sealed by DPAPI, and the host is the only reader.
 *
 * Two halves, on purpose:
 *   - the SECRET (access token, refresh token) goes to a sealed slot `oauth:<provider>:<account>` and never leaves the host;
 *   - the METADATA (provider, account, scope, expiry) is not a secret and lives in `screen_doc` (`oauth_credential`), so the screen lists
 *     what is connected without decrypting anything.
 *
 * The refresh is serialized per credential: a provider that runs refresh tokens refuses the second attempt, so two rotations of the same
 * connection never race — the second waits for the first and reads its result.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { CofreSecrets } from '@deepseek-ai/dsh-persona-vault'

/** `screen_doc` kind of the non-secret metadata of one OAuth credential. */
export const OAUTH_CREDENTIAL_DOC = 'oauth_credential'

/** Prefix of the sealed slot of an OAuth credential. */
export const OAUTH_SLOT_PREFIX = 'oauth:'

/** The tokens of one connection. Never logged, never in a view. */
export interface OAuthTokenSet {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly tokenType?: string
  /** ISO instant the access token stops working; absent when the provider does not say. */
  readonly expiresAt?: string
  readonly scope?: string
}

/** What the screen reads: who is connected, never a token. */
export interface OAuthCredentialView {
  readonly provider: string
  /** Who the person connected as (an e-mail or a label the provider gave), never a secret. */
  readonly account: string
  readonly scope?: string
  readonly expiresAt?: string
  readonly updatedAt: string
}

/** A refused rotation: the message is the sentence the caller shows. */
export class OAuthVaultError extends Error {}

/** What the vault needs. */
export interface OAuthVaultDeps {
  readonly screens: ScreenRepos
  readonly secrets: CofreSecrets
  readonly now?: () => string
}

/**
 * @param provider - The MCP server's host (`mcp.notion.com`).
 * @param account - Who the person connected as.
 * @returns The sealed slot of that connection.
 */
export function oauthSlot(provider: string, account: string): string {
  return `${OAUTH_SLOT_PREFIX}${provider}:${account}`
}

/**
 * The OAuth credentials of every project.
 */
export class OAuthVault {
  private readonly deps: OAuthVaultDeps
  private readonly now: () => string
  /** One rotation at a time per credential: the promise of the one in flight. */
  private readonly rotations = new Map<string, Promise<OAuthTokenSet>>()

  /**
   * @param deps - Metadata store, sealed slots and clock.
   */
  constructor(deps: OAuthVaultDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => new Date().toISOString())
  }

  /**
   * @param projectId - Tenant.
   * @returns Every connection of the project, metadata only (never a token).
   */
  list(projectId: string): OAuthCredentialView[] {
    return this.deps.screens.list<OAuthCredentialView>(projectId, OAUTH_CREDENTIAL_DOC)
  }

  /**
   * Seal a token set and keep its metadata.
   * @param projectId - Tenant.
   * @param input - Provider, account and the tokens the provider answered.
   * @returns The stored metadata.
   */
  async save(projectId: string, input: { readonly provider: string; readonly account: string; readonly tokens: OAuthTokenSet }): Promise<OAuthCredentialView> {
    const provider = input.provider.trim()
    const account = input.account.trim()
    if (provider === '' || account === '') throw new OAuthVaultError('Diga de qual serviço e de qual conta é o acesso.')
    if (input.tokens.accessToken === '') throw new OAuthVaultError('O serviço não devolveu um acesso válido.')
    await this.deps.secrets.put(projectId, oauthSlot(provider, account), JSON.stringify(input.tokens))
    const view: OAuthCredentialView = {
      provider,
      account,
      ...(input.tokens.scope === undefined ? {} : { scope: input.tokens.scope }),
      ...(input.tokens.expiresAt === undefined ? {} : { expiresAt: input.tokens.expiresAt }),
      updatedAt: this.now(),
    }
    this.deps.screens.put(projectId, OAUTH_CREDENTIAL_DOC, oauthSlot(provider, account), view)
    return view
  }

  /**
   * Host-only: the tokens of one connection. Never a remote, never a prompt.
   * @param projectId - Tenant.
   * @param provider - The MCP server's host.
   * @param account - Who the person connected as.
   * @returns The token set, or undefined when nothing is sealed.
   */
  async tokens(projectId: string, provider: string, account: string): Promise<OAuthTokenSet | undefined> {
    const sealed = await this.deps.secrets.read(projectId, oauthSlot(provider, account))
    if (sealed === undefined) return undefined
    try {
      const parsed: unknown = JSON.parse(sealed)
      if (typeof parsed !== 'object' || parsed === null || !('accessToken' in parsed) || typeof parsed.accessToken !== 'string' || parsed.accessToken === '') {
        throw new OAuthVaultError('O acesso guardado está ilegível; entre de novo no serviço.')
      }
      return parsed as OAuthTokenSet
    } catch (error) {
      if (error instanceof OAuthVaultError) throw error
      throw new OAuthVaultError('O acesso guardado está ilegível; entre de novo no serviço.')
    }
  }

  /**
   * Refresh one connection. The provider runs the refresh token once, so a second call for the same connection WAITS for the first and
   * receives its result instead of racing it.
   * @param projectId - Tenant.
   * @param provider - The MCP server's host.
   * @param account - Who the person connected as.
   * @param refresh - Does the network call and returns the new token set.
   * @returns The fresh tokens.
   */
  async rotate(
    projectId: string,
    provider: string,
    account: string,
    refresh: (current: OAuthTokenSet) => Promise<OAuthTokenSet>,
  ): Promise<OAuthTokenSet> {
    const key = `${projectId}\0${oauthSlot(provider, account)}`
    const inFlight = this.rotations.get(key)
    if (inFlight !== undefined) return inFlight
    const run = (async (): Promise<OAuthTokenSet> => {
      const current = await this.tokens(projectId, provider, account)
      if (current === undefined) throw new OAuthVaultError('Essa conexão não está mais guardada; entre de novo no serviço.')
      const next = await refresh(current)
      await this.save(projectId, { provider, account, tokens: next })
      return next
    })().finally(() => { this.rotations.delete(key) })
    this.rotations.set(key, run)
    return run
  }

  /**
   * Forget a connection: the sealed slot and its metadata.
   * @param projectId - Tenant.
   * @param provider - The MCP server's host.
   * @param account - Who the person connected as.
   */
  async drop(projectId: string, provider: string, account: string): Promise<void> {
    await this.deps.secrets.drop(projectId, oauthSlot(provider, account))
    this.deps.screens.delete(projectId, OAUTH_CREDENTIAL_DOC, oauthSlot(provider, account))
  }
}
