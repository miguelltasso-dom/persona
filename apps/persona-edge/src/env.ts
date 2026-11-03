/**
 * Worker bindings declared in wrangler.toml.
 */

/** Cloudflare bindings for persona-edge. */
export interface Env {
  readonly WORKSPACE_HUB: DurableObjectNamespace
  readonly DB: D1Database
  readonly BLOBS: R2Bucket
  readonly GITHUB_WEBHOOK_SECRET: string
}
