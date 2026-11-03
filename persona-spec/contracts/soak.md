# Soak 7 dias (relógio falso)

Dono da simulação e da suíte: **Forge** (`packages/persona/persona-engine/src/soak/sim.ts`, `tests/contract/soak.contract.ts`).
Persistência SQLite: **Anvil** — mesma suíte, fábrica que devolve `SoakPersistence` por projeto.

```ts
defineSoakSuite((projectId, clock) => ({
  projectId,
  repo,          // Repositories SQLite do projeto
  retention,     // SqliteRetention
  outbox,        // send/status/withdraw/pending/history
}), 'sqlite')
```

Memória: `openMemorySoak`. Semente `0x50A7`. 7 dias × 3 projetos × 5 personas. Sem `Atlas` no código.
