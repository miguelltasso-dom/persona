# @deepseek-ai/dsh-persona-sync

Desktop side of remote teams (D-034): outbox of shared streams to the edge Durable Object, pull by per-stream cursor, offline resume. Owner: Anvil. Protocol: persona-spec/contracts/sync.md (Forge).

`HttpTransport.after` throws `SyncTransportError` when replay is refused, unavailable or malformed. A successful empty replay returns `[]`; revoked membership is never reported as an empty channel. The host composition in `persona-host/src/remote-team.ts` persists replay state and presents revocation separately from offline retry.
