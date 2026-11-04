# persona-edge

Cloudflare side of Persona remote teams (D-034): a Worker (invites/auth, public webhook receiver), one Durable Object per workspace
(single orderer of per-stream sequence numbers, WebSocket with hibernation), D1 (event log, shared projections) and R2 (artifacts).
Local-first: the desktop SQLite stays the source of truth; DMs and private streams never leave the device unless explicitly shared.
Contract: persona-spec/contracts/sync.md (Forge). Client: packages/persona/persona-sync (Anvil).

Local only for now: `pnpm --filter @deepseek-ai/dsh-persona-edge dev` (wrangler local simulators). **No Cloudflare account, secret or deploy** without the CTO's release. Never `wrangler login`.

Deploy (quando o Atlas liberar): `persona-spec/CLOUDFLARE-DEPLOY.md`. Sem conta: `pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry`.

`WorkspaceHub` is the only sequencer (`seq === head+1` or `SEQ_GAP`). DMs/private need `shared: true`. GitHub webhooks are HMAC-verified, then become `WebhookEnvelope` on the workspace DO. Attachments go to R2. Tests: `pnpm exec vitest run apps/persona-edge`.
