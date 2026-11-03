# Persona app bench (Probe)

Registro de boot e ociosidade — host real perfil `persona`. Meta Vigia: **CPU ociosa ~0%** (sem busy-loop; PRO rest = sem IA).

## Web (Tier 1)

| Medida | Valor | Notas |
|--------|-------|-------|
| Shell ready (cold) | _ver `PERSONA_BENCH=1 vitest app-bench.spec.ts`_ | `[data-persona-shell]` após `goto` |
| Shell ready (warm) | _idem_ | após `reload` |
| Memória renderer 5 min ocioso | _pending_ | requer amostragem processo Chrome/Electron |
| CPU média 60 s ocioso | _pending_ | gate: falha se > 2% com fake runners (Anvil scheduler) |

## Desktop (Tier 2)

| Medida | Valor | Notas |
|--------|-------|-------|
| Shell ready CDP | _pending_ | `smoke-desktop` duração ~248 s inclui boot |
| Ociosidade 5 min | _pending_ | não paralelizar com web host (lock) |

## Comandos

```sh
node scripts/persona/with-lock.mjs "Probe bench web" --release-on "dsh web:" -- env PERSONA_BENCH=1 pnpm exec vitest run packages/persona/persona-e2e/tests/app-bench.spec.ts
```

_Última atualização: 2026-11-03 Probe (estrutura inicial; preencher após primeira corrida)._
