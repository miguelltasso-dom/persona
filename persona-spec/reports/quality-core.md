# Qualidade do núcleo (Forge, 03/11 18:10)

Shuffle 5× (`--sequence.shuffle`, sementes 1 / 17 / 42 / 99 / 2026) em persona-core, engine, store, host, runners, usage. Coverage v8 já no repo; sem dependência nova. Meta: 85% linhas / 80% ramos.

## Shuffle

| Pacote | 5/5 | Nota |
|---|---|---|
| persona-core | estável | 0 falha nas 5 sementes |
| persona-engine | estável | timeouts de git (worktree/review) subidos a 45 s; sem falha de ordem |
| persona-store | estável | 0 falha nas 5 sementes |
| persona-runners | estável | 0 falha nas 5 sementes |
| persona-usage | estável | 0 falha nas 5 sementes |
| persona-host | **instável** | dono: **Anvil**. Relógio real: `ready.spec` exige reopen &lt; 1,5 s (viu 4,2 s). Demais: timeout padrão 5 s ao montar `PersonaHost` / abrir DB / git — o conjunto que falha muda com a semente (load + ordem). |

Forge não editou persona-host.

## Coverage (vitest --coverage, provider v8)

| Módulo | Linhas | Ramos | Meta | Ação |
|---|---:|---:|---|---|
| `persona-core` `acl.ts` / `can()` | 86,6 | 89,1 | ok | + casos guest/proposal/routine/dmIds |
| `persona-core` `vault-propose.ts` | 100 | 93,8 | ok | + credencial, workspace alheio, apply mismatch |
| `persona-core` sync (`policy`/`webhook`/`memory`) | 90–100 | 83–100 | ok | + `IdentityCipher.open`, head vazio |
| `persona-engine` `outbox.ts` | 100 | 77,8* | ramos | + clock default e `pass` em id não-pending |
| `persona-engine` `effects.ts` | 98,6 | 87,5 | ok | + generation / ordered / attempts |
| `persona-engine` `executor/confine.ts` | 100 | 96,8 | ok | `confine.spec.ts` (segment/absolute/NUL) |
| `persona-engine` `review/git.ts` | 94,7 | 71,7* | ramos | + `parseNumstat`, requestChanges sem engine |
| `persona-engine` `review/redact.ts` | 100 | 83,3 | ok | — |
| `persona-engine` `retention.ts` | 100 | 95,8 | ok | + tipo sem janela / re-arquivo |
| `persona-store` `engine/effects.ts` | 83,9 | 61,1 | abaixo | **Anvil** |
| `persona-store` `engine/outbox.ts` | 94,4 | 75,0 | ramos | **Anvil** |
| `persona-store` `sync/log.ts` | 100 | 78,6 | ramos | **Anvil** |

\* medido antes dos testes extras de outbox/parseNumstat; linhas já na meta.

## Como reproduzir

```
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine --sequence.shuffle --sequence.seed 42
pnpm exec vitest run packages/persona/persona-core/tests/acl.spec.ts … --coverage.enabled --coverage.provider=v8 --coverage.thresholds.lines=0
```
